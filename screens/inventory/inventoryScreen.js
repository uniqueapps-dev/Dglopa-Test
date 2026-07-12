/**
 * DGLOPA PLATFORM — LIVE INVENTORY SCREEN
 * DT-006: Dashboard + list + product detail + lot detail.
 * All data derived from existing tables via inventoryService.
 */

import {
  getDashboardSummary, getInventoryList, getProductInventoryDetail,
  FILTER_TYPES, INVENTORY_STATUS,
} from '../../services/inventoryService.js';
import { formatNaira, formatDate, debounce } from '../../utils/helpers.js';
import { openModal, closeModal }              from '../../components/modal.js';
import { openQuickCostUpdate }               from '../products/quickCostUpdate.js';
import { LoadingOverlay }                     from '../../components/loadingOverlay.js';

// ---- Module state ----
let _query        = '';
let _filter       = FILTER_TYPES.ALL;
let _lastRows     = [];

// ================================================================
// ENTRY POINT
// ================================================================

export async function initInventoryScreen() {
  const container = document.getElementById('screen-inventory');
  if (!container) return;
  await _render(container);
}

// ================================================================
// MAIN RENDER
// ================================================================

async function _render(container) {
  // Show spinner immediately
  container.innerHTML = `
    <div class="section-title">Live Inventory</div>
    <div class="empty-state"><div class="loader-spinner"></div></div>
  `;

  const [summary, rows] = await Promise.all([
    getDashboardSummary(),
    getInventoryList({ query: _query, filter: _filter }),
  ]);
  _lastRows = rows;

  container.innerHTML = `
    ${_dashboardHTML(summary)}
    ${_filterTabsHTML()}
    ${_searchBarHTML()}
    <div id="inv-list"></div>
  `;

  _renderList(container, rows);

  // Events
  container.querySelector('#inv-search').addEventListener('input', debounce(_onSearch, 250));
  container.querySelector('#inv-filters').addEventListener('click', _onFilterClick);
}

// ================================================================
// DASHBOARD CARDS
// ================================================================

function _dashboardHTML(s) {
  const margin     = s.estimatedGrossMargin;
  const marginPct  = s.totalRetailValue > 0
    ? ((margin / s.totalRetailValue) * 100).toFixed(1)
    : '—';

  return `
    <div class="section-title" style="margin-bottom:var(--sp-3)">Live Inventory</div>

    <!-- Primary stats -->
    <div class="inv-stat-row">
      ${_bigStat('Inventory Value',  formatNaira(s.totalInventoryValue), 'accent')}
      ${_bigStat('Retail Value',     formatNaira(s.totalRetailValue),    'green')}
    </div>
    <div class="inv-stat-row" style="margin-top:var(--sp-2)">
      ${_bigStat('Gross Margin',     margin >= 0 ? formatNaira(margin) : `–${formatNaira(Math.abs(margin))}`, margin >= 0 ? 'green' : 'red')}
      ${_bigStat('Products',         s.totalProducts, 'accent')}
    </div>

    <!-- Alert pills -->
    <div class="inv-alert-row" style="margin-top:var(--sp-4)">
      ${_alertPill(s.outOfStockCount,     'Out of Stock',  'red',   FILTER_TYPES.OUT_OF_STOCK)}
      ${_alertPill(s.lowStockCount,       'Low Stock',     'amber', FILTER_TYPES.LOW_STOCK)}
      ${_alertPill(s.nearExpiryCount,     'Near Expiry',   'amber', FILTER_TYPES.NEAR_EXPIRY)}
      ${_alertPill(s.expiredLotCount,     'Expired Lots',  'red',   FILTER_TYPES.EXPIRED)}
      ${_alertPill(s.reviewLotCount,      'Review Lots',   'accent',FILTER_TYPES.REVIEW)}
      ${_alertPill(s.pendingReviewQueueItems, 'In Queue',  'accent',FILTER_TYPES.ALL)}
    </div>
    <div class="divider"></div>
  `;
}

function _bigStat(label, value, color) {
  return `
    <div class="inv-big-stat">
      <div class="inv-big-value text-${color}">${value}</div>
      <div class="inv-big-label">${label}</div>
    </div>`;
}

function _alertPill(count, label, color, filter) {
  return `
    <button class="inv-alert-pill ${color}" data-filter="${filter}">
      <span class="inv-alert-count">${count}</span>
      <span class="inv-alert-label">${label}</span>
    </button>`;
}

// ================================================================
// FILTER TABS
// ================================================================

function _filterTabsHTML() {
  const tabs = [
    FILTER_TYPES.ALL,
    FILTER_TYPES.LOW_STOCK,
    FILTER_TYPES.OUT_OF_STOCK,
    FILTER_TYPES.NEAR_EXPIRY,
    FILTER_TYPES.EXPIRED,
    FILTER_TYPES.REVIEW,
  ];
  return `
    <div class="filter-tabs" id="inv-filters">
      ${tabs.map((t) =>
        `<button class="filter-tab${t === _filter ? ' active' : ''}" data-filter="${t}">${t}</button>`
      ).join('')}
    </div>`;
}

// ================================================================
// SEARCH
// ================================================================

function _searchBarHTML() {
  return `
    <div class="search-wrap">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input class="search-input" id="inv-search" type="search"
             placeholder="Product name, brand, generic…"
             autocomplete="off" value="${_e(_query)}">
    </div>`;
}

// ================================================================
// LIST
// ================================================================

function _renderList(container, rows) {
  const listEl = container.querySelector('#inv-list');
  if (!listEl) return;

  if (rows.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/>
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
        </svg>
        <div class="empty-state-title">${_query ? 'No products match your search' : 'No inventory yet'}</div>
        <div class="empty-state-body">${_query ? 'Try a different search term.' : 'Receive stock to see inventory here.'}</div>
      </div>`;
    return;
  }

  listEl.innerHTML = `
    <div class="text-muted text-xs" style="margin-bottom:var(--sp-2)">${rows.length} product${rows.length !== 1 ? 's' : ''}</div>
    ${rows.map(_inventoryRow).join('')}`;

  listEl.querySelectorAll('.inv-product-row').forEach((el) => {
    el.addEventListener('click', () => _openProductDetail(el.dataset.id));
  });
}

function _inventoryRow(row) {
  const statusCls = _statusClass(row.status);
  const stockDisplay = row.currentStock > 0 ? row.currentStock : 'OUT';
  const stockColor   = row.currentStock <= 0 ? 'text-red' : row.currentStock <= 10 ? 'text-amber' : 'text-green';

  return `
    <div class="inv-product-row card" data-id="${_e(row.productId)}" style="cursor:pointer;margin-bottom:var(--sp-2)">
      <div class="d-flex justify-between align-center">
        <div>
          <div class="fw-medium">${_e(row.productName)}</div>
          ${row.genericName || row.brand
            ? `<div class="text-muted text-xs">${[row.genericName, row.brand].filter(Boolean).map(_e).join(' · ')}</div>`
            : ''}
        </div>
        <div class="d-flex gap-2 align-center">
          ${row.pricingStatus && row.pricingStatus !== 'Current' ? _pricingStatusBadge(row.pricingStatus) : ''}
          <span class="badge ${statusCls}">${_e(row.status)}</span>
        </div>
      </div>

      <div class="inv-row-grid" style="margin-top:var(--sp-2)">
        <div class="ime-field">
          <span class="ime-field-label">Stock</span>
          <span class="ime-field-value ${stockColor} fw-bold">${stockDisplay} ${_e(row.baseUnit)}</span>
        </div>
        <div class="ime-field">
          <span class="ime-field-label">Inventory Value</span>
          <span class="ime-field-value">${row.inventoryValue > 0 ? formatNaira(row.inventoryValue) : '—'}</span>
        </div>
        <div class="ime-field">
          <span class="ime-field-label">WAC</span>
          <span class="ime-field-value">${row.wac > 0 ? formatNaira(row.wac) : '—'}</span>
        </div>
        <div class="ime-field">
          <span class="ime-field-label">Selling Price</span>
          <span class="ime-field-value">${row.sellingPrice != null ? formatNaira(row.sellingPrice) : '—'}</span>
        </div>
      </div>
    </div>`;
}

// ================================================================
// PRODUCT DETAIL MODAL
// ================================================================

async function _openProductDetail(productId) {
  const detail = await getProductInventoryDetail(productId);
  if (!detail) return;

  const modal = openModal({
    id:       'inv-product-detail',
    bodyHTML: _productDetailHTML(detail),
  });

  // DT-004A: Quick Cost Update entry point from inventory detail
  modal.querySelector('#inv-update-cost-btn')?.addEventListener('click', () => {
    closeModal();
    openQuickCostUpdate(productId, detail.product.productName, {
      onSaved: async () => {
        // Re-open the detail modal with refreshed data
        await _openProductDetail(productId);
      },
    });
  });
}

function _productDetailHTML(d) {
  const { product, lots, purchases, movements, receivingSessions, suppliers } = d;
  const statusCls = _statusClass(d.status);

  return `
    <!-- Header -->
    <div class="profile-header">
      <div>
        <div class="profile-name">${_e(product.productName)}</div>
        ${product.genericName ? `<div class="text-muted text-xs">${_e(product.genericName)}</div>` : ''}
        <div class="profile-id text-mono text-xs">${_e(product.id)}</div>
      </div>
      <span class="badge ${statusCls}">${_e(d.status)}</span>
    </div>

    <!-- Live Totals -->
    <div class="inv-stat-row" style="margin-bottom:var(--sp-4)">
      ${_miniStat('Stock', `${d.stock} ${_e(product.baseUnit || '')}`, d.stock > 10 ? 'green' : d.stock > 0 ? 'amber' : 'red')}
      ${_miniStat('Inv. Value', d.inventoryValue > 0 ? formatNaira(d.inventoryValue) : '—', 'accent')}
      ${_miniStat('Retail Value', d.retailValue != null ? formatNaira(d.retailValue) : '—', 'green')}
      ${_miniStat('Est. Margin', d.estimatedMargin != null ? formatNaira(d.estimatedMargin) : '—', d.estimatedMargin > 0 ? 'green' : 'red')}
    </div>

    <!-- Product info -->
    <div class="profile-section">
      <div class="profile-section-title">Product</div>
      <div class="profile-grid">
        ${_prow('Dosage Form',    product.dosageForm  || '—')}
        ${_prow('Strength',       product.strength    || '—')}
        ${_prow('Category',       product.category    || '—')}
        ${_prow('Base Unit',      product.baseUnit    || '—')}
        ${_prow('WAC',               d.wac > 0 ? formatNaira(d.wac) : '—')}
        ${_prow('Replacement Cost', d.replacementCostSnapshot?.amount != null
          ? formatNaira(d.replacementCostSnapshot.amount) + ' <span class="text-xs text-muted">(' + _e(d.replacementCostSnapshot.confidence) + ')</span>'
          : (d.commercialProfile?.replacementCostSnapshot?.amount != null
            ? formatNaira(d.commercialProfile.replacementCostSnapshot.amount)
            : (product.lastCost != null ? formatNaira(product.lastCost) + ' <span class="text-xs text-muted">(legacy)</span>' : '—')))}
        ${d.pricingStatus ? _prow('Pricing Status', _pricingStatusBadge(d.pricingStatus)) : ''}
        ${_prow('Selling Price',   d.sellingPrice != null ? formatNaira(d.sellingPrice) : '—')}
        ${_prow('Last Received',  formatDate(product.lastReceivedDate))}
        ${_prow('Active Lots',    d.activeLotCount)}
        ${_prow('Expired Lots',   d.expiredLotCount)}
      </div>
      <!-- DT-004A: Update Cost action from inventory view -->
      <button class="btn btn-secondary btn-sm" id="inv-update-cost-btn" style="margin-top:var(--sp-3)">
        Update Replacement Cost
      </button>
    </div>

    <!-- FEFO Lots -->
    <div class="profile-section">
      <div class="profile-section-title">Inventory Lots — FEFO Order (${lots.length})</div>
      ${lots.length === 0
        ? `<div class="text-muted text-sm">No lots on record.</div>`
        : lots.map(_lotRow).join('')}
    </div>

    <!-- Suppliers -->
    ${suppliers.length > 0 ? `
    <div class="profile-section">
      <div class="profile-section-title">Suppliers (${suppliers.length})</div>
      <div class="profile-grid">
        ${suppliers.map((s) => _prow(
          s.id === product.preferredSupplierId ? 'Preferred' : 'Alternative',
          s.supplierName
        )).join('')}
      </div>
    </div>` : ''}

    <!-- Purchase History -->
    ${purchases.length > 0 ? `
    <div class="profile-section">
      <div class="profile-section-title">Purchase History (recent ${purchases.length})</div>
      <div class="profile-grid">
        ${purchases.map((p) => _prow(
          formatDate(p.purchaseDate),
          `${p.quantity || '?'} × ${p.unitCost != null ? formatNaira(p.unitCost) : '—'}`
        )).join('')}
      </div>
    </div>` : ''}

    <!-- Receiving sessions -->
    ${receivingSessions.length > 0 ? `
    <div class="profile-section">
      <div class="profile-section-title">Receiving Sessions (${receivingSessions.length})</div>
      <div class="profile-grid">
        ${receivingSessions.map((s) => _prow(
          _e(s.invoiceNumber || s.id),
          formatDate(s.receivedDate)
        )).join('')}
      </div>
    </div>` : ''}

    <!-- Health Framework -->
    <div class="profile-section">
      <div class="profile-section-title">Inventory Health Framework</div>
      <div class="profile-grid">
        ${_prow('Inventory Health',   '<span class="badge badge-accent" style="font-size:0.6rem">Pending data</span>')}
        ${_prow('Stock Quality',      '<span class="badge badge-accent" style="font-size:0.6rem">Pending data</span>')}
        ${_prow('Expiry Risk',        '<span class="badge badge-accent" style="font-size:0.6rem">Pending data</span>')}
        ${_prow('Capital Utilization','<span class="badge badge-accent" style="font-size:0.6rem">Pending data</span>')}
      </div>
      <div class="text-xs text-muted" style="margin-top:var(--sp-2)">
        Health scores will be calculated as transaction history grows.
      </div>
    </div>
  `;
}

function _lotRow(lot) {
  const exCls = { 'Expired': 'text-red', 'Near Expiry': 'text-amber', 'Healthy': 'text-green', 'No Expiry': 'text-muted' }[lot.expiryStatus] || '';
  const borderColor = { 'Expired': 'var(--clr-red)', 'Near Expiry': 'var(--clr-amber)', 'Healthy': 'var(--clr-green)', 'Review': 'var(--clr-accent)' }[lot.expiryStatus || lot.status] || 'var(--clr-border-2)';

  return `
    <div class="card" style="margin-bottom:var(--sp-2);border-left:3px solid ${borderColor}">
      <div class="d-flex justify-between align-center">
        <div class="text-mono text-xs" style="color:var(--clr-text-3)">${_e(lot.id)}</div>
        <span class="badge ${exCls === 'text-red' ? 'badge-red' : exCls === 'text-amber' ? 'badge-amber' : exCls === 'text-green' ? 'badge-green' : 'badge-accent'}">${_e(lot.expiryStatus || lot.status)}</span>
      </div>
      <div class="ime-row-grid" style="margin-top:var(--sp-2)">
        <div class="ime-field"><span class="ime-field-label">Available</span><span class="ime-field-value fw-bold ${lot.quantityAvailable <= 0 ? 'text-red' : ''}">${lot.quantityAvailable}</span></div>
        <div class="ime-field"><span class="ime-field-label">Expiry</span><span class="ime-field-value ${exCls}">${lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString('en-NG') : '—'}</span></div>
        <div class="ime-field"><span class="ime-field-label">Unit Cost</span><span class="ime-field-value">${lot.unitCost != null ? formatNaira(lot.unitCost) : '—'}</span></div>
        <div class="ime-field"><span class="ime-field-label">Shelf</span><span class="ime-field-value">${_e(lot.shelfLocation || '—')}</span></div>
        ${lot.batchNumber ? `<div class="ime-field"><span class="ime-field-label">Batch</span><span class="ime-field-value text-mono text-xs">${_e(lot.batchNumber)}</span></div>` : ''}
        ${lot.supplierName ? `<div class="ime-field"><span class="ime-field-label">Supplier</span><span class="ime-field-value">${_e(lot.supplierName)}</span></div>` : ''}
      </div>
    </div>`;
}

// ================================================================
// EVENTS
// ================================================================

async function _onSearch(e) {
  _query = e.target.value;
  const rows = await getInventoryList({ query: _query, filter: _filter });
  _lastRows  = rows;
  const container = document.getElementById('screen-inventory');
  if (container) _renderList(container, rows);
}

async function _onFilterClick(e) {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  _filter = btn.dataset.filter;

  // Update active tab
  document.querySelectorAll('#inv-filters .filter-tab, .inv-alert-pill').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');

  const rows = await getInventoryList({ query: _query, filter: _filter });
  _lastRows  = rows;
  const container = document.getElementById('screen-inventory');
  if (container) _renderList(container, rows);
}

// ================================================================
// HELPERS
// ================================================================

function _statusClass(status) {
  return {
    [INVENTORY_STATUS.HEALTHY]:         'badge-green',
    [INVENTORY_STATUS.LOW_STOCK]:       'badge-amber',
    [INVENTORY_STATUS.OUT_OF_STOCK]:    'badge-red',
    [INVENTORY_STATUS.NEAR_EXPIRY]:     'badge-amber',
    [INVENTORY_STATUS.EXPIRED]:         'badge-red',
    [INVENTORY_STATUS.REVIEW_REQUIRED]: 'badge-accent',
  }[status] || 'badge-accent';
}

function _miniStat(label, value, color) {
  return `
    <div class="inv-mini-stat">
      <div class="inv-mini-value text-${color}">${value}</div>
      <div class="inv-mini-label">${label}</div>
    </div>`;
}

function _prow(label, value) {
  return `
    <div class="profile-row">
      <span class="profile-row-label">${label}</span>
      <span class="profile-row-value">${value}</span>
    </div>`;
}

function _pricingStatusBadge(status) {
  const map = {
    'Current':        null,   // no badge when current — no noise
    'ReviewRequired': '<span class="badge badge-amber" style="font-size:0.6rem">Review</span>',
    'AtRisk':         '<span class="badge badge-red" style="font-size:0.6rem">At Risk</span>',
    'ManualOverride': '<span class="badge badge-accent" style="font-size:0.6rem">Manual</span>',
  };
  return map[status] ?? '';
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
