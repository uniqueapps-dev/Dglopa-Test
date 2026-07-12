/**
 * DGLOPA PLATFORM — SOFT DELETE UTILITY
 * DT-002B: Platform-wide soft delete policy.
 *
 * No permanent deletion during normal application operation.
 * All state changes write to the status/lifecycleStatus field
 * of the target record and append an AuditLog entry.
 *
 * SUPPORTED STATUS VALUES (universal):
 *   Active | Inactive | Archived | Merged | Cancelled
 *
 * Products additionally use the extended lifecycle set from DT-002A.
 *
 * USAGE:
 *   import { archiveRecord, restoreRecord, markMerged, cancelRecord } from '../services/softDelete.js';
 *   await archiveRecord('Products', 'PRD-000042');
 *   await markMerged('Products', 'PRD-000001', 'PRD-000002', 'Duplicate entry');
 */

import { db } from '../db/database.js';

// ================================================================
// CANONICAL SOFT-DELETE STATUSES
// ================================================================

export const SOFT_DELETE_STATUSES = Object.freeze({
  ACTIVE:    'Active',
  INACTIVE:  'Inactive',
  ARCHIVED:  'Archived',
  MERGED:    'Merged',
  CANCELLED: 'Cancelled',
});

// ================================================================
// TABLE CONFIGURATION
// Tables that carry a lifecycle/status field, and which field name.
// Add new tables here as modules are built.
// ================================================================

const TABLE_CONFIG = {
  Products:         { statusField: 'lifecycleStatus', hasUpdatedAt: true  },
  Suppliers:        { statusField: 'status',          hasUpdatedAt: true  },
  InventoryLots:    { statusField: 'status',          hasUpdatedAt: false },
  SupplierInvoices: { statusField: 'status',          hasUpdatedAt: false },
  Sales:            { statusField: 'status',          hasUpdatedAt: false },
  Demand:           { statusField: 'status',          hasUpdatedAt: false },
  ReviewQueue:      { statusField: 'status',          hasUpdatedAt: false },
  Payments:         { statusField: 'status',          hasUpdatedAt: false },
};

// ================================================================
// CORE INTERNAL HELPER
// ================================================================

/**
 * Apply a status change to a record and write an audit log entry.
 * @param {string} tableName   — must be a key in TABLE_CONFIG
 * @param {string} id          — record primary key
 * @param {string} newStatus   — target status value
 * @param {object} [extra={}]  — additional fields to merge into the record
 * @param {string} [actor]     — who performed the action (future: staffId)
 */
async function _applyStatus(tableName, id, newStatus, extra = {}, actor = 'system') {
  const config = TABLE_CONFIG[tableName];
  if (!config) throw new Error(`[SoftDelete] Table "${tableName}" is not registered.`);

  const table  = db[tableName];
  if (!table)  throw new Error(`[SoftDelete] Dexie table "${tableName}" not found.`);

  const record = await table.get(id);
  if (!record)  throw new Error(`[SoftDelete] Record not found: ${tableName}/${id}`);

  const now     = Date.now();
  const patch   = { [config.statusField]: newStatus, ...extra };
  if (config.hasUpdatedAt) patch.updatedAt = now;

  await db.transaction('rw', [table, db.AuditLog], async () => {
    await table.update(id, patch);
    await db.AuditLog.add({
      entity:      tableName,
      entityId:    id,
      action:      `STATUS_CHANGE:${newStatus}`,
      detail:      extra,
      performedBy: actor,
      performedAt: now,
    });
  });
}

// ================================================================
// PUBLIC HELPERS
// ================================================================

/**
 * Archive a record (soft delete).
 * Products → lifecycleStatus: 'Archived'
 * Other tables → status: 'Archived'
 *
 * @param {string} tableName
 * @param {string} id
 * @param {string} [actor]
 */
export async function archiveRecord(tableName, id, actor = 'system') {
  await _applyStatus(tableName, id, SOFT_DELETE_STATUSES.ARCHIVED, {}, actor);
}

/**
 * Restore an archived or inactive record to Active.
 *
 * @param {string} tableName
 * @param {string} id
 * @param {string} [actor]
 */
export async function restoreRecord(tableName, id, actor = 'system') {
  await _applyStatus(tableName, id, SOFT_DELETE_STATUSES.ACTIVE, {}, actor);
}

/**
 * Mark a record as Inactive (softer than Archive — still queryable).
 *
 * @param {string} tableName
 * @param {string} id
 * @param {string} [actor]
 */
export async function deactivateRecord(tableName, id, actor = 'system') {
  await _applyStatus(tableName, id, SOFT_DELETE_STATUSES.INACTIVE, {}, actor);
}

/**
 * Mark a record as Merged.
 * Stores mergedIntoId and mergedReason for full audit chain.
 * Intended primarily for Products but works on any registered table.
 *
 * @param {string} tableName
 * @param {string} id           — the record being absorbed (dead)
 * @param {string} mergedIntoId — the surviving record's ID
 * @param {string} [reason]
 * @param {string} [actor]
 */
export async function markMerged(tableName, id, mergedIntoId, reason = '', actor = 'system') {
  if (!mergedIntoId) throw new Error('[SoftDelete] mergedIntoId is required for markMerged.');
  await _applyStatus(
    tableName,
    id,
    SOFT_DELETE_STATUSES.MERGED,
    {
      mergedIntoId,
      mergedDate:   Date.now(),
      mergedReason: reason || '',
    },
    actor,
  );
}

/**
 * Cancel a record (e.g. a sale, invoice, or payment).
 * Does not delete — sets status to 'Cancelled'.
 *
 * @param {string} tableName
 * @param {string} id
 * @param {string} [reason]
 * @param {string} [actor]
 */
export async function cancelRecord(tableName, id, reason = '', actor = 'system') {
  await _applyStatus(
    tableName,
    id,
    SOFT_DELETE_STATUSES.CANCELLED,
    { cancelReason: reason || '' },
    actor,
  );
}

// ================================================================
// TABLE REGISTRY (for future modules to self-register)
// ================================================================

/**
 * Register a new table with the soft delete system.
 * Call this from a module's init function if its table is not in TABLE_CONFIG above.
 *
 * @param {string}  tableName
 * @param {string}  statusField   — the field that holds the status value
 * @param {boolean} hasUpdatedAt  — whether to auto-stamp updatedAt
 */
export function registerSoftDeleteTable(tableName, statusField = 'status', hasUpdatedAt = false) {
  TABLE_CONFIG[tableName] = { statusField, hasUpdatedAt };
}
