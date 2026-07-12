/**
 * DGLOPA PLATFORM — RECEIVING SESSION SERVICE
 * DT-004: Manages the lifecycle of receiving sessions.
 *
 * A ReceivingSession represents one supplier delivery event.
 * It is the container for one or more invoice lines.
 *
 * Status flow:
 *   Draft → In Review → Ready to Commit → Completed
 *                                        → Cancelled
 *
 * Sessions in Draft and In Review status are mutable.
 * Sessions in Ready to Commit, Completed, and Cancelled are read-only.
 */

import { db }    from '../db/database.js';
import { nextId } from '../utils/idGenerator.js';

// ================================================================
// CONSTANTS
// ================================================================

export const SESSION_STATUSES = Object.freeze({
  DRAFT:            'Draft',
  IN_REVIEW:        'In Review',
  READY_TO_COMMIT:  'Ready to Commit',
  COMPLETED:        'Completed',
  CANCELLED:        'Cancelled',
});

const MUTABLE_STATUSES = new Set([SESSION_STATUSES.DRAFT, SESSION_STATUSES.IN_REVIEW]);

// ================================================================
// CREATE
// ================================================================

/**
 * Create a new receiving session in Draft status.
 * @param {object} data
 * @returns {Promise<string>} REC-NNNNNN id
 */
export async function createSession(data) {
  _validateSessionData(data);
  const id  = await nextId('ReceivingSession');
  const now = Date.now();
  await db.ReceivingSessions.add({
    id,
    supplierId:    data.supplierId    || null,
    supplierName:  data.supplierName?.trim()  || '',
    invoiceNumber: data.invoiceNumber?.trim() || '',
    invoiceDate:   data.invoiceDate   || null,
    receivedDate:  data.receivedDate  || now,
    operator:      data.operator?.trim()      || 'system',
    status:        SESSION_STATUSES.DRAFT,
    notes:         data.notes?.trim()         || '',
    lineCount:     0,
    createdAt:     now,
    updatedAt:     now,
  });
  return id;
}

// ================================================================
// READ
// ================================================================

export async function getSession(id) {
  return db.ReceivingSessions.get(id);
}

export async function getAllSessions({ limit = 50, statusFilter = null } = {}) {
  let col = statusFilter
    ? db.ReceivingSessions.where('status').equals(statusFilter)
    : db.ReceivingSessions.orderBy('createdAt');
  const results = await col.reverse().limit(limit).toArray();
  return results;
}

export async function getActiveSessions() {
  return db.ReceivingSessions
    .where('status').anyOf([SESSION_STATUSES.DRAFT, SESSION_STATUSES.IN_REVIEW])
    .toArray();
}

// ================================================================
// UPDATE
// ================================================================

export async function updateSession(id, data) {
  const session = await db.ReceivingSessions.get(id);
  if (!session) throw new Error(`Receiving session not found: ${id}`);
  if (!MUTABLE_STATUSES.has(session.status)) {
    throw new Error(`Session ${id} is ${session.status} and cannot be modified.`);
  }
  await db.ReceivingSessions.update(id, {
    ...data,
    updatedAt: Date.now(),
  });
}

export async function advanceStatus(id, targetStatus) {
  const session = await db.ReceivingSessions.get(id);
  if (!session) throw new Error(`Receiving session not found: ${id}`);

  const allowed = {
    [SESSION_STATUSES.DRAFT]:           [SESSION_STATUSES.IN_REVIEW, SESSION_STATUSES.CANCELLED],
    [SESSION_STATUSES.IN_REVIEW]:       [SESSION_STATUSES.READY_TO_COMMIT, SESSION_STATUSES.DRAFT, SESSION_STATUSES.CANCELLED],
    [SESSION_STATUSES.READY_TO_COMMIT]: [SESSION_STATUSES.COMPLETED, SESSION_STATUSES.IN_REVIEW, SESSION_STATUSES.CANCELLED],
    [SESSION_STATUSES.COMPLETED]:       [],
    [SESSION_STATUSES.CANCELLED]:       [],
  };

  if (!allowed[session.status]?.includes(targetStatus)) {
    throw new Error(`Cannot transition session from ${session.status} to ${targetStatus}.`);
  }

  await db.ReceivingSessions.update(id, { status: targetStatus, updatedAt: Date.now() });
}

export async function cancelSession(id, reason = '') {
  await advanceStatus(id, SESSION_STATUSES.CANCELLED);
  if (reason) await db.ReceivingSessions.update(id, { notes: reason, updatedAt: Date.now() });
}

// ================================================================
// LINE COUNT (denormalised counter on the session for fast display)
// ================================================================

export async function incrementLineCount(sessionId, delta = 1) {
  const s = await db.ReceivingSessions.get(sessionId);
  if (s) await db.ReceivingSessions.update(sessionId, { lineCount: (s.lineCount || 0) + delta });
}

// ================================================================
// VALIDATION
// ================================================================

function _validateSessionData(data) {
  // Supplier is verified by the UI before session creation; allow blank for now
  // (the supplier-not-found flow routes to Review Queue, not a hard block here)
}
