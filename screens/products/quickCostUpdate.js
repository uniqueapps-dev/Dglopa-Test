/**
 * DGLOPA PLATFORM — QUICK REPLACEMENT COST UPDATE (DT-004A)
 *
 * Provides the fastest possible workflow for updating a product's
 * replacement cost from any OCP-001 entry point.
 *
 * Design contract:
 *   ≤ 5 seconds from open to saved.
 *   Two taps maximum after the modal opens.
 *   One-handed operation — save button at the bottom, within thumb reach.
 *
 * Service contract:
 *   All writes go through CommercialProfileService.updateReplacementCostManual().
 *   No direct DB writes.
 *   No pricing calculations.
 *   No automatic selling price changes.
 *   On save: creates ReplacementCostSnapshot, sets PricingStatus → ReviewRequired.
 *
 * Entry points:
 *   openQuickCostUpdate(productId, productName, options)
 *
 *   Options:
 *     onSaved  — callback(updatedProfile) after successful save
 *     onCancel — callback() if dismissed without saving
 *
 * Future hook:
 *   The exported openQuickCostUpdate() function is the single entry point.
 *   Future search-result actions should call this function directly — no
 *   additional code changes required in this file.
 */

import { updateReplacementCostManual, getProfile } from '../../services/commercialProfileService.js';
import { openModal, closeModal }                   from '../../components/modal.js';
import { toast }                                   from '../../components/toast.js';
import { formatNaira }                             from '../../utils/helpers.js';
import { db }                                      from '../../db/database.js';

// ================================================================
// PUBLIC ENTRY POINT
// ================================================================

/**
 * Open the Quick Replacement Cost Update modal.
 *
 * @param {string}   productId    — the product to update
 * @param {string}   productName  — for display in the modal title
 * @param {object}   [options]
 *   onSaved(profile)  — called after a successful update
 *   onCancel()        — called when dismissed without saving
 */
export async function openQuickCostUpdate(productId, productName, {
  onSaved  = null,
  onCancel = null,
} = {}) {
  // Load current commercial profile and supplier list in parallel
  const [currentProfile, suppliers] = await Promise.all([
    getProfile(productId),
    db.Suppliers
      .where('status').equals('Active')
      .toArray()
      .catch(() => []),
  ]);

  const snap       = currentProfile?.replacementCostSnapshot;
  const prevAmount = snap?.amount ?? null;

  const modal = openModal({
    id:      'quick-cost-update',
    title:   'Update Replacement Cost',
    bodyHTML: _buildForm(productName, prevAmount, snap, suppliers),
  });

  _wireForm(modal, productId, productName, prevAmount, onSaved, onCancel);
}

// ================================================================
// FORM BUILDER
// ================================================================

function _buildForm(productName, prevAmount, snap, suppliers) {
  const supplierOptions = suppliers.length > 0
    ? suppliers.map((s) =>
        `<option value="${_e(s.id)}"${snap?.supplierId === s.id ? ' selected' : ''}>${_e(s.supplierName)}</option>`
      ).join('')
    : '<option value="">No suppliers on record</option>';

  const prevDisplay = prevAmount != null
    ? `<div class="qcu-prev-cost">
         Current: <span class="fw-medium text-accent">${formatNaira(prevAmount)}</span>
         ${snap?.confidence ? `<span class="text-xs text-muted">(${_e(snap.confidence)})</span>` : ''}
       </div>`
    : `<div class="qcu-prev-cost text-muted">No replacement cost on record.</div>`;

  return `
    <!-- Product name sub-heading -->
    <div class="qcu-product-name">${_e(productName)}</div>
    ${prevDisplay}

    <div id="qcu-error" class="form-error-banner" style="display:none"></div>

    <!-- ── COST AMOUNT — primary field, autofocused ─────────── -->
    <div class="form-group" style="margin-top:var(--sp-4)">
      <label class="form-label" for="qcu-amount">
        Replacement Cost (₦) <span class="req">*</span>
      </label>
      <input
        class="form-input qcu-amount-input"
        id="qcu-amount"
        type="number"
        inputmode="decimal"
        min="0"
        step="0.01"
        placeholder="0.00"
        autofocus
        value="${prevAmount != null ? prevAmount : ''}"
      >
    </div>

    <!-- ── SOURCE ──────────────────────────────────────────────── -->
    <div class="form-group">
      <label class="form-label" for="qcu-source">Source</label>
      <select class="form-select" id="qcu-source">
        <option value="manual">Manual Estimate</option>
        <option value="supplier_quote">Supplier Quote</option>
        <option value="market_survey">Market Survey</option>
      </select>
    </div>

    <!-- ── SUPPLIER ────────────────────────────────────────────── -->
    <div class="form-group">
      <label class="form-label" for="qcu-supplier">Supplier (optional)</label>
      <select class="form-select" id="qcu-supplier">
        <option value="">Not specified</option>
        ${supplierOptions}
      </select>
    </div>

    <!-- ── CONFIDENCE ──────────────────────────────────────────── -->
    <div class="form-group">
      <label class="form-label">Confidence</label>
      <div class="qcu-confidence-row">
        ${_confOption('High',   '✓ Verified quote or invoice')}
        ${_confOption('Medium', 'Estimated or unconfirmed', true)}
        ${_confOption('Low',    'Rough estimate only')}
      </div>
    </div>

    <!-- ── NOTES ───────────────────────────────────────────────── -->
    <div class="form-group">
      <label class="form-label" for="qcu-notes">Notes (optional)</label>
      <input
        class="form-input"
        id="qcu-notes"
        type="text"
        placeholder="e.g. Quicksave quote 2026-07-06"
        autocomplete="off"
      >
    </div>

    <!-- ── ACTIONS — save button at bottom for thumb reach ─────── -->
    <div class="form-actions qcu-actions">
      <button class="btn btn-secondary" id="qcu-cancel">Cancel</button>
      <button class="btn btn-primary" id="qcu-save">
        Update Cost
      </button>
    </div>
  `;
}

function _confOption(value, label, checked = false) {
  return `
    <label class="qcu-conf-label">
      <input type="radio" name="qcu-confidence" value="${value}"${checked ? ' checked' : ''}>
      <span class="qcu-conf-text">
        <span class="qcu-conf-value">${value}</span>
        <span class="qcu-conf-desc text-xs text-muted">${label}</span>
      </span>
    </label>`;
}

// ================================================================
// FORM WIRING
// ================================================================

function _wireForm(modal, productId, productName, prevAmount, onSaved, onCancel) {
  const amountInput = modal.querySelector('#qcu-amount');
  const errorEl     = modal.querySelector('#qcu-error');
  const saveBtn     = modal.querySelector('#qcu-save');

  // Cancel
  modal.querySelector('#qcu-cancel').addEventListener('click', () => {
    closeModal();
    onCancel?.();
  });

  // Highlight entire amount on focus for fast overwrite (one-handed UX)
  amountInput?.addEventListener('focus', () => amountInput.select());

  // Source → auto-set confidence when source changes
  modal.querySelector('#qcu-source')?.addEventListener('change', (e) => {
    const source = e.target.value;
    const confMap = {
      supplier_quote: 'High',
      market_survey:  'Medium',
      manual:         'Medium',
    };
    const target = confMap[source];
    if (target) {
      const radio = modal.querySelector(`input[name="qcu-confidence"][value="${target}"]`);
      if (radio) radio.checked = true;
    }
  });

  // Save
  saveBtn.addEventListener('click', async () => {
    errorEl.style.display = 'none';

    const rawAmount = parseFloat(modal.querySelector('#qcu-amount')?.value);
    if (isNaN(rawAmount) || rawAmount < 0) {
      errorEl.textContent = 'Please enter a valid replacement cost (₦0.00 or more).';
      errorEl.style.display = 'block';
      amountInput?.focus();
      return;
    }

    const supplierId   = modal.querySelector('#qcu-supplier')?.value   || null;
    const confidence   = modal.querySelector('input[name="qcu-confidence"]:checked')?.value || 'Medium';
    const notes        = modal.querySelector('#qcu-notes')?.value?.trim() || '';
    const sourceRaw    = modal.querySelector('#qcu-source')?.value || 'manual';

    // Resolve supplier name for snapshot
    let supplierName = null;
    if (supplierId) {
      const s = await db.Suppliers.get(supplierId).catch(() => null);
      supplierName = s?.supplierName ?? null;
    }

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';

    try {
      await updateReplacementCostManual(productId, rawAmount, {
        supplierId,
        supplierName,
        confirmed: confidence === 'High',
        notes:     [
          notes,
          `Source: ${sourceRaw.replace('_', ' ')}`,
        ].filter(Boolean).join(' | '),
      });

      // Reload profile for callback
      const updatedProfile = await getProfile(productId);

      toast(`Replacement cost updated — ${formatNaira(rawAmount)}`, 'success');
      closeModal();
      onSaved?.(updatedProfile);

    } catch (err) {
      errorEl.textContent = err.message || 'Update failed. Please try again.';
      errorEl.style.display = 'block';
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Update Cost';
    }
  });
}

// ================================================================
// HELPERS
// ================================================================

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
