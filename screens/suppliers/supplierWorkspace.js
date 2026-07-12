/**
 * DGLOPA PLATFORM — SUPPLIER WORKSPACE
 * DT-005A: Operational command center for supplier relationships.
 *
 * Layout:
 *   Commercial Summary  — headline KPIs
 *   Attention Center    — actionable items requiring attention NOW
 *   Quick Actions       — shortcuts to common workflows
 *   Top Suppliers Panel — ranked by purchase value (default), switchable
 *   Workspace Insights  — descriptive operational summaries
 *   Recent Activity     — last completed receiving sessions
 */

import { getWorkspaceSummary, getRecentActivity } from '../../services/supplierWorkspaceService.js';
import { formatNaira, formatDate }                 from '../../utils/helpers.js';
import { navigate }                                from '../../js/router.js';

// ---- Workspace state ----
let _rankMode = 'purchaseValue'; // purchaseValue | inventoryValue | productCount | recentActivity

// ================================================================
// ENTRY POINT (called by suppliers screen to show workspace first)
// ================================================================

export async function renderSupplierWorkspace(container, onViewDirectory) {
  container.innerHTML = `
    <div class="d-flex justify-between align-center mb-4">
      <div class="section-title" style="margin-bottom:0">Supplier Workspace</div>
      <button class="btn btn-secondary btn-sm" id="ws-directory-btn">Directory →</button>
    </div>
    <div class="empty-state"><div class="loader-spinner"></div></div>
  `;
  container.querySelector('#ws-directory-btn').addEventListener('click', onViewDirectory);

  const [workspace, activity] = await Promise.all([
    getWorkspaceSummary(),
    getRecentActivity(8),
  ]);

  container.innerHTML = `
    <div class="d-flex justify-between align-center" style="margin-bottom:var(--sp-3)">
      <div class="section-title" style="margin-bottom:0">Supplier Workspace</div>
      <button class="btn btn-secondary btn-sm" id="ws-directory-btn">Directory →</button>
    </div>

    ${_commercialSummaryHTML(workspace)}
    ${_attentionHTML(workspace.attention)}
    ${_quickActionsHTML()}
    ${_topSuppliersHTML(workspace)}
    ${_insightsHTML(workspace.insights)}
    ${_recentActivityHTML(activity)}
  `;

  // Events
  container.querySelector('#ws-directory-btn').addEventListener('click', onViewDirectory);

  // Quick actions
  container.querySelector('#ws-new-session-btn')?.addEventListener('click', () => navigate('receive'));
  container.querySelector('#ws-new-supplier-btn')?.addEventListener('click', onViewDirectory);
  container.querySelector('#ws-view-history-btn')?.addEventListener('click', () => navigate('receive'));

  // Attention card actions
  container.querySelectorAll('[data-ws-screen]').forEach((el) => {
    const screen = el.dataset.wsScreen;
    if (screen) el.addEventListener('click', () => navigate(screen));
  });

  // Rank switcher
  container.querySelectorAll('[data-rank]').forEach((btn) => {
    btn.addEventListener('click', () => {
      _rankMode = btn.dataset.rank;
      container.querySelectorAll('[data-rank]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const panelEl = container.querySelector('#ws-top-panel');
      if (panelEl) panelEl.innerHTML = _topSupplierRows(workspace, _rankMode);
    });
  });
}

// ================================================================
// COMMERCIAL SUMMARY
// ================================================================

function _commercialSummaryHTML(ws) {
  return `
    <div class="inv-stat-row">
      ${_stat('Active Suppliers',       ws.activeCount,           'accent')}
      ${_stat('Preferred',              ws.preferredCount,        'green')}
    </div>
    <div class="inv-stat-row" style="margin-top:var(--sp-2)">
      ${_stat('Total Purchase Value',   formatNaira(ws.totalPurchaseValue),   'accent')}
      ${_stat('Inventory Value',        formatNaira(ws.totalInventoryValue),   'green')}
    </div>
    <div class="inv-stat-row" style="margin-top:var(--sp-2)">
      ${_stat('Avg Invoice Value',      ws.avgInvoiceValue != null ? formatNaira(ws.avgInvoiceValue) : '—', 'accent')}
      ${_stat('Deliveries This Month',  ws.deliveriesThisMonth,   'green')}
    </div>
    <div class="inv-stat-row" style="margin-top:var(--sp-2)">
      ${_stat('Products Covered',       ws.productsCovered,       'accent')}
      ${_stat('Outstanding Credit',     '—',                      'amber')}
    </div>
    <div class="divider"></div>
  `;
}

function _stat(label, value, color) {
  return `
    <div class="inv-big-stat">
      <div class="inv-big-value text-${color}">${value}</div>
      <div class="inv-big-label">${label}</div>
    </div>`;
}

// ================================================================
// ATTENTION CENTER
// ================================================================

function _attentionHTML(items) {
  if (items.length === 0) {
    return `
      <div class="settings-section-label">Attention</div>
      <div class="card" style="margin-bottom:var(--sp-4)">
        <div class="text-green fw-medium">✓ No items require immediate attention.</div>
        <div class="text-muted text-xs" style="margin-top:2px">All supplier relationships look operational.</div>
      </div>`;
  }

  return `
    <div class="settings-section-label">Attention</div>
    <div style="margin-bottom:var(--sp-4)">
      ${items.map(_attentionCard).join('')}
    </div>`;
}

function _attentionCard(item) {
  const borderColor = { warning: 'var(--clr-amber)', info: 'var(--clr-accent)', error: 'var(--clr-red)' }[item.severity] || 'var(--clr-border-2)';
  const badge = { warning: 'badge-amber', info: 'badge-accent', error: 'badge-red' }[item.severity] || 'badge-accent';
  const clickable = item.screen ? `data-ws-screen="${_e(item.screen)}" style="cursor:pointer"` : '';

  return `
    <div class="card" ${clickable} style="margin-bottom:var(--sp-2);border-left:3px solid ${borderColor}">
      <div class="d-flex justify-between align-center">
        <div class="fw-medium">${_e(item.title)}</div>
        <span class="badge ${badge}">${item.count}</span>
      </div>
      <div class="text-muted text-xs" style="margin-top:2px">${_e(item.body)}</div>
      ${item.action && item.screen ? `<div class="text-xs text-accent" style="margin-top:var(--sp-2)">Tap to ${_e(item.action)} →</div>` : ''}
    </div>`;
}

// ================================================================
// QUICK ACTIONS
// ================================================================

function _quickActionsHTML() {
  return `
    <div class="settings-section-label">Quick Actions</div>
    <div class="ws-quick-actions">
      <button class="btn btn-primary btn-sm" id="ws-new-session-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        New Receiving
      </button>
      <button class="btn btn-secondary btn-sm" id="ws-new-supplier-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Supplier
      </button>
      <button class="btn btn-secondary btn-sm" id="ws-view-history-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Receiving History
      </button>
    </div>
    <div class="divider"></div>
  `;
}

// ================================================================
// TOP SUPPLIERS PANEL
// ================================================================

function _topSuppliersHTML(ws) {
  const tabs = [
    { key: 'purchaseValue',  label: 'By Value' },
    { key: 'inventoryValue', label: 'Inventory' },
    { key: 'productCount',   label: 'Products' },
    { key: 'recentActivity', label: 'Recent' },
  ];

  return `
    <div class="settings-section-label">Top Suppliers</div>
    <div class="filter-tabs" style="margin-bottom:var(--sp-3)">
      ${tabs.map((t) =>
        `<button class="filter-tab${t.key === _rankMode ? ' active' : ''}" data-rank="${t.key}">${t.label}</button>`
      ).join('')}
    </div>
    <div id="ws-top-panel">
      ${_topSupplierRows(ws, _rankMode)}
    </div>
    <div class="divider"></div>
  `;
}

function _topSupplierRows(ws, mode) {
  const sourceMap = {
    purchaseValue:  ws.byPurchaseValue,
    inventoryValue: ws.byInventoryValue,
    productCount:   ws.byProductCount,
    recentActivity: ws.byRecentActivity,
  };
  const rows = sourceMap[mode] || ws.byPurchaseValue;

  if (rows.length === 0) {
    return `<div class="text-muted text-sm" style="padding:var(--sp-3) 0">No supplier data yet.</div>`;
  }

  return rows.map((row, idx) => {
    const valueLabel = {
      purchaseValue:  formatNaira(row.purchaseValue),
      inventoryValue: formatNaira(row.inventoryValue),
      productCount:   `${row.productCount} product${row.productCount !== 1 ? 's' : ''}`,
      recentActivity: formatDate(row.lastDelivery),
    }[mode] || '—';

    return `
      <div class="card" style="margin-bottom:var(--sp-2)">
        <div class="d-flex justify-between align-center">
          <div class="d-flex align-center gap-3">
            <div class="ws-rank-badge">${idx + 1}</div>
            <div>
              <div class="fw-medium">${_e(row.supplierName)}</div>
              <div class="text-muted text-xs">${row.sessionCount} session${row.sessionCount !== 1 ? 's' : ''} · Last: ${formatDate(row.lastDelivery)}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="fw-medium text-${mode === 'purchaseValue' || mode === 'inventoryValue' ? 'accent' : 'green'}">${valueLabel}</div>
            ${row.preferredSupplier ? `<span class="badge badge-accent" style="font-size:0.55rem">Preferred</span>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ================================================================
// WORKSPACE INSIGHTS
// ================================================================

function _insightsHTML(ins) {
  const pairs = [
    ['Largest Supplier',             ins.largest?.supplierName,        ins.largest        ? formatNaira(ins.largest.purchaseValue) : null],
    ['Most Active Supplier',         ins.mostActive?.supplierName,      ins.mostActive     ? `${ins.mostActive.sessionCount} sessions` : null],
    ['Most Products Supplied',       ins.mostProducts?.supplierName,    ins.mostProducts   ? `${ins.mostProducts.productCount} products` : null],
    ['Highest Credit Exposure',      ins.mostCredit?.supplierName,      ins.mostCredit     ? formatNaira(ins.mostCredit.creditLimit) : null],
    ['Newest Supplier',              ins.newest?.supplierName,          ins.newest         ? formatDate(ins.newest.createdAt) : null],
    ['Longest Inactive',             ins.longestInactive?.supplierName, ins.longestInactive? formatDate(ins.longestInactive.lastDelivery) : null],
  ].filter(([, name]) => name);

  if (pairs.length === 0) return '';

  return `
    <div class="settings-section-label">Workspace Insights</div>
    <div class="settings-list" style="margin-bottom:var(--sp-5)">
      ${pairs.map(([label, name, value]) => `
        <div class="settings-item" style="cursor:default;flex-direction:column;align-items:flex-start;gap:2px">
          <span class="settings-item-label" style="font-size:var(--text-xs);color:var(--clr-text-3)">${label}</span>
          <div class="d-flex justify-between" style="width:100%">
            <span class="fw-medium">${_e(name)}</span>
            ${value ? `<span class="text-muted text-xs">${_e(value)}</span>` : ''}
          </div>
        </div>`).join('')}
    </div>
  `;
}

// ================================================================
// RECENT ACTIVITY
// ================================================================

function _recentActivityHTML(activity) {
  if (activity.length === 0) return '';
  return `
    <div class="settings-section-label">Recent Receiving Activity</div>
    <div style="margin-bottom:var(--sp-5)">
      ${activity.map((s) => `
        <div class="card" style="margin-bottom:var(--sp-2)">
          <div class="d-flex justify-between align-center">
            <div>
              <div class="fw-medium text-sm">${_e(s.invoiceNumber || s.id)}</div>
              <div class="text-muted text-xs">${_e(s.supplierName)} · ${formatDate(s.receivedDate)}</div>
            </div>
            <span class="badge badge-green">Completed</span>
          </div>
          <div class="text-mono text-xs" style="color:var(--clr-text-3);margin-top:2px">${_e(s.id)}</div>
        </div>`).join('')}
    </div>
  `;
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
