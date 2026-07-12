/**
 * DGLOPA PLATFORM — RECEIVING SESSION SCREEN
 * DT-004: Manages an open receiving session — line entry, validation,
 * review, and commit.
 *
 * Sub-states within this screen:
 *   lines    — the invoice line list + entry form
 *   review   — review flagged lines before commit
 *   summary  — post-commit result display
 */

import { getSession, advanceStatus, SESSION_STATUSES } from '../../services/receivingSessionService.js';
import { validateLine, matchProductForLine }            from '../../services/receivingLineService.js';
import { commitReceivingSession }                       from '../../services/receivingCommitService.js';
import { toast }                                        from '../../components/toast.js';
import { openModal, closeModal }                        from '../../components/modal.js';
import { LoadingOverlay }                               from '../../components/loadingOverlay.js';
import { formatNaira, formatDate, debounce }            from '../../utils/helpers.js';
import { loadLookups }                                  from '../../services/lookupService.js';
import { db }                                           from '../../db/database.js';

// ---- Session-local state ----
let _sessionId  = null;
let _lines      = [];   // ReceivingLine[]
let _onBack     = null;
let _lineCounter = 0;

// ================================================================
// ENTRY POINT
// ================================================================

export async function renderSessionScreen(container, sessionId, onBack) {
  _sessionId   = sessionId;
  _lines       = [];
  _lineCounter = 0;
  _onBack      = onBack;
  await _renderLines(container);
}

// ================================================================
// LINES VIEW
// ================================================================

async function _renderLines(container) {
  const session = await getSession(_sessionId);
  if (!session) { toast('Session not found.', 'error'); _onBack(); return; }

  const isEditable = [SESSION_STATUSES.DRAFT, SESSION_STATUSES.IN_REVIEW].includes(session.status);

  container.innerHTML = `
    <div class="rx-session-header">
      <div class="d-flex justify-between align-center">
        <button class="btn btn-ghost btn-sm" id="rx-back-btn">← Back</button>
        <span class="badge ${_statusBadge(session.status)}">${_e(session.status)}</span>
      </div>
      <div class="section-title" style="margin:var(--sp-2) 0 0">${_e(session.invoiceNumber || session.id)}</div>
      <div class="text-muted text-xs">${_e(session.supplierName || 'No supplier')} · ${formatDate(session.receivedDate)}</div>
      <div class="text-mono text-xs" style="color:var(--clr-text-3)">${_e(session.id)}</div>
    </div>

    <!-- Line list -->
    <div id="rx-line-list" style="margin-top:var(--sp-4)"></div>

    <!-- Add line button -->
    ${isEditable ? `
    <button class="btn btn-secondary btn-full" id="rx-add-line-btn" style="margin-top:var(--sp-3)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Invoice Line
    </button>` : ''}

    <!-- Bottom actions -->
    <div class="form-actions" style="margin-top:var(--sp-5)">
      <button class="btn btn-secondary" id="rx-back-btn-2">Back</button>
      ${isEditable && _lines.length > 0 ? `
      <button class="btn btn-primary" id="rx-review-btn">Review &amp; Commit →</button>` : ''}
    </div>
  `;

  _renderLineList(container);

  container.querySelector('#rx-back-btn')?.addEventListener('click', _onBack);
  container.querySelector('#rx-back-btn-2')?.addEventListener('click', _onBack);
  container.querySelector('#rx-add-line-btn')?.addEventListener('click', () => _openLineModal(container));
  container.querySelector('#rx-review-btn')?.addEventListener('click', () => _renderReview(container));
}

function _renderLineList(container) {
  const listEl = container.querySelector('#rx-line-list');
  if (!listEl) return;

  if (_lines.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state" style="padding:var(--sp-8) 0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
        <div class="empty-state-title">No lines yet</div>
        <div class="empty-state-body">Tap Add Invoice Line to begin entering products.</div>
      </div>`;
    return;
  }

  listEl.innerHTML = _lines.map(_lineCard).join('');

  listEl.querySelectorAll('[data-line-idx]').forEach((el) => {
    const idx = parseInt(el.dataset.lineIdx, 10);
    el.querySelector('.rx-line-edit')?.addEventListener('click', () => _openLineModal(container, idx));
    el.querySelector('.rx-line-delete')?.addEventListener('click', () => {
      _lines.splice(idx, 1);
      _renderLineList(container);
      _refreshReviewBtn(container);
    });
  });
}

function _lineCard(line, idx) {
  const hasIssues = line.reviewReasons?.length > 0;
  const borderCls = hasIssues ? 'row-warning' : 'row-clean';
  return `
    <div class="ime-row-card ${borderCls}" data-line-idx="${idx}" style="margin-bottom:var(--sp-2)">
      <div class="d-flex justify-between align-center">
        <div class="fw-medium">${_e(line.productName || '(unnamed)')}</div>
        <div class="d-flex gap-2">
          <button class="btn btn-ghost btn-sm rx-line-edit" style="padding:2px 6px">✏️</button>
          <button class="btn btn-ghost btn-sm rx-line-delete" style="padding:2px 6px">🗑</button>
        </div>
      </div>
      ${line.matchedName && line.matchedName !== line.productName
        ? `<div class="text-xs" style="color:var(--clr-accent)">→ Matched: ${_e(line.matchedName)} (${_e(line.confidence)})</div>`
        : ''}
      <div class="ime-row-grid" style="margin-top:var(--sp-2)">
        <div class="ime-field"><span class="ime-field-label">Qty</span><span class="ime-field-value">${line.quantity || '—'} ${_e(line.unit || '')}</span></div>
        <div class="ime-field"><span class="ime-field-label">Unit Cost</span><span class="ime-field-value">${line.unitCost != null ? formatNaira(line.unitCost) : '—'}</span></div>
        <div class="ime-field"><span class="ime-field-label">Expiry</span><span class="ime-field-value">${line.expiryDate ? new Date(line.expiryDate).toLocaleDateString('en-NG') : '—'}</span></div>
        <div class="ime-field"><span class="ime-field-label">Shelf</span><span class="ime-field-value">${_e(line.shelfLocation || '—')}</span></div>
      </div>
      ${hasIssues ? `
      <div class="ime-row-issues">
        ${line.reviewReasons.map((r) => `<div class="ime-issue ime-issue-warning"><span class="ime-issue-cat">Review</span><span class="ime-issue-desc">${_e(r)}</span></div>`).join('')}
      </div>` : ''}
    </div>`;
}

function _refreshReviewBtn(container) {
  const btn = container.querySelector('#rx-review-btn');
  if (btn) btn.style.display = _lines.length > 0 ? '' : 'none';
}

// ================================================================
// LINE MODAL (Add / Edit)
// ================================================================

async function _openLineModal(container, editIdx = null) {
  const existing = editIdx != null ? _lines[editIdx] : null;
  const lookups  = await loadLookups();
  const v = existing ?? {};

  const unitOptions = lookups.units
    .map((u) => `<option value="${_e(u.name)}"${v.unit === u.name ? ' selected' : ''}>${_e(u.name)}</option>`)
    .join('');

  const modal = openModal({
    id:    'rx-line-modal',
    title: editIdx != null ? 'Edit Line' : 'Add Invoice Line',
    bodyHTML: `
      <div id="rx-line-error" class="form-error-banner" style="display:none"></div>
      <div id="rx-match-banner" style="display:none" class="ime-readiness-banner ready" style="margin-bottom:var(--sp-3)"></div>

      <div class="form-group">
        <label class="form-label" for="rl-product">Product Name <span class="req">*</span></label>
        <input class="form-input" id="rl-product" type="text" autocomplete="off"
               value="${_e(v.productName || '')}" placeholder="Type product name…">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="rl-qty">Quantity <span class="req">*</span></label>
          <input class="form-input" id="rl-qty" type="number" min="0" step="any"
                 value="${v.quantity || ''}" placeholder="0">
        </div>
        <div class="form-group">
          <label class="form-label" for="rl-unit">Unit</label>
          <select class="form-select" id="rl-unit">
            <option value="">Select…</option>
            ${unitOptions}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="rl-cost">Unit Cost (₦)</label>
          <input class="form-input" id="rl-cost" type="number" min="0" step="0.01"
                 value="${v.unitCost ?? ''}" placeholder="0.00">
        </div>
        <div class="form-group">
          <label class="form-label" for="rl-price">Selling Price (₦)</label>
          <input class="form-input" id="rl-price" type="number" min="0" step="0.01"
                 value="${v.sellingPrice ?? ''}" placeholder="0.00">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="rl-expiry">Expiry Date</label>
          <input class="form-input" id="rl-expiry" type="date"
                 value="${v.expiryDate ? new Date(v.expiryDate).toISOString().slice(0,10) : ''}">
        </div>
        <div class="form-group">
          <label class="form-label" for="rl-batch">Batch Number</label>
          <input class="form-input" id="rl-batch" type="text" autocomplete="off"
                 value="${_e(v.batchNumber || '')}" placeholder="Optional">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="rl-shelf">Shelf Location</label>
          <input class="form-input" id="rl-shelf" type="text" autocomplete="off"
                 value="${_e(v.shelfLocation || '')}" placeholder="e.g. S05">
        </div>
        <div class="form-group">
          <label class="form-label" for="rl-owner">Owner Type</label>
          <select class="form-select" id="rl-owner">
            <option value="Owner"${(v.ownerType || 'Owner') === 'Owner' ? ' selected' : ''}>Owner Stock</option>
            <option value="Consignment"${v.ownerType === 'Consignment' ? ' selected' : ''}>Consignment</option>
          </select>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" id="rl-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="rl-save-btn">
          ${editIdx != null ? 'Save Changes' : 'Add Line'}
        </button>
      </div>
    `,
  });

  // Live product match feedback
  const productInput = modal.querySelector('#rl-product');
  const matchBanner  = modal.querySelector('#rx-match-banner');
  const debouncedMatch = debounce(async () => {
    const name = productInput.value.trim();
    if (!name) { matchBanner.style.display = 'none'; return; }
    const result = await matchProductForLine(name);
    if (result) {
      matchBanner.textContent = `✓ Matched: ${result.productName} (${result.confidence})`;
      matchBanner.style.display = 'block';
    } else {
      matchBanner.textContent = 'No match found — will be flagged for review or create new product.';
      matchBanner.className = 'ime-readiness-banner blocked';
      matchBanner.style.display = 'block';
    }
  }, 400);
  productInput.addEventListener('input', debouncedMatch);

  modal.querySelector('#rl-cancel-btn').addEventListener('click', closeModal);

  modal.querySelector('#rl-save-btn').addEventListener('click', async () => {
    const errorEl  = modal.querySelector('#rx-line-error');
    errorEl.style.display = 'none';

    const lineData = {
      productName:  modal.querySelector('#rl-product').value.trim(),
      quantity:     parseFloat(modal.querySelector('#rl-qty').value) || null,
      unit:         modal.querySelector('#rl-unit').value,
      unitCost:     modal.querySelector('#rl-cost').value !== '' ? parseFloat(modal.querySelector('#rl-cost').value) : null,
      sellingPrice: modal.querySelector('#rl-price').value !== '' ? parseFloat(modal.querySelector('#rl-price').value) : null,
      expiryDate:   modal.querySelector('#rl-expiry').value ? new Date(modal.querySelector('#rl-expiry').value).getTime() : null,
      batchNumber:  modal.querySelector('#rl-batch').value.trim(),
      shelfLocation:modal.querySelector('#rl-shelf').value.trim(),
      ownerType:    modal.querySelector('#rl-owner').value,
    };

    if (!lineData.productName) {
      errorEl.textContent = 'Product name is required.';
      errorEl.style.display = 'block';
      return;
    }

    try {
      const lineNumber = editIdx != null ? _lines[editIdx].lineNumber : ++_lineCounter;
      const validated  = await validateLine(lineData, _sessionId, lineNumber);

      if (editIdx != null) {
        _lines[editIdx] = validated;
      } else {
        _lines.push(validated);
      }

      closeModal();
      _renderLineList(container);
      _refreshReviewBtn(container);

      if (validated.reviewReasons.length > 0) {
        toast(`Line added with ${validated.reviewReasons.length} review item(s).`, 'warning');
      } else {
        toast('Line added.', 'success');
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

// ================================================================
// REVIEW SCREEN
// ================================================================

async function _renderReview(container) {
  const commitLines = _lines.filter((l) => !l.reviewReasons?.length);
  const reviewLines = _lines.filter((l)  =>  l.reviewReasons?.length);
  const session     = await getSession(_sessionId);

  container.innerHTML = `
    <div class="d-flex justify-between align-center mb-4">
      <div class="section-title" style="margin-bottom:0">Review &amp; Commit</div>
      <button class="btn btn-secondary btn-sm" id="rx-back-to-lines">← Edit Lines</button>
    </div>

    <!-- Summary cards -->
    <div class="ime-summary-grid">
      <div class="ime-stat-card">
        <div class="ime-stat-value text-green">${commitLines.length}</div>
        <div class="ime-stat-label">Ready to Commit</div>
      </div>
      <div class="ime-stat-card">
        <div class="ime-stat-value text-amber">${reviewLines.length}</div>
        <div class="ime-stat-label">Needs Review</div>
      </div>
    </div>

    ${commitLines.length === 0 ? `
    <div class="ime-readiness-banner blocked" style="margin-top:var(--sp-4)">
      No lines are ready to commit. Resolve all issues before proceeding.
    </div>` : `
    <div class="ime-readiness-banner ready" style="margin-top:var(--sp-4)">
      ✓ ${commitLines.length} line${commitLines.length !== 1 ? 's' : ''} ready. ${reviewLines.length > 0 ? `${reviewLines.length} line${reviewLines.length !== 1 ? 's' : ''} will go to the Review Queue instead.` : ''}
    </div>`}

    ${reviewLines.length > 0 ? `
    <div class="settings-section-label">Lines going to Review Queue</div>
    ${reviewLines.map((l) => `
      <div class="card" style="margin-bottom:var(--sp-2);border-left:3px solid var(--clr-amber)">
        <div class="fw-medium">${_e(l.productName)}</div>
        ${l.reviewReasons.map((r) => `<div class="text-xs text-amber" style="margin-top:2px">⚠ ${_e(r)}</div>`).join('')}
      </div>`).join('')}
    ` : ''}

    <!-- Confirmation -->
    <div class="ime-confirm-check" id="rx-confirm-check" style="margin-top:var(--sp-5)">
      <input type="checkbox" id="rx-confirm-cb" class="ime-confirm-cb">
      <label for="rx-confirm-cb" class="ime-confirm-label">
        I confirm this invoice is correct and ready to be committed to inventory.
      </label>
    </div>

    <div class="form-actions" style="margin-top:var(--sp-4)">
      <button class="btn btn-secondary" id="rx-back-to-lines-2">← Back</button>
      <button class="btn btn-primary" id="rx-commit-btn" disabled>
        Commit to Inventory
      </button>
    </div>
  `;

  const cb = container.querySelector('#rx-confirm-cb');
  const commitBtn = container.querySelector('#rx-commit-btn');
  cb.addEventListener('change', () => { commitBtn.disabled = !cb.checked || commitLines.length === 0; });

  container.querySelector('#rx-back-to-lines').addEventListener('click', () => _renderLines(container));
  container.querySelector('#rx-back-to-lines-2').addEventListener('click', () => _renderLines(container));

  commitBtn.addEventListener('click', async () => {
    if (!cb.checked || commitLines.length === 0) return;
    await _handleCommit(container, session);
  });
}

// ================================================================
// COMMIT
// ================================================================

async function _handleCommit(container, session) {
  LoadingOverlay.show('Committing to inventory…');
  try {
    const result = await commitReceivingSession(_sessionId, _lines);
    LoadingOverlay.hide();
    _renderSummary(container, result, session);
    toast(`Receiving complete — ${result.linesImported} lot${result.linesImported !== 1 ? 's' : ''} created.`, 'success');
  } catch (err) {
    LoadingOverlay.hide();
    toast('Commit failed — database rolled back.', 'error');
    container.innerHTML += `
      <div class="card" style="margin-top:var(--sp-4);border-color:var(--clr-red)">
        <div class="card-title text-red">Error</div>
        <div class="text-sm" style="margin-top:var(--sp-2)">${_e(err.message)}</div>
      </div>`;
  }
}

// ================================================================
// SUMMARY
// ================================================================

function _renderSummary(container, result, session) {
  container.innerHTML = `
    <div class="section-title">Receiving Complete</div>
    <div class="text-muted text-xs">${_e(session.invoiceNumber)} · ${_e(session.id)}</div>

    <div class="ime-readiness-banner ready" style="margin-top:var(--sp-4)">
      ✓ ${result.linesImported} inventory lot${result.linesImported !== 1 ? 's' : ''} created successfully.
    </div>

    <div class="ime-summary-grid" style="margin-top:var(--sp-4)">
      <div class="ime-stat-card"><div class="ime-stat-value text-accent">${result.linesRead}</div><div class="ime-stat-label">Lines Read</div></div>
      <div class="ime-stat-card"><div class="ime-stat-value text-green">${result.linesImported}</div><div class="ime-stat-label">Lots Created</div></div>
      <div class="ime-stat-card"><div class="ime-stat-value text-amber">${result.linesReviewed}</div><div class="ime-stat-label">In Review Queue</div></div>
      <div class="ime-stat-card"><div class="ime-stat-value text-${result.linesFailed > 0 ? 'red':'green'}">${result.linesFailed}</div><div class="ime-stat-label">Failed</div></div>
    </div>

    <div class="settings-section-label">Details</div>
    <div class="settings-list">
      <div class="settings-item" style="cursor:default">
        <span class="settings-item-label">Session ID</span>
        <span class="settings-item-value">${_e(result.sessionId)}</span>
      </div>
      <div class="settings-item" style="cursor:default">
        <span class="settings-item-label">Duration</span>
        <span class="settings-item-value">${(result.duration / 1000).toFixed(1)}s</span>
      </div>
      <div class="settings-item" style="cursor:default">
        <span class="settings-item-label">Result</span>
        <span class="settings-item-value text-green">${_e(result.overallResult)}</span>
      </div>
    </div>

    <div class="form-actions" style="margin-top:var(--sp-5)">
      <button class="btn btn-primary" id="rx-done-btn">Done</button>
    </div>
  `;

  container.querySelector('#rx-done-btn').addEventListener('click', _onBack);
}

// ================================================================
// HELPERS
// ================================================================

function _statusBadge(status) {
  return {
    [SESSION_STATUSES.DRAFT]:           'badge-accent',
    [SESSION_STATUSES.IN_REVIEW]:       'badge-amber',
    [SESSION_STATUSES.READY_TO_COMMIT]: 'badge-green',
    [SESSION_STATUSES.COMPLETED]:       'badge-green',
    [SESSION_STATUSES.CANCELLED]:       'badge-red',
  }[status] || 'badge-accent';
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
