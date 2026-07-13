/**
 * DGLOPA PLATFORM — REVIEW WORKSPACE SCREEN
 * DT-008: The operational inbox — surfaces, filters, and resolves
 * every unresolved item across the platform.
 *
 * Layout:
 *   Workspace Summary  — headline KPIs (open, critical, avg time, oldest)
 *   Attention Center   — actionable alert cards grouped by urgency/source
 *   Filter Controls    — priority, category, source, search, evidence toggle
 *   Review Queue List  — sorted Critical→High→Medium→Low, oldest first within tier
 *   Resolution Panel   — per-item actions: Resolve, Ignore, Create Product/Supplier, Notes
 */

import {
  getWorkspacePayload, filterItems, resolveItem, ignoreItem, addNotes,
  createProductFromItem, createSupplierFromItem,
  REVIEW_STATUSES, PRIORITIES, getCategories, getSources,
} from '../../services/reviewWorkspaceService.js';
import { buildSupplierForm, readSupplierFormValues } from '../suppliers/supplierForm.js';
import { buildProductForm, readFormValues }          from '../products/productForm.js';
import { loadLookups }                               from '../../services/lookupService.js';
import { formatDate, debounce }                      from '../../utils/helpers.js';
import { openModal, closeModal }                     from '../../components/modal.js';
import { toast }                                     from '../../components/toast.js';
import { LoadingOverlay }                            from '../../components/loadingOverlay.js';

// ---- State ----
let _payload      = null;
let _statusFilter = REVIEW_STATUSES.PENDING;
let _priorityFilter = null;
let _categoryFilter = null;
let _sourceFilter   = null;
let _query          = '';

// ================================================================
// ENTRY POINT
// ================================================================

export async function initReviewScreen() {
  const container = document.getElementById('screen-review');
  if (!container) return;
  await _render(container);
}

// Allow external navigation to Review Workspace (from More screen button)
export { initReviewScreen as renderReviewWorkspace };

// ================================================================
// RENDER
// ================================================================

async function _render(container) {
  container.innerHTML = `<div class="empty-state"><div class="loader-spinner"></div></div>`;

  _payload = await getWorkspacePayload();

  const filtered = filterItems(_payload.items, {
    status:   _statusFilter,
    priority: _priorityFilter,
    category: _categoryFilter,
    source:   _sourceFilter,
    query:    _query,
  });

  container.innerHTML = `
    ${_summaryHTML(_payload.summary)}
    ${_attentionHTML(_payload.attention)}
    ${_filtersHTML(_payload.items)}
    <div id="rq-list"></div>
  `;

  _renderList(container, filtered);
  _wireEvents(container);
}

// ================================================================
// WORKSPACE SUMMARY
// ================================================================

function _summaryHTML(s) {
  return `
    <div class="section-title" style="margin-bottom:var(--sp-3)">Review Workspace</div>
    <div class="inv-stat-row">
      ${_stat('Open Items',     s.totalOpen,           'accent')}
      ${_stat('Critical',       s.critical,            s.critical > 0 ? 'red' : 'green')}
    </div>
    <div class="inv-stat-row" style="margin-top:var(--sp-2)">
      ${_stat('Resolved Today', s.resolvedToday,       'green')}
      ${_stat('Avg Resolution', s.avgResolutionHours != null ? `${s.avgResolutionHours}h` : '—', 'accent')}
    </div>
    <div class="inv-stat-row" style="margin-top:var(--sp-2)">
      ${_stat('High',           s.high,                s.high   > 0 ? 'amber' : 'green')}
      ${_stat('Medium',         s.medium,              'accent')}
    </div>
    ${s.oldestOpen ? `
    <div class="text-xs text-muted" style="margin-top:var(--sp-2);margin-bottom:var(--sp-2)">
      Oldest open item: ${formatDate(s.oldestOpen)}
    </div>` : ''}
    <div class="divider"></div>
  `;
}

// ================================================================
// ATTENTION CENTER
// ================================================================

function _attentionHTML(items) {
  if (items.length === 0) {
    return `
      <div class="settings-section-label">Attention</div>
      <div class="card" style="margin-bottom:var(--sp-4)">
        <div class="text-green fw-medium">✓ Review queue is clear.</div>
        <div class="text-muted text-xs" style="margin-top:2px">No open items requiring attention.</div>
      </div>`;
  }

  return `
    <div class="settings-section-label">Attention</div>
    <div style="margin-bottom:var(--sp-4)">
      ${items.map((item) => {
        const border = { error: 'var(--clr-red)', warning: 'var(--clr-amber)', info: 'var(--clr-accent)' }[item.severity] || 'var(--clr-border-2)';
        const badge  = { error: 'badge-red', warning: 'badge-amber', info: 'badge-accent' }[item.severity] || 'badge-accent';
        const clickAttr = item.filter ? `data-attention-filter="${_e(JSON.stringify(item.filter))}" style="cursor:pointer"` : '';
        return `
          <div class="card" ${clickAttr} style="margin-bottom:var(--sp-2);border-left:3px solid ${border}">
            <div class="d-flex justify-between align-center">
              <div class="fw-medium">${_e(item.title)}</div>
              <span class="badge ${badge}">${item.count}</span>
            </div>
            <div class="text-muted text-xs" style="margin-top:2px">${_e(item.body)}</div>
          </div>`;
      }).join('')}
    </div>`;
}

// ================================================================
// FILTER CONTROLS
// ================================================================

function _filtersHTML(items) {
  const cats    = getCategories(items);
  const sources = getSources(items);
  const statuses = [REVIEW_STATUSES.PENDING, REVIEW_STATUSES.RESOLVED, REVIEW_STATUSES.IGNORED, 'All'];

  return `
    <!-- Status tabs -->
    <div class="filter-tabs" id="rq-status-tabs">
      ${statuses.map((s) =>
        `<button class="filter-tab${s === _statusFilter ? ' active' : ''}" data-status="${s}">${s}</button>`
      ).join('')}
    </div>

    <!-- Search -->
    <div class="search-wrap">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input class="search-input" id="rq-search" type="search"
             placeholder="Search category, product, description…"
             autocomplete="off" value="${_e(_query)}">
    </div>

    <!-- Priority + source filters -->
    <div class="rq-filter-row">
      <select class="form-select rq-filter-select" id="rq-priority-filter">
        <option value="">All Priorities</option>
        ${Object.values(PRIORITIES).map((p) => `<option value="${p}"${_priorityFilter===p?' selected':''}>${p}</option>`).join('')}
      </select>
      <select class="form-select rq-filter-select" id="rq-source-filter">
        <option value="">All Sources</option>
        ${sources.map((s) => `<option value="${s}"${_sourceFilter===s?' selected':''}>${s}</option>`).join('')}
      </select>
    </div>
  `;
}

// ================================================================
// REVIEW LIST
// ================================================================

function _renderList(container, items) {
  const listEl = container.querySelector('#rq-list');
  if (!listEl) return;

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        <div class="empty-state-title">${_query ? 'No items match' : 'Nothing to review'}</div>
        <div class="empty-state-body">${_query ? 'Try a different search.' : 'All clear in this queue.'}</div>
      </div>`;
    return;
  }

  listEl.innerHTML = `
    <div class="text-muted text-xs" style="margin-bottom:var(--sp-2)">${items.length} item${items.length !== 1 ? 's' : ''}</div>
    ${items.map(_itemCard).join('')}`;

  listEl.querySelectorAll('.rq-item').forEach((el) => {
    el.addEventListener('click', () => _openResolutionPanel(el.dataset.id));
  });
}

function _itemCard(item) {
  const priorityCls  = { Critical: 'badge-red', High: 'badge-amber', Medium: 'badge-accent', Low: 'badge-accent' }[item.priority] || 'badge-accent';
  const borderColor  = { Critical: 'var(--clr-red)', High: 'var(--clr-amber)', Medium: 'var(--clr-border-2)', Low: 'var(--clr-border)' }[item.priority] || 'var(--clr-border-2)';

  return `
    <div class="rq-item card" data-id="${_e(item.id)}" style="cursor:pointer;margin-bottom:var(--sp-2);border-left:3px solid ${borderColor}">
      <div class="d-flex justify-between align-center">
        <div>
          <div class="fw-medium text-sm">${_e(item.category)}</div>
          <div class="text-muted text-xs">${_e(item.source)} · ${formatDate(item.createdAt)}</div>
        </div>
        <div class="d-flex gap-2 align-center">
          ${item.status !== REVIEW_STATUSES.PENDING ? `<span class="badge badge-green text-xs">${_e(item.status)}</span>` : ''}
          <span class="badge ${priorityCls}">${_e(item.priority)}</span>
        </div>
      </div>
      <div class="text-sm" style="margin-top:var(--sp-2);color:var(--clr-text-2)">${_e(item.description || item.notes || '—')}</div>
      ${item.productName || item.supplierName ? `
      <div class="text-xs text-muted" style="margin-top:var(--sp-1)">
        ${item.productName  ? `💊 ${_e(item.productName)}`  : ''}
        ${item.supplierName ? `  🏢 ${_e(item.supplierName)}` : ''}
      </div>` : ''}
      ${item.suggestedResolution ? `
      <div class="text-xs" style="margin-top:var(--sp-1);color:var(--clr-accent)">
        ↳ ${_e(item.suggestedResolution)}
      </div>` : ''}
    </div>`;
}

// ================================================================
// RESOLUTION PANEL (modal)
// ================================================================

async function _openResolutionPanel(itemId) {
  const item = _payload?.items.find((i) => i.id === itemId);
  if (!item) return;

  const isPending = item.status === REVIEW_STATUSES.PENDING;

  const modal = openModal({
    id: 'rq-resolution',
    title: item.category,
    bodyHTML: `
      <div class="d-flex justify-between align-center" style="margin-bottom:var(--sp-3)">
        <div>
          <div class="text-mono text-xs" style="color:var(--clr-text-3)">${_e(item.id)}</div>
          <div class="text-xs text-muted">${_e(item.source)} · ${formatDate(item.createdAt)}</div>
        </div>
        <span class="badge ${{ Critical:'badge-red', High:'badge-amber', Medium:'badge-accent', Low:'badge-accent' }[item.priority] || 'badge-accent'}">${_e(item.priority)}</span>
      </div>

      <div class="profile-section">
        <div class="profile-section-title">Details</div>
        <div class="profile-grid">
          ${_prow('Category',    item.category || '—')}
          ${_prow('Description', item.description || '—')}
          ${item.suggestedResolution ? _prow('Suggested',  item.suggestedResolution) : ''}
          ${item.productName  ? _prow('Product',    item.productName)  : ''}
          ${item.supplierName ? _prow('Supplier',   item.supplierName) : ''}
          ${item.originalValue ? _prow('Original Value', item.originalValue) : ''}
          ${item.rowIndex ? _prow('Source Row',   String(item.rowIndex)) : ''}
          ${item.notes ? _prow('Notes', item.notes) : ''}
        </div>
      </div>

      ${isPending ? `
      <!-- Notes input -->
      <div class="form-group">
        <label class="form-label" for="rq-notes-input">Add Notes</label>
        <textarea class="form-input" id="rq-notes-input" rows="2"
                  placeholder="Optional — context for this resolution…"></textarea>
      </div>

      <!-- Resolution actions -->
      <div class="settings-section-label">Resolution Actions</div>
      <div class="rq-action-grid">
        <button class="btn btn-secondary btn-sm" id="rqa-resolve">✓ Resolve</button>
        <button class="btn btn-secondary btn-sm" id="rqa-ignore">✗ Ignore</button>
        <button class="btn btn-secondary btn-sm" id="rqa-notes">+ Notes</button>
        ${_canCreateProduct(item) ? `<button class="btn btn-secondary btn-sm" id="rqa-create-product">+ Create Product</button>` : ''}
        ${_canCreateSupplier(item) ? `<button class="btn btn-secondary btn-sm" id="rqa-create-supplier">+ Create Supplier</button>` : ''}
      </div>` : `
      <div class="ime-readiness-banner ready" style="margin-top:var(--sp-4)">
        ✓ ${_e(item.status)} — ${formatDate(item.resolvedAt || item.updatedAt)}
      </div>`}
    `,
  });

  if (!isPending) return;

  const _getNote = () => modal.querySelector('#rq-notes-input')?.value?.trim() || '';

  modal.querySelector('#rqa-resolve')?.addEventListener('click', async () => {
    await resolveItem(itemId, _getNote());
    toast('Item resolved.', 'success');
    closeModal();
    const container = document.getElementById('screen-review');
    if (container) await _render(container);
  });

  modal.querySelector('#rqa-ignore')?.addEventListener('click', async () => {
    await ignoreItem(itemId, _getNote());
    toast('Item ignored.', 'warning');
    closeModal();
    const container = document.getElementById('screen-review');
    if (container) await _render(container);
  });

  modal.querySelector('#rqa-notes')?.addEventListener('click', async () => {
    const note = _getNote();
    if (!note) { toast('Enter a note first.', 'warning'); return; }
    await addNotes(itemId, note);
    toast('Notes saved.', 'success');
    closeModal();
  });

  // Create Product inline
  modal.querySelector('#rqa-create-product')?.addEventListener('click', async () => {
    closeModal();
    const lookups   = await loadLookups();
    const createModal = openModal({
      id: 'rq-create-product', title: 'Create Product',
      bodyHTML: buildProductForm(
        { productName: item.productName || item.originalValue || '', dosageForm: '', baseUnit: '' },
        [], lookups
      ),
    });
    createModal.querySelector('#form-cancel-btn').addEventListener('click', () => { closeModal(); _openResolutionPanel(itemId); });
    createModal.querySelector('#product-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = createModal.querySelector('#form-submit-btn');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const data = readFormValues(createModal.querySelector('#product-form'));
        await createProductFromItem(itemId, data);
        toast('Product created and item resolved.', 'success');
        closeModal();
        const container = document.getElementById('screen-review');
        if (container) await _render(container);
      } catch (err) {
        const errEl = createModal.querySelector('#form-error-banner');
        if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
        btn.disabled = false; btn.textContent = 'Add Product';
      }
    });
  });

  // Create Supplier inline
  modal.querySelector('#rqa-create-supplier')?.addEventListener('click', async () => {
    closeModal();
    const createModal = openModal({
      id: 'rq-create-supplier', title: 'Create Supplier',
      bodyHTML: buildSupplierForm({ supplierName: item.supplierName || item.originalValue || '' }),
    });
    createModal.querySelector('#sup-form-cancel').addEventListener('click', () => { closeModal(); _openResolutionPanel(itemId); });
    createModal.querySelector('#supplier-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = createModal.querySelector('#sup-form-submit');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const data = readSupplierFormValues(createModal.querySelector('#supplier-form'));
        await createSupplierFromItem(itemId, data);
        toast('Supplier created and item resolved.', 'success');
        closeModal();
        const container = document.getElementById('screen-review');
        if (container) await _render(container);
      } catch (err) {
        const errEl = createModal.querySelector('#sup-form-error');
        if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
        btn.disabled = false; btn.textContent = 'Add Supplier';
      }
    });
  });
}

// ================================================================
// EVENTS
// ================================================================

function _wireEvents(container) {
  // Status tabs
  container.querySelector('#rq-status-tabs')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-status]');
    if (!btn) return;
    _statusFilter = btn.dataset.status === 'All' ? null : btn.dataset.status;
    container.querySelectorAll('#rq-status-tabs .filter-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const filtered = filterItems(_payload.items, { status: _statusFilter, priority: _priorityFilter, category: _categoryFilter, source: _sourceFilter, query: _query });
    _renderList(container, filtered);
  });

  // Search
  container.querySelector('#rq-search')?.addEventListener('input', debounce((e) => {
    _query = e.target.value;
    const filtered = filterItems(_payload.items, { status: _statusFilter, priority: _priorityFilter, category: _categoryFilter, source: _sourceFilter, query: _query });
    _renderList(container, filtered);
  }, 250));

  // Priority filter
  container.querySelector('#rq-priority-filter')?.addEventListener('change', (e) => {
    _priorityFilter = e.target.value || null;
    const filtered = filterItems(_payload.items, { status: _statusFilter, priority: _priorityFilter, category: _categoryFilter, source: _sourceFilter, query: _query });
    _renderList(container, filtered);
  });

  // Source filter
  container.querySelector('#rq-source-filter')?.addEventListener('change', (e) => {
    _sourceFilter = e.target.value || null;
    const filtered = filterItems(_payload.items, { status: _statusFilter, priority: _priorityFilter, category: _categoryFilter, source: _sourceFilter, query: _query });
    _renderList(container, filtered);
  });

  // Attention cards — apply their filter on tap
  container.querySelectorAll('[data-attention-filter]').forEach((el) => {
    el.addEventListener('click', () => {
      try {
        const f = JSON.parse(el.dataset.attentionFilter);
        if (f.priority)  _priorityFilter = f.priority;
        if (f.source)    _sourceFilter   = f.source;
        const filtered = filterItems(_payload.items, { status: _statusFilter, priority: _priorityFilter, category: _categoryFilter, source: _sourceFilter, query: _query });
        _renderList(container, filtered);
      } catch (_) {}
    });
  });
}

// ================================================================
// HELPERS
// ================================================================

function _canCreateProduct(item) {
  return ['Unknown Product', 'Missing Product'].includes(item.category);
}

function _canCreateSupplier(item) {
  return ['Unknown Supplier', 'Missing Supplier', 'Supplier Verification'].includes(item.category);
}

function _stat(label, value, color) {
  return `<div class="inv-big-stat"><div class="inv-big-value text-${color}">${value}</div><div class="inv-big-label">${label}</div></div>`;
}

function _prow(label, value) {
  return `<div class="profile-row"><span class="profile-row-label">${label}</span><span class="profile-row-value">${_e(value)}</span></div>`;
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
