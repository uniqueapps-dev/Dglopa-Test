/**
 * DGLOPA PLATFORM — DEMAND SCREEN
 * DT-007: Demand Log workspace — workspace, list, search, filter,
 * quick capture, and demand detail management.
 */

import {
  getDemandSummary, searchDemand, getDemand,
  resolveDemand, ignoreDemand, updateDemand,
  DEMAND_STATUSES, DEMAND_REASONS,
} from '../../services/demandService.js';
import { buildQuickCaptureForm, wireQuickCapture } from './demandCapture.js';
import { formatNaira, formatDate, debounce }       from '../../utils/helpers.js';
import { openModal, closeModal }                    from '../../components/modal.js';
import { toast }                                   from '../../components/toast.js';

// ---- State ----
let _statusFilter = DEMAND_STATUSES.OPEN;
let _query        = '';

// ================================================================
// ENTRY POINT
// ================================================================

export async function initDemandScreen() {
  const container = document.getElementById('screen-demand');
  if (!container) return;
  await _render(container);
}

// ================================================================
// RENDER
// ================================================================

async function _render(container) {
  container.innerHTML = `<div class="empty-state"><div class="loader-spinner"></div></div>`;

  const [summary, entries] = await Promise.all([
    getDemandSummary(),
    searchDemand({ status: _statusFilter, query: _query }),
  ]);

  container.innerHTML = `
    ${_workspaceHTML(summary)}
    ${_controlsHTML()}
    <div id="dem-list"></div>
  `;

  _renderList(container, entries);
  _wireEvents(container, summary);
}

// ================================================================
// WORKSPACE SUMMARY
// ================================================================

function _workspaceHTML(s) {
  return `
    <div class="section-title" style="margin-bottom:var(--sp-3)">Demand Log</div>

    <!-- KPI row -->
    <div class="inv-stat-row">
      ${_stat('Open Requests',    s.totalOpen,          'red')}
      ${_stat('Today',            s.todayCount,         'amber')}
    </div>
    <div class="inv-stat-row" style="margin-top:var(--sp-2)">
      ${_stat('Missing Units',    s.totalMissingUnits,  'red')}
      ${_stat('Est. Lost Revenue', s.estimatedLostRevenue > 0 ? formatNaira(s.estimatedLostRevenue) : '—', 'amber')}
    </div>

    <!-- Alert pills -->
    <div class="inv-alert-row" style="margin-top:var(--sp-4)">
      ${_pill(s.todayCount,      'Today',      'amber',  DEMAND_STATUSES.OPEN)}
      ${_pill(s.weekCount,       'This Week',  'accent', DEMAND_STATUSES.OPEN)}
      ${_pill(s.unmatchedCount,  'Unknown',    'red',    null)}
      ${_pill(s.repeatedCount,   'Repeated',   'amber',  null)}
      ${_pill(s.resolvedTotal,   'Resolved',   'accent', DEMAND_STATUSES.RESOLVED)}
    </div>

    <!-- Top requested -->
    ${s.topRequested.length > 0 ? `
    <div class="settings-section-label">Top Missing Products</div>
    <div class="dem-top-list">
      ${s.topRequested.map((p, i) => `
        <div class="dem-top-row">
          <div class="ws-rank-badge">${i + 1}</div>
          <div style="flex:1">
            <div class="fw-medium text-sm">${_e(p.label)}</div>
            <div class="text-muted text-xs">${p.count} request${p.count !== 1 ? 's' : ''} · ${p.missingQty} missing</div>
          </div>
          ${p.count > 1 ? '<span class="badge badge-amber">Repeat</span>' : ''}
        </div>`).join('')}
    </div>` : ''}
    <div class="divider"></div>
  `;
}

// ================================================================
// LIST CONTROLS
// ================================================================

function _controlsHTML() {
  const statuses = [DEMAND_STATUSES.OPEN, DEMAND_STATUSES.RESOLVED, DEMAND_STATUSES.IGNORED, DEMAND_STATUSES.CONVERTED, 'All'];
  return `
    <div class="d-flex justify-between align-center" style="margin-bottom:var(--sp-3)">
      <div class="text-muted text-xs">Demand Entries</div>
      <button class="btn btn-primary btn-sm" id="dem-capture-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Log Demand
      </button>
    </div>

    <div class="search-wrap">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input class="search-input" id="dem-search" type="search"
             placeholder="Search product, notes…" autocomplete="off" value="${_e(_query)}">
    </div>

    <div class="filter-tabs" id="dem-filters">
      ${statuses.map((s) =>
        `<button class="filter-tab${s === _statusFilter || (s === 'All' && !Object.values(DEMAND_STATUSES).includes(_statusFilter)) ? ' active' : ''}" data-status="${s}">${s}</button>`
      ).join('')}
    </div>
  `;
}

// ================================================================
// LIST RENDER
// ================================================================

function _renderList(container, entries) {
  const listEl = container.querySelector('#dem-list');
  if (!listEl) return;

  if (entries.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
        <div class="empty-state-title">${_query ? 'No entries match' : 'No demand entries'}</div>
        <div class="empty-state-body">${_query ? 'Try a different search term.' : 'Tap Log Demand to capture the first request.'}</div>
      </div>`;
    return;
  }

  listEl.innerHTML = entries.map(_demandCard).join('');
  listEl.querySelectorAll('.dem-card').forEach((el) => {
    el.addEventListener('click', () => _openDetail(el.dataset.id));
  });
}

function _demandCard(d) {
  const statusCls = {
    [DEMAND_STATUSES.OPEN]:      'badge-red',
    [DEMAND_STATUSES.RESOLVED]:  'badge-green',
    [DEMAND_STATUSES.IGNORED]:   'badge-red',
    [DEMAND_STATUSES.CONVERTED]: 'badge-green',
  }[d.status] || 'badge-accent';

  const timeStr = new Date(d.loggedAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  const dateStr = new Date(d.loggedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

  return `
    <div class="dem-card card" data-id="${_e(d.id)}" style="cursor:pointer;margin-bottom:var(--sp-2)">
      <div class="d-flex justify-between align-center">
        <div class="fw-medium">${_e(d.productName || '(unnamed)')}</div>
        <span class="badge ${statusCls}">${_e(d.status)}</span>
      </div>
      <div class="text-muted text-xs" style="margin-top:2px">
        ${_e(d.reason)} · ${dateStr} ${timeStr}
      </div>
      <div class="ime-row-grid" style="margin-top:var(--sp-2)">
        <div class="ime-field">
          <span class="ime-field-label">Requested</span>
          <span class="ime-field-value">${d.requestedQty || 1}</span>
        </div>
        <div class="ime-field">
          <span class="ime-field-label">Supplied</span>
          <span class="ime-field-value">${d.suppliedQty || 0}</span>
        </div>
        <div class="ime-field">
          <span class="ime-field-label">Missing</span>
          <span class="ime-field-value text-red fw-bold">${d.missingQty || 0}</span>
        </div>
        ${d.estimatedPrice != null ? `<div class="ime-field"><span class="ime-field-label">Est. Value</span><span class="ime-field-value">${formatNaira((d.missingQty || 0) * d.estimatedPrice)}</span></div>` : ''}
      </div>
      ${!d.productId ? `<div class="text-xs" style="color:var(--clr-amber);margin-top:var(--sp-1)">⚠ Unknown product — no match in Product Master</div>` : ''}
      ${d.evidenceData ? `<div class="text-xs text-accent" style="margin-top:var(--sp-1)">📎 Evidence attached</div>` : ''}
    </div>`;
}

// ================================================================
// DETAIL MODAL
// ================================================================

async function _openDetail(demandId) {
  const d = await getDemand(demandId);
  if (!d) return;

  const isOpen = d.status === DEMAND_STATUSES.OPEN;

  const modal = openModal({
    id: 'dem-detail',
    title: d.productName || 'Demand Entry',
    bodyHTML: `
      <div class="d-flex justify-between align-center" style="margin-bottom:var(--sp-4)">
        <div class="profile-id text-mono text-xs">${_e(d.id)}</div>
        <span class="badge ${d.status === DEMAND_STATUSES.OPEN ? 'badge-red' : 'badge-green'}">${_e(d.status)}</span>
      </div>

      <div class="profile-section">
        <div class="profile-section-title">Request Details</div>
        <div class="profile-grid">
          ${_prow('Product',       d.productName || '—')}
          ${_prow('Reason',        d.reason)}
          ${_prow('Requested Qty', d.requestedQty)}
          ${_prow('Supplied Qty',  d.suppliedQty)}
          ${_prow('Missing',       d.missingQty)}
          ${_prow('Est. Price',    d.estimatedPrice != null ? formatNaira(d.estimatedPrice) : '—')}
          ${_prow('Est. Lost',     d.estimatedPrice != null ? formatNaira((d.missingQty || 0) * d.estimatedPrice) : '—')}
          ${_prow('Customer Type', d.customerType || '—')}
          ${_prow('Logged At',     formatDate(d.loggedAt))}
          ${d.resolvedAt ? _prow('Resolved At', formatDate(d.resolvedAt)) : ''}
        </div>
      </div>

      ${d.evidenceData ? `
      <div class="profile-section">
        <div class="profile-section-title">Evidence</div>
        ${d.evidenceData.startsWith('data:image') ? `<img src="${d.evidenceData}" style="max-width:100%;border-radius:var(--radius-md);margin-bottom:var(--sp-2)">` : `<div class="text-sm text-muted">Non-image attachment (${d.evidenceType})</div>`}
        ${d.evidenceNotes ? `<div class="profile-notes">${_e(d.evidenceNotes)}</div>` : ''}
      </div>` : ''}

      ${d.notes ? `<div class="profile-section"><div class="profile-section-title">Notes</div><p class="profile-notes">${_e(d.notes)}</p></div>` : ''}

      ${isOpen ? `
      <div class="profile-actions">
        <button class="btn btn-secondary btn-sm" id="dem-resolve-btn">Mark Resolved</button>
        <button class="btn btn-danger btn-sm" id="dem-ignore-btn">Ignore</button>
      </div>` : ''}
    `,
  });

  if (isOpen) {
    modal.querySelector('#dem-resolve-btn').addEventListener('click', async () => {
      await resolveDemand(demandId);
      toast('Demand marked as resolved.', 'success');
      closeModal();
      const container = document.getElementById('screen-demand');
      if (container) await _render(container);
    });

    modal.querySelector('#dem-ignore-btn').addEventListener('click', async () => {
      await ignoreDemand(demandId);
      toast('Demand ignored.', 'warning');
      closeModal();
      const container = document.getElementById('screen-demand');
      if (container) await _render(container);
    });
  }
}

// ================================================================
// EVENTS
// ================================================================

function _wireEvents(container, summary) {
  // Quick capture
  container.querySelector('#dem-capture-btn').addEventListener('click', () => {
    const modal = openModal({
      id: 'dem-capture', title: 'Log Demand', bodyHTML: buildQuickCaptureForm(),
    });
    wireQuickCapture(modal, async () => {
      closeModal();
      await _render(container);
    }, closeModal);
  });

  // Search
  container.querySelector('#dem-search').addEventListener('input', debounce(async (e) => {
    _query = e.target.value;
    const entries = await searchDemand({ status: _statusFilter === 'All' ? null : _statusFilter, query: _query });
    _renderList(container, entries);
  }, 250));

  // Filter tabs
  container.querySelector('#dem-filters').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-status]');
    if (!btn) return;
    _statusFilter = btn.dataset.status;
    container.querySelectorAll('#dem-filters .filter-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const entries = await searchDemand({
      status: _statusFilter === 'All' ? null : _statusFilter,
      query:  _query,
    });
    _renderList(container, entries);
  });

  // Alert pills — filter by status
  container.querySelectorAll('.dem-alert-pill[data-status]').forEach((el) => {
    el.addEventListener('click', async () => {
      const status = el.dataset.status;
      if (status) {
        _statusFilter = status;
        const entries = await searchDemand({ status, query: _query });
        _renderList(container, entries);
      }
    });
  });
}

// ================================================================
// HELPERS
// ================================================================

function _stat(label, value, color) {
  return `<div class="inv-big-stat"><div class="inv-big-value text-${color}">${value}</div><div class="inv-big-label">${label}</div></div>`;
}

function _pill(count, label, color, status) {
  const dataAttr = status ? `data-status="${status}" class="dem-alert-pill"` : '';
  return `<div class="inv-alert-pill ${color}" ${dataAttr} style="${status ? 'cursor:pointer' : ''}">
    <span class="inv-alert-count">${count}</span>
    <span class="inv-alert-label">${label}</span>
  </div>`;
}

function _prow(label, value) {
  return `<div class="profile-row"><span class="profile-row-label">${label}</span><span class="profile-row-value">${value}</span></div>`;
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
