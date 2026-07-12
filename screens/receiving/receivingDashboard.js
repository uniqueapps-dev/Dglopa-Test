/**
 * DGLOPA PLATFORM — RECEIVING DASHBOARD
 * DT-004: Entry point for the Receiving module.
 * Shows active sessions, quick-start options (manual | spreadsheet),
 * and recent receiving history.
 */

import { getAllSessions, getActiveSessions, SESSION_STATUSES } from '../../services/receivingSessionService.js';
import { formatNaira, formatDate } from '../../utils/helpers.js';
import { navigate } from '../../js/router.js';
import { toast } from '../../components/toast.js';

// Module-level state: active sub-screen
let _activeSub = null; // null = dashboard

export async function initReceivingScreen() {
  const container = document.getElementById('screen-receive');
  if (!container) return;
  await _renderDashboard(container);
}

// ================================================================
// DASHBOARD
// ================================================================

async function _renderDashboard(container) {
  _activeSub = null;

  const [active, recent] = await Promise.all([
    getActiveSessions(),
    getAllSessions({ limit: 10 }),
  ]);

  const completedRecent = recent.filter((s) =>
    s.status === SESSION_STATUSES.COMPLETED || s.status === SESSION_STATUSES.CANCELLED
  ).slice(0, 5);

  container.innerHTML = `
    <div class="section-title">Receive Stock</div>
    <div class="section-subtitle">Invoice-first receiving — every delivery becomes trusted inventory.</div>

    <!-- Quick actions -->
    <div class="receiving-actions">
      <button class="btn btn-primary btn-full" id="rx-new-manual-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Receiving Session
      </button>
      <button class="btn btn-secondary btn-full" id="rx-spreadsheet-btn" style="margin-top:var(--sp-2)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Import Spreadsheet (IME)
      </button>
    </div>

    <!-- Active sessions -->
    ${active.length > 0 ? `
    <div class="settings-section-label">Active Sessions</div>
    <div class="receiving-session-list" id="rx-active-list">
      ${active.map(_sessionCard).join('')}
    </div>` : ''}

    <!-- Recent history -->
    <div class="settings-section-label">Recent History</div>
    ${completedRecent.length > 0
      ? `<div class="receiving-session-list">${completedRecent.map(_sessionCard).join('')}</div>`
      : `<div class="text-muted text-sm" style="margin-top:var(--sp-2)">No completed sessions yet.</div>`
    }
  `;

  container.querySelector('#rx-new-manual-btn').addEventListener('click', () => {
    _renderNewSessionForm(container);
  });

  container.querySelector('#rx-spreadsheet-btn').addEventListener('click', () => {
    // Navigate to IME — it lives in the same screen container
    import('./imeEntry.js').then(({ renderIMEEntry }) => renderIMEEntry(container, () => _renderDashboard(container)));
  });

  // Wire session cards
  container.querySelectorAll('[data-session-id]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.sessionId;
      const s  = [...active, ...completedRecent].find((x) => x.id === id);
      if (s?.status === SESSION_STATUSES.COMPLETED || s?.status === SESSION_STATUSES.CANCELLED) {
        import('./receivingHistory.js').then(({ renderSessionDetail }) => renderSessionDetail(container, id, () => _renderDashboard(container)));
      } else {
        import('./receivingSession.js').then(({ renderSessionScreen }) => renderSessionScreen(container, id, () => _renderDashboard(container)));
      }
    });
  });
}

// ================================================================
// NEW SESSION FORM
// ================================================================

async function _renderNewSessionForm(container) {
  // Load suppliers for quick selection
  const { db } = await import('../../db/database.js');
  const suppliers = await db.Suppliers.where('status').equals('Active').sortBy('supplierName');

  const supplierOptions = suppliers.map((s) =>
    `<option value="${_e(s.id)}">${_e(s.supplierName)}</option>`
  ).join('');

  container.innerHTML = `
    <div class="d-flex justify-between align-center mb-4">
      <div class="section-title" style="margin-bottom:0">New Receiving Session</div>
      <button class="btn btn-secondary btn-sm" id="rx-back-btn">Cancel</button>
    </div>

    <div id="rx-form-error" class="form-error-banner" style="display:none"></div>

    <div class="form-group">
      <label class="form-label" for="rx-supplier">Supplier</label>
      <select class="form-select" id="rx-supplier">
        <option value="">Search or select a supplier…</option>
        ${supplierOptions}
      </select>
      <div style="margin-top:var(--sp-2)">
        <button class="btn btn-ghost btn-sm" id="rx-new-supplier-btn" style="font-size:var(--text-xs)">
          + Supplier not listed — add new
        </button>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label" for="rx-invoice-number">Invoice Number</label>
      <input class="form-input" id="rx-invoice-number" type="text"
             placeholder="e.g. INV-2026-0142" autocomplete="off">
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="rx-invoice-date">Invoice Date</label>
        <input class="form-input" id="rx-invoice-date" type="date">
      </div>
      <div class="form-group">
        <label class="form-label" for="rx-received-date">Received Date</label>
        <input class="form-input" id="rx-received-date" type="date"
               value="${_todayISO()}">
      </div>
    </div>

    <div class="form-group">
      <label class="form-label" for="rx-notes">Notes</label>
      <textarea class="form-input" id="rx-notes" rows="2" placeholder="Optional notes…"></textarea>
    </div>

    <div class="form-actions">
      <button class="btn btn-secondary" id="rx-back-btn-2">Cancel</button>
      <button class="btn btn-primary" id="rx-create-btn">Create Session →</button>
    </div>
  `;

  const back = () => _renderDashboard(container);
  container.querySelector('#rx-back-btn').addEventListener('click', back);
  container.querySelector('#rx-back-btn-2').addEventListener('click', back);

  container.querySelector('#rx-new-supplier-btn').addEventListener('click', () => {
    toast('Use the Suppliers module to add a new supplier first, then return here.', 'info');
  });

  container.querySelector('#rx-create-btn').addEventListener('click', async () => {
    const supplierId    = container.querySelector('#rx-supplier').value;
    const invoiceNumber = container.querySelector('#rx-invoice-number').value.trim();
    const invoiceDate   = container.querySelector('#rx-invoice-date').value;
    const receivedDate  = container.querySelector('#rx-received-date').value;
    const notes         = container.querySelector('#rx-notes').value.trim();

    const errorEl = container.querySelector('#rx-form-error');
    errorEl.style.display = 'none';

    if (!invoiceNumber) {
      errorEl.textContent = 'Invoice Number is required.';
      errorEl.style.display = 'block';
      return;
    }

    try {
      const { createSession } = await import('../../services/receivingSessionService.js');
      const { db: dbInst }    = await import('../../db/database.js');

      const supplierName = supplierId
        ? (await dbInst.Suppliers.get(supplierId))?.supplierName || ''
        : '';

      const sessionId = await createSession({
        supplierId:    supplierId || null,
        supplierName,
        invoiceNumber,
        invoiceDate:   invoiceDate   ? new Date(invoiceDate).getTime()   : null,
        receivedDate:  receivedDate  ? new Date(receivedDate).getTime()  : Date.now(),
        notes,
      });

      const { renderSessionScreen } = await import('./receivingSession.js');
      renderSessionScreen(container, sessionId, () => _renderDashboard(container));

    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

// ================================================================
// SESSION CARD
// ================================================================

function _sessionCard(session) {
  const statusCls = {
    [SESSION_STATUSES.DRAFT]:           'badge-accent',
    [SESSION_STATUSES.IN_REVIEW]:       'badge-amber',
    [SESSION_STATUSES.READY_TO_COMMIT]: 'badge-green',
    [SESSION_STATUSES.COMPLETED]:       'badge-green',
    [SESSION_STATUSES.CANCELLED]:       'badge-red',
  }[session.status] || 'badge-accent';

  return `
    <div class="card" data-session-id="${_e(session.id)}" style="cursor:pointer;margin-bottom:var(--sp-2)">
      <div class="d-flex justify-between align-center">
        <div class="fw-medium">${_e(session.invoiceNumber || session.id)}</div>
        <span class="badge ${statusCls}">${_e(session.status)}</span>
      </div>
      <div class="text-muted text-xs" style="margin-top:2px">
        ${_e(session.supplierName || 'No supplier')} · ${formatDate(session.receivedDate)}
      </div>
      <div class="text-mono text-xs" style="color:var(--clr-text-3);margin-top:var(--sp-1)">
        ${_e(session.id)} · ${session.lineCount || 0} line${(session.lineCount || 0) !== 1 ? 's' : ''}
      </div>
    </div>`;
}

function _todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
