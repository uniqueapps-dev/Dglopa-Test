/**
 * DGLOPA PLATFORM — DEMAND QUICK CAPTURE
 * DT-007: Ultra-fast demand entry — minimal typing, live product matching,
 * optional evidence (image/prescription/pack photo).
 *
 * Design goal: pharmacist can log a demand entry in under 10 seconds.
 */

import {
  captureDemand, DEMAND_REASONS, CUSTOMER_TYPES, EVIDENCE_TYPES,
  readFileAsDataURL,
} from '../../services/demandService.js';
import { matchProductForLine } from '../../services/receivingLineService.js';
import { toast }               from '../../components/toast.js';
import { debounce }            from '../../utils/helpers.js';

// ================================================================
// QUICK CAPTURE MODAL BODY
// ================================================================

export function buildQuickCaptureForm() {
  const reasonOptions = DEMAND_REASONS.map((r) =>
    `<option value="${_e(r)}"${r === 'Out of Stock' ? ' selected' : ''}>${_e(r)}</option>`
  ).join('');

  const customerOptions = ['', ...CUSTOMER_TYPES].map((t) =>
    `<option value="${_e(t)}">${t || 'Not specified'}</option>`
  ).join('');

  return `
    <div id="qc-error" class="form-error-banner" style="display:none"></div>
    <div id="qc-match-banner" class="ime-readiness-banner" style="display:none"></div>

    <!-- Product name — primary field, auto-focused -->
    <div class="form-group">
      <label class="form-label" for="qc-product">Product Requested <span class="req">*</span></label>
      <input class="form-input" id="qc-product" type="text" autocomplete="off"
             spellcheck="false" placeholder="Type product name…" autofocus>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="qc-req-qty">Requested</label>
        <input class="form-input" id="qc-req-qty" type="number" min="1" value="1" inputmode="numeric">
      </div>
      <div class="form-group">
        <label class="form-label" for="qc-sup-qty">Supplied</label>
        <input class="form-input" id="qc-sup-qty" type="number" min="0" value="0" inputmode="numeric">
      </div>
    </div>

    <div class="form-group">
      <label class="form-label" for="qc-reason">Reason</label>
      <select class="form-select" id="qc-reason">${reasonOptions}</select>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="qc-price">Est. Price (₦)</label>
        <input class="form-input" id="qc-price" type="number" min="0" step="0.01"
               inputmode="decimal" placeholder="Optional">
      </div>
      <div class="form-group">
        <label class="form-label" for="qc-customer">Customer Type</label>
        <select class="form-select" id="qc-customer">${customerOptions}</select>
      </div>
    </div>

    <!-- Evidence capture -->
    <div class="form-section-label">Evidence (optional)</div>
    <div class="qc-evidence-row">
      <button type="button" class="btn btn-secondary btn-sm" id="qc-photo-btn">
        📷 Photo
      </button>
      <button type="button" class="btn btn-secondary btn-sm" id="qc-file-btn">
        📎 Attach
      </button>
    </div>
    <input type="file" id="qc-file-input" accept="image/*" style="display:none" capture="environment">
    <input type="file" id="qc-attach-input" accept="image/*,application/pdf" style="display:none">

    <div id="qc-evidence-preview" style="display:none;margin-top:var(--sp-2)">
      <div class="qc-evidence-card">
        <div class="d-flex justify-between align-center">
          <span class="text-xs text-muted" id="qc-evidence-label">Evidence attached</span>
          <button class="btn btn-ghost btn-sm" id="qc-evidence-remove" style="color:var(--clr-red)">✕</button>
        </div>
        <img id="qc-evidence-img" style="max-width:100%;margin-top:var(--sp-2);border-radius:var(--radius-sm);display:none">
        <div class="form-group" style="margin-top:var(--sp-2)">
          <label class="form-label" for="qc-evidence-notes">Evidence Notes / OCR Text</label>
          <textarea class="form-input" id="qc-evidence-notes" rows="2"
                    placeholder="Transcribe any text visible in the image…"></textarea>
        </div>
      </div>
    </div>

    <div class="form-group" style="margin-top:var(--sp-2)">
      <label class="form-label" for="qc-notes">Notes</label>
      <textarea class="form-input" id="qc-notes" rows="2"
                placeholder="Optional — extra context"></textarea>
    </div>

    <div class="form-actions">
      <button type="button" class="btn btn-secondary" id="qc-cancel-btn">Cancel</button>
      <button type="button" class="btn btn-primary" id="qc-save-btn">Log Demand</button>
    </div>
  `;
}

// ================================================================
// WIRE THE QUICK CAPTURE FORM
// ================================================================

/**
 * Wire all interactions on a rendered quick capture form.
 * @param {HTMLElement} container — the modal or panel containing the form
 * @param {function}    onSaved   — called after successful save
 * @param {function}    onCancel  — called on cancel
 */
export function wireQuickCapture(container, onSaved, onCancel) {
  let _evidenceData = null;
  let _evidenceType = null;

  // ---- Live product match ----
  const productInput  = container.querySelector('#qc-product');
  const matchBanner   = container.querySelector('#qc-match-banner');
  const debouncedMatch = debounce(async () => {
    const name = productInput.value.trim();
    if (!name) { matchBanner.style.display = 'none'; return; }
    const result = await matchProductForLine(name);
    if (result) {
      matchBanner.textContent = `✓ Matched: ${result.productName} (${result.confidence})`;
      matchBanner.className   = 'ime-readiness-banner ready';
    } else {
      matchBanner.textContent = 'No match — will log as unknown product.';
      matchBanner.className   = 'ime-readiness-banner blocked';
    }
    matchBanner.style.display = 'block';
  }, 350);
  productInput?.addEventListener('input', debouncedMatch);

  // ---- Evidence: camera capture ----
  const photoBtn   = container.querySelector('#qc-photo-btn');
  const fileInput  = container.querySelector('#qc-file-input');
  const attachBtn  = container.querySelector('#qc-file-btn');
  const attachInput = container.querySelector('#qc-attach-input');

  photoBtn?.addEventListener('click', () => fileInput?.click());
  attachBtn?.addEventListener('click', () => attachInput?.click());

  const handleFile = async (file, type) => {
    try {
      const dataURL = await readFileAsDataURL(file);
      _evidenceData = dataURL;
      _evidenceType = type;

      const preview  = container.querySelector('#qc-evidence-preview');
      const labelEl  = container.querySelector('#qc-evidence-label');
      const imgEl    = container.querySelector('#qc-evidence-img');

      labelEl.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      if (file.type.startsWith('image/')) {
        imgEl.src = dataURL;
        imgEl.style.display = 'block';
      } else {
        imgEl.style.display = 'none';
      }
      preview.style.display = 'block';
    } catch (err) {
      toast('Failed to read evidence file.', 'error');
    }
  };

  fileInput?.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f, f.type.includes('image') ? 'image' : 'prescription');
    fileInput.value = '';
  });
  attachInput?.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f, f.name.toLowerCase().endsWith('.pdf') ? 'prescription' : 'pack');
    attachInput.value = '';
  });

  container.querySelector('#qc-evidence-remove')?.addEventListener('click', () => {
    _evidenceData = null;
    _evidenceType = null;
    container.querySelector('#qc-evidence-preview').style.display = 'none';
    container.querySelector('#qc-evidence-img').src = '';
  });

  // ---- Cancel ----
  container.querySelector('#qc-cancel-btn')?.addEventListener('click', onCancel);

  // ---- Save ----
  container.querySelector('#qc-save-btn')?.addEventListener('click', async () => {
    const saveBtn  = container.querySelector('#qc-save-btn');
    const errorEl  = container.querySelector('#qc-error');
    errorEl.style.display = 'none';

    const productName   = container.querySelector('#qc-product')?.value.trim();
    if (!productName) {
      errorEl.textContent = 'Product name is required.';
      errorEl.style.display = 'block';
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      const id = await captureDemand({
        productName,
        requestedQty:   container.querySelector('#qc-req-qty')?.value,
        suppliedQty:    container.querySelector('#qc-sup-qty')?.value,
        reason:         container.querySelector('#qc-reason')?.value,
        estimatedPrice: container.querySelector('#qc-price')?.value || null,
        customerType:   container.querySelector('#qc-customer')?.value || null,
        notes:          container.querySelector('#qc-notes')?.value,
        evidenceData:   _evidenceData,
        evidenceType:   _evidenceType,
        evidenceNotes:  container.querySelector('#qc-evidence-notes')?.value || '',
        source:         'manual',
      });

      toast(`Demand logged — ${id}`, 'success');
      onSaved(id);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Log Demand';
    }
  });
}

function _e(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
