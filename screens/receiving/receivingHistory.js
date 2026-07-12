/**
 * DGLOPA PLATFORM — RECEIVING HISTORY
 * DT-004: Read-only detail view for completed/cancelled receiving sessions.
 */

import { getSession } from '../../services/receivingSessionService.js';
import { formatNaira, formatDate } from '../../utils/helpers.js';
import { db } from '../../db/database.js';

export async function renderSessionDetail(container, sessionId, onBack) {
  const session = await getSession(sessionId);
  if (!session) { onBack(); return; }

  // Fetch lots created in this session (invoiceId = sessionId)
  const lots = await db.InventoryLots
    .where('invoiceId').equals(sessionId)
    .toArray();

  // Fetch purchase history for this session
  const purchases = await db.PurchaseHistory
    .where('invoiceNumber').equals(session.invoiceNumber || sessionId)
    .toArray();

  // Fetch review queue entries for this session
  const reviewEntries = await db.ReviewQueue
    .where('status').equals('Pending')
    .filter((r) => r.notes && r.notes.includes(sessionId))
    .toArray();

  container.innerHTML = `
    <div class="d-flex justify-between align-center mb-4">
      <div class="section-title" style="margin-bottom:0">Session Detail</div>
      <button class="btn btn-secondary btn-sm" id="rx-hist-back">← Back</button>
    </div>

    <div class="card" style="margin-bottom:var(--sp-4)">
      <div class="d-flex justify-between align-center">
        <div class="fw-medium">${_e(session.invoiceNumber || session.id)}</div>
        <span class="badge badge-green">${_e(session.status)}</span>
      </div>
      <div class="text-muted text-xs" style="margin-top:2px">
        ${_e(session.supplierName || 'No supplier')} · ${formatDate(session.receivedDate)}
      </div>
      <div class="text-mono text-xs" style="color:var(--clr-text-3)">${_e(session.id)}</div>
    </div>

    <div class="ime-summary-grid">
      <div class="ime-stat-card"><div class="ime-stat-value text-green">${lots.length}</div><div class="ime-stat-label">Lots Created</div></div>
      <div class="ime-stat-card"><div class="ime-stat-value text-amber">${reviewEntries.length}</div><div class="ime-stat-label">In Review Queue</div></div>
    </div>

    ${lots.length > 0 ? `
    <div class="settings-section-label" style="margin-top:var(--sp-5)">Inventory Lots Created</div>
    ${lots.map((lot) => _lotCard(lot)).join('')}
    ` : ''}

    ${session.notes ? `
    <div class="settings-section-label">Notes</div>
    <div class="profile-notes">${_e(session.notes)}</div>
    ` : ''}
  `;

  container.querySelector('#rx-hist-back').addEventListener('click', onBack);
}

function _lotCard(lot) {
  return `
    <div class="card" style="margin-bottom:var(--sp-2)">
      <div class="d-flex justify-between align-center">
        <div class="text-mono text-xs" style="color:var(--clr-text-3)">${_e(lot.id)}</div>
        <span class="badge ${_statusBadge(lot.status)}">${_e(lot.status)}</span>
      </div>
      <div class="ime-row-grid" style="margin-top:var(--sp-2)">
        <div class="ime-field"><span class="ime-field-label">Qty Received</span><span class="ime-field-value">${lot.quantityReceived}</span></div>
        <div class="ime-field"><span class="ime-field-label">Unit Cost</span><span class="ime-field-value">${lot.unitCost != null ? formatNaira(lot.unitCost) : '—'}</span></div>
        <div class="ime-field"><span class="ime-field-label">Expiry</span><span class="ime-field-value">${lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString('en-NG') : '—'}</span></div>
        <div class="ime-field"><span class="ime-field-label">Shelf</span><span class="ime-field-value">${_e(lot.shelfLocation || '—')}</span></div>
        <div class="ime-field"><span class="ime-field-label">Batch</span><span class="ime-field-value">${_e(lot.batchNumber || '—')}</span></div>
        <div class="ime-field"><span class="ime-field-label">Owner</span><span class="ime-field-value">${_e(lot.ownerType)}</span></div>
      </div>
    </div>`;
}

function _statusBadge(status) {
  return { Active: 'badge-green', 'Action Needed': 'badge-amber', Expired: 'badge-red', Review: 'badge-accent' }[status] || 'badge-accent';
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
