/**
 * DGLOPA PLATFORM — PRODUCT MERGE SERVICE
 * DT-002B: Infrastructure for safely merging duplicate products.
 *
 * MERGE STRATEGY:
 *   1. Validate: both products must exist; survivor must be Active/Trial/Slow Moving/Sleeping.
 *   2. Transfer child records from dead → survivor.
 *      Each transferred record gets _originalProductId stamped for audit history.
 *   3. Mark dead product as lifecycleStatus:'Merged' with mergedIntoId/mergedDate/mergedReason.
 *   4. Write a MergeLog entry for full chain-of-custody.
 *   5. Everything executes inside a single Dexie transaction — atomic, no partial merges.
 *
 * NO PERMANENT DELETION. Dead product and all original child records are preserved;
 * only their productId pointers and _originalProductId fields are updated.
 *
 * NO USER INTERFACE. Called by future admin/import modules only.
 *
 * EXTENSIBILITY:
 *   Add new child tables to CHILD_TABLES as modules are built.
 *   Each entry declares the table name and the field that references productId.
 */

import { db }         from '../db/database.js';
import { markMerged } from './softDelete.js';

// ================================================================
// CHILD TABLE REGISTRY
// Add new tables here as modules are built (DT-003 onwards).
// { table: Dexie table name, field: foreign key field name }
// ================================================================

const CHILD_TABLES = [
  { table: 'InventoryLots',   field: 'productId' },
  { table: 'PurchaseHistory', field: 'productId' },
  { table: 'PriceHistory',    field: 'productId' },
  { table: 'StockMovements',  field: 'productId' },
  { table: 'Demand',          field: 'productId' },
  { table: 'ProductAliases',  field: 'productId' },
  { table: 'ReviewQueue',     field: 'productId' },
  // Future: SaleLines (field: 'productId'), Barcodes (field: 'productId')
];

// Statuses that a survivor product may carry and still be valid as a merge target
const VALID_SURVIVOR_STATUSES = new Set([
  'Trial', 'Active', 'Slow Moving', 'Sleeping',
]);

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Merge deadProductId into survivorProductId.
 *
 * @param {string} deadProductId     — PRD-NNNNNN to be absorbed
 * @param {string} survivorProductId — PRD-NNNNNN to survive
 * @param {string} [reason]          — free-text reason for the merge
 * @param {string} [actor]           — who triggered the merge (future: staffId)
 * @returns {Promise<MergeResult>}
 */
export async function mergeProducts(deadProductId, survivorProductId, reason = '', actor = 'system') {
  // ---- Pre-flight validation (outside transaction — read only) ----
  const [dead, survivor] = await Promise.all([
    db.Products.get(deadProductId),
    db.Products.get(survivorProductId),
  ]);

  _assertMergeable(dead, deadProductId, survivor, survivorProductId);

  // ---- Count records that will be transferred (for result summary) ----
  const transferCounts = await _countChildRecords(deadProductId);

  // ---- Atomic merge transaction ----
  const now = Date.now();

  await db.transaction(
    'rw',
    [
      db.Products,
      db.InventoryLots,
      db.PurchaseHistory,
      db.PriceHistory,
      db.StockMovements,
      db.Demand,
      db.ProductAliases,
      db.ReviewQueue,
      db.AuditLog,
      db.Settings,
    ],
    async () => {
      // 1. Transfer all child records
      for (const { table, field } of CHILD_TABLES) {
        await _transferChildRecords(table, field, deadProductId, survivorProductId, now);
      }

      // 2. Merge aliases: if the dead product's name isn't already an alias
      //    of the survivor, add it so search still resolves it.
      await _absorbProductName(dead, survivorProductId, now);

      // 3. Mark dead product as Merged
      await db.Products.update(deadProductId, {
        lifecycleStatus: 'Merged',
        mergedIntoId:    survivorProductId,
        mergedDate:      now,
        mergedReason:    reason || '',
        updatedAt:       now,
      });

      // 4. Write merge audit log entry
      await db.AuditLog.add({
        entity:      'Products',
        entityId:    deadProductId,
        action:      'MERGE',
        detail: {
          survivorProductId,
          reason:          reason || '',
          transferCounts,
          mergedAt:        now,
        },
        performedBy: actor,
        performedAt: now,
      });
    },
  );

  return {
    deadProductId,
    survivorProductId,
    reason,
    mergedAt:       now,
    transferCounts,
  };
}

/**
 * Dry-run: validate a proposed merge and return a summary without writing anything.
 * Use this to check feasibility before presenting a confirmation to the user.
 *
 * @returns {Promise<DryRunResult>}
 */
export async function dryRunMerge(deadProductId, survivorProductId) {
  const [dead, survivor] = await Promise.all([
    db.Products.get(deadProductId),
    db.Products.get(survivorProductId),
  ]);

  const validationErrors = [];
  try {
    _assertMergeable(dead, deadProductId, survivor, survivorProductId);
  } catch (err) {
    validationErrors.push(err.message);
  }

  const transferCounts = validationErrors.length === 0
    ? await _countChildRecords(deadProductId)
    : {};

  return {
    feasible:        validationErrors.length === 0,
    validationErrors,
    dead:            dead     ? { id: dead.id,     productName: dead.productName,     lifecycleStatus: dead.lifecycleStatus }     : null,
    survivor:        survivor ? { id: survivor.id, productName: survivor.productName, lifecycleStatus: survivor.lifecycleStatus } : null,
    transferCounts,
  };
}

/**
 * Get the merge history for a product (as either dead or survivor).
 *
 * @param {string} productId
 * @returns {Promise<Array>} AuditLog entries for this product's merges
 */
export async function getMergeHistory(productId) {
  const entries = await db.AuditLog
    .where('entity').equals('Products')
    .and((r) => r.action === 'MERGE' && (r.entityId === productId || r.detail?.survivorProductId === productId))
    .toArray();

  entries.sort((a, b) => b.performedAt - a.performedAt);
  return entries;
}

/**
 * Given a product ID that may have been merged, resolve the current surviving ID.
 * Follows the merge chain up to 10 hops (guards against cycles, though they
 * cannot occur through normal merges since dead products are status:'Merged').
 *
 * @param {string} productId
 * @returns {Promise<string>} survivorProductId (or same id if not merged)
 */
export async function resolveProductId(productId) {
  let current = productId;
  for (let hop = 0; hop < 10; hop++) {
    const p = await db.Products.get(current);
    if (!p)                              return current;  // not found — return as-is
    if (p.lifecycleStatus !== 'Merged') return current;  // alive — this is the survivor
    if (!p.mergedIntoId)               return current;  // broken chain — stop
    current = p.mergedIntoId;
  }
  console.warn('[MergeService] Merge chain exceeded 10 hops for', productId);
  return current;
}

// ================================================================
// INTERNALS
// ================================================================

function _assertMergeable(dead, deadId, survivor, survivorId) {
  if (!dead)     throw new Error(`Dead product not found: ${deadId}`);
  if (!survivor) throw new Error(`Survivor product not found: ${survivorId}`);
  if (deadId === survivorId) throw new Error('Cannot merge a product into itself.');
  if (dead.lifecycleStatus === 'Merged')
    throw new Error(`Product ${deadId} is already merged into ${dead.mergedIntoId}.`);
  if (!VALID_SURVIVOR_STATUSES.has(survivor.lifecycleStatus))
    throw new Error(`Survivor product ${survivorId} has status "${survivor.lifecycleStatus}" and cannot receive a merge. Must be Active, Trial, Slow Moving, or Sleeping.`);
}

/**
 * Count how many child records each child table has for deadProductId.
 */
async function _countChildRecords(deadProductId) {
  const counts = {};
  for (const { table, field } of CHILD_TABLES) {
    try {
      counts[table] = await db[table].where(field).equals(deadProductId).count();
    } catch (_) {
      counts[table] = 0;
    }
  }
  return counts;
}

/**
 * Transfer all records in a child table from deadProductId to survivorProductId.
 * Stamps _originalProductId on each record for audit history.
 * Must be called inside a Dexie transaction.
 */
async function _transferChildRecords(tableName, fieldName, deadId, survivorId, now) {
  const table   = db[tableName];
  if (!table) return;

  const records = await table.where(fieldName).equals(deadId).toArray();
  if (records.length === 0) return;

  const updated = records.map((r) => ({
    ...r,
    [fieldName]:           survivorId,
    _originalProductId:    r._originalProductId ?? r[fieldName], // preserve original if already set
    _transferredAt:        now,
    _transferredFromMerge: true,
  }));

  await table.bulkPut(updated);
}

/**
 * If the dead product's name is not already an alias of the survivor,
 * insert it as an alias (source: 'merge') so it remains searchable.
 * Must be called inside a Dexie transaction.
 */
async function _absorbProductName(dead, survivorId, now) {
  const namesToAbsorb = [dead.productName, dead.genericName, dead.brand]
    .filter(Boolean)
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  for (const name of namesToAbsorb) {
    const existing = await db.ProductAliases
      .where('productId').equals(survivorId)
      .and((r) => r.alias.toLowerCase() === name.toLowerCase())
      .first();

    if (!existing) {
      await db.ProductAliases.add({
        // id is not ALI-prefixed here to avoid nextId() inside a transaction;
        // use a timestamp-based key that is still unique and immutable.
        id:        `ALI-MERGE-${now}-${Math.random().toString(36).slice(2, 7)}`,
        productId: survivorId,
        alias:     name,
        source:    'merge',
        createdAt: now,
      });
    }
  }
}
