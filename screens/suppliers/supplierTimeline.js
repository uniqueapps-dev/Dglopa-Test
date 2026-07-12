/**
 * DGLOPA PLATFORM — SUPPLIER TIMELINE SCREEN
 * DT-005B: Chronological event narrative for a supplier relationship.
 *
 * Rendered inside the supplier profile modal or as a full sub-screen.
 * Entry via: Supplier Profile → "View Timeline" button.
 */

import {
  getSupplierTimeline, CATEGORIES, EVENT_TYPES,
} from '../../services/supplierTimelineService.js';
import { formatDate, debounce } from '../../utils/helpers.js';

// ---- Filter state ----
let _category = CATEGORIES.ALL;
let _query    = '';

// ================================================================
// ENTRY POINT
// ================================================================

/**
 * Render the supplier timeline into a container element.
 * @param {HTMLElement} container
 * @param {string}      supplierId
 * @param {string}      supplierName
 * @param {function}    onBack
 */
export async function renderSupplierTimeline(container, supplierId, supplierName, onBack) {
  _category = CATEGORIES.ALL;
  _query    = '';

  _renderShell(container, supplierName, onBack);
  await _loadTimeline(container, supplierId);

  // Wire search
  container.querySelector('#tl-search')?.addEventListener('input', debounce(async (e) => {
    _query = e.target.value;
    await _loadTimeline(container, supplierId);
  }, 300));

  // Wire filter tabs
  container.querySelector('#tl-filters')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    _category = btn.dataset.cat;
    container.querySelectorAll('#tl-filters .filter-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    await _loadTimeline(container, supplierId);
  });
}

// ================================================================
// SHELL
// ================================================================

function _renderShell(container, supplierName, onBack) {
  const cats = Object.values(CATEGORIES);

  container.innerHTML = `
    <div class="d-flex justify-between align-center" style="margin-bottom:var(--sp-3)">
      <div>
        <div class="section-title" style="margin-bottom:0">Timeline</div>
        <div class="text-muted text-xs">${_e(supplierName)}</div>
      </div>
      <button class="btn btn-secondary btn-sm" id="tl-back-btn">← Back</button>
    </div>

    <!-- Search -->
    <div class="search-wrap">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input class="search-input" id="tl-search" type="search"
             placeholder="Search invoice, product, event…"
             autocomplete="off" value="${_e(_query)}">
    </div>

    <!-- Filter tabs -->
    <div class="filter-tabs" id="tl-filters">
      ${cats.map((c) =>
        `<button class="filter-tab${c === _category ? ' active' : ''}" data-cat="${c}">${c}</button>`
      ).join('')}
    </div>

    <!-- Timeline body -->
    <div id="tl-body">
      <div class="empty-state"><div class="loader-spinner"></div></div>
    </div>
  `;

  container.querySelector('#tl-back-btn').addEventListener('click', onBack);
}

// ================================================================
// LOAD + RENDER
// ================================================================

async function _loadTimeline(container, supplierId) {
  const body = container.querySelector('#tl-body');
  if (!body) return;

  body.innerHTML = `<div class="empty-state"><div class="loader-spinner"></div></div>`;

  const { groups, events } = await getSupplierTimeline(supplierId, {
    category: _category,
    query:    _query,
    limit:    250,
  });

  if (events.length === 0) {
    body.innerHTML = `
      <div class="empty-state" style="padding:var(--sp-8) 0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div class="empty-state-title">No events found</div>
        <div class="empty-state-body">${_query ? 'Try a different search term.' : 'No recorded events for this filter.'}</div>
      </div>`;
    return;
  }

  body.innerHTML = groups.map(_groupHTML).join('');
}

// ================================================================
// RENDERING
// ================================================================

function _groupHTML(group) {
  return `
    <div class="tl-group">
      <div class="tl-group-label">${_e(group.label)}</div>
      <div class="tl-group-events">
        ${group.events.map(_eventCard).join('')}
      </div>
    </div>`;
}

function _eventCard(event) {
  const { icon, color } = _eventStyle(event.type);
  const timeStr = new Date(event.timestamp).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  const dateStr = new Date(event.timestamp).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

  return `
    <div class="tl-event" data-related-id="${_e(event.relatedId)}" data-related-type="${_e(event.relatedType)}">
      <div class="tl-event-indicator">
        <div class="tl-dot tl-dot-${color}"></div>
        <div class="tl-line"></div>
      </div>
      <div class="tl-event-content">
        <div class="tl-event-header">
          <span class="tl-event-type">${icon} ${_e(event.type)}</span>
          <span class="tl-event-time">${timeStr}</span>
        </div>
        <div class="tl-event-desc">${_e(event.description)}</div>
        <div class="tl-event-meta">
          ${event.invoiceNumber ? `<span class="tl-meta-tag">🧾 ${_e(event.invoiceNumber)}</span>` : ''}
          ${event.productName   ? `<span class="tl-meta-tag">💊 ${_e(event.productName)}</span>` : ''}
          ${event.relatedId && ['session','lot','review'].includes(event.relatedType)
            ? `<span class="tl-meta-tag tl-meta-link" data-nav="${_e(event.relatedType)}" data-id="${_e(event.relatedId)}">View ${event.relatedType} →</span>`
            : ''}
        </div>
      </div>
    </div>`;
}

function _eventStyle(type) {
  const map = {
    [EVENT_TYPES.SUPPLIER_CREATED]:   { icon: '🏢', color: 'green'  },
    [EVENT_TYPES.SUPPLIER_ARCHIVED]:  { icon: '📦', color: 'red'    },
    [EVENT_TYPES.SUPPLIER_RESTORED]:  { icon: '♻️',  color: 'green'  },
    [EVENT_TYPES.SUPPLIER_MERGED]:    { icon: '🔀', color: 'amber'  },
    [EVENT_TYPES.SUPPLIER_UPDATED]:   { icon: '✏️',  color: 'accent' },
    [EVENT_TYPES.SESSION_STARTED]:    { icon: '📋', color: 'accent' },
    [EVENT_TYPES.SESSION_COMPLETED]:  { icon: '✅', color: 'green'  },
    [EVENT_TYPES.SESSION_CANCELLED]:  { icon: '❌', color: 'red'    },
    [EVENT_TYPES.INVOICE_RECEIVED]:   { icon: '🧾', color: 'green'  },
    [EVENT_TYPES.LOT_CREATED]:        { icon: '📦', color: 'accent' },
    [EVENT_TYPES.PRODUCT_ADDED]:      { icon: '💊', color: 'accent' },
    [EVENT_TYPES.REVIEW_RAISED]:      { icon: '⚠️',  color: 'amber'  },
    [EVENT_TYPES.REVIEW_RESOLVED]:    { icon: '✔️',  color: 'green'  },
    [EVENT_TYPES.PURCHASE_RECORDED]:  { icon: '🛒', color: 'accent' },
  };
  return map[type] || { icon: '●', color: 'accent' };
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
