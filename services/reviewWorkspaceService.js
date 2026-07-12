/**
 * DGLOPA PLATFORM — REVIEW WORKSPACE SERVICE
 * DT-008: Aggregates and enriches all ReviewQueue items in one parallel load.
 *
 * DESIGN:
 *   - One parallel load of ReviewQueue + Products + Suppliers
 *   - In-memory enrichment (product/supplier names resolved from maps)
 *   - In-memory filtering/sorting — no N+1 per-item queries
 *   - Severity → Priority mapping applied at read time (no schema change)
 *   - Resolution actions write back to db.ReviewQueue and db.AuditLog
 *     inside a single Dexie transaction each
 *
 * PRIORITY MAPPING:
 *   error   → Critical
 *   warning → Medium
 *   (future: High and Low set explicitly by future modules)
 */

import { db }          from '../db/database.js';
import { createProduct } from './productService.js';
import { createSupplier } from './supplierService.js';

// ================================================================
// CONSTANTS
// ================================================================

export const REVIEW_STATUSES = Object.freeze({
  PENDING:  'Pending',
  RESOLVED: 'Resolved',
  IGNORED:  'Ignored',
  MERGED:   'Merged',
});

export const PRIORITIES = Object.freeze({
  CRITICAL: 'Critical',
  HIGH:     'High',
  MEDIUM:   'Medium',
  LOW:      'Low',
});

export const REVIEW_SOURCES = Object.freeze({
  MIGRATION:  'Migration',
  RECEIVING:  'Receiving',
  DEMAND:     'Demand',
  SUPPLIER:   'Supplier',
  INVENTORY:  'Inventory',
  SYSTEM:     'System',
});

// Severity string → Priority label (read-time mapping)
function _toPriority(severity) {
  if (severity === 'error')   return PRIORITIES.CRITICAL;
  if (severity === 'warning') return PRIORITIES.MEDIUM;
  if (severity === 'high')    return PRIORITIES.HIGH;
  if (severity === 'low')     return PRIORITIES.LOW;
  return PRIORITIES.MEDIUM;
}

// Infer source module from category/notes
function _inferSource(item) {
  if (item.category === 'Receiving')                              return REVIEW_SOURCES.RECEIVING;
  if (item.category === 'Demand Resolution Required')             return REVIEW_SOURCES.DEMAND;
  if (['Missing Product','Missing Supplier','Missing Unit',
       'Missing Cost','Missing Selling Price','Invalid Quantity',
       'Invalid Expiry','Duplicate Workbook Row'].includes(item.category)) return REVIEW_SOURCES.MIGRATION;
  if (item.category?.toLowerCase().includes('supplier'))         return REVIEW_SOURCES.SUPPLIER;
  if (item.category?.toLowerCase().includes('inventory'))        return REVIEW_SOURCES.INVENTORY;
  return REVIEW_SOURCES.SYSTEM;
}

// ================================================================
// WORKSPACE SUMMARY + ENRICHED ITEMS
// ================================================================

/**
 * Load the full workspace in one parallel batch.
 * @returns {Promise<WorkspacePayload>}
 */
export async function getWorkspacePayload() {
  const now = Date.now();
  const todayStart  = _startOfDay(now);
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // ---- Parallel load ----
  const [rawItems, products, suppliers] = await Promise.all([
    db.ReviewQueue.toArray(),
    db.Products.toArray(),
    db.Suppliers.toArray(),
  ]);

  const productMap  = new Map(products.map((p) => [p.id, p]));
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

  // ---- Enrich ----
  const items = rawItems.map((item) => _enrich(item, productMap, supplierMap));

  const open     = items.filter((i) => i.status === REVIEW_STATUSES.PENDING);
  const resolved = items.filter((i) => i.status === REVIEW_STATUSES.RESOLVED);

  // Resolution times for average calculation
  const resolvedWithTime = resolved.filter((i) => i.resolvedAt && i.createdAt);
  const avgResolutionMs  = resolvedWithTime.length > 0
    ? resolvedWithTime.reduce((s, i) => s + (i.resolvedAt - i.createdAt), 0) / resolvedWithTime.length
    : null;

  // Summary
  const summary = {
    totalOpen:      open.length,
    critical:       open.filter((i) => i.priority === PRIORITIES.CRITICAL).length,
    high:           open.filter((i) => i.priority === PRIORITIES.HIGH).length,
    medium:         open.filter((i) => i.priority === PRIORITIES.MEDIUM).length,
    low:            open.filter((i) => i.priority === PRIORITIES.LOW).length,
    resolvedToday:  resolved.filter((i) => i.resolvedAt >= todayStart).length,
    avgResolutionHours: avgResolutionMs != null ? (avgResolutionMs / 3600000).toFixed(1) : null,
    oldestOpen:     open.length ? Math.min(...open.map((i) => i.createdAt)) : null,
    newestOpen:     open.length ? Math.max(...open.map((i) => i.createdAt)) : null,
  };

  // Attention items
  const attention = _buildAttention(open, now, sevenDaysMs);

  return { summary, items, open, attention };
}

/**
 * Filter and sort enriched items.
 */
export function filterItems(items, {
  status    = REVIEW_STATUSES.PENDING,
  priority  = null,
  category  = null,
  source    = null,
  query     = '',
  evidenceOnly = false,
} = {}) {
  let results = items;

  if (status && status !== 'All') results = results.filter((i) => i.status === status);
  if (priority)                   results = results.filter((i) => i.priority === priority);
  if (category)                   results = results.filter((i) => i.category === category);
  if (source)                     results = results.filter((i) => i.source   === source);
  if (evidenceOnly)               results = results.filter((i) => i.hasEvidence);

  const q = query.trim().toLowerCase();
  if (q) {
    results = results.filter((i) =>
      i.category?.toLowerCase().includes(q)          ||
      i.description?.toLowerCase().includes(q)       ||
      i.productName?.toLowerCase().includes(q)       ||
      i.supplierName?.toLowerCase().includes(q)      ||
      i.notes?.toLowerCase().includes(q)             ||
      i.id?.toLowerCase().includes(q)
    );
  }

  // Sort: Critical first, then by age (oldest first within priority)
  const priorityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  results.sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 9;
    const pb = priorityOrder[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    return a.createdAt - b.createdAt;
  });

  return results;
}

// ================================================================
// RESOLUTION ACTIONS
// ================================================================

/**
 * Mark a review item as Resolved with optional notes.
 * Writes to db.ReviewQueue and db.AuditLog in one transaction.
 */
export async function resolveItem(itemId, notes = '', actor = 'system') {
  const now = Date.now();
  await db.transaction('rw', [db.ReviewQueue, db.AuditLog], async () => {
    await db.ReviewQueue.update(itemId, {
      status:     REVIEW_STATUSES.RESOLVED,
      resolvedAt: now,
      notes:      notes || undefined,
      updatedAt:  now,
    });
    await db.AuditLog.add({
      entity:      'ReviewQueue',
      entityId:    itemId,
      action:      'RESOLVE',
      detail:      { notes },
      performedBy: actor,
      performedAt: now,
    });
  });
}

/**
 * Ignore a review item (will not be actioned).
 */
export async function ignoreItem(itemId, notes = '', actor = 'system') {
  const now = Date.now();
  await db.transaction('rw', [db.ReviewQueue, db.AuditLog], async () => {
    await db.ReviewQueue.update(itemId, {
      status:    REVIEW_STATUSES.IGNORED,
      notes:     notes || undefined,
      updatedAt: now,
    });
    await db.AuditLog.add({
      entity: 'ReviewQueue', entityId: itemId, action: 'IGNORE',
      detail: { notes }, performedBy: actor, performedAt: now,
    });
  });
}

/**
 * Add notes to an item without changing status.
 */
export async function addNotes(itemId, notes, actor = 'system') {
  const now = Date.now();
  const existing = await db.ReviewQueue.get(itemId);
  const combined = [existing?.notes, notes].filter(Boolean).join('\n\n');
  await db.ReviewQueue.update(itemId, { notes: combined, updatedAt: now });
}

/**
 * Create a Product from an "Unknown Product" review item, then resolve it.
 * Delegates to productService.createProduct — no duplicate logic.
 */
export async function createProductFromItem(itemId, productData, actor = 'system') {
  const productId = await createProduct(productData);
  await resolveItem(itemId, `Product created: ${productId}`, actor);
  return productId;
}

/**
 * Create a Supplier from an "Unknown Supplier" review item, then resolve it.
 */
export async function createSupplierFromItem(itemId, supplierData, actor = 'system') {
  const supplierId = await createSupplier(supplierData);
  await resolveItem(itemId, `Supplier created: ${supplierId}`, actor);
  return supplierId;
}

// ================================================================
// ATTENTION ITEMS
// ================================================================

function _buildAttention(open, now, sevenDaysMs) {
  const items = [];

  const critical = open.filter((i) => i.priority === PRIORITIES.CRITICAL);
  if (critical.length) {
    items.push({
      type:     'critical',
      severity: 'error',
      title:    `${critical.length} Critical Item${critical.length !== 1 ? 's' : ''}`,
      body:     'Error-severity review items requiring immediate attention.',
      count:    critical.length,
      filter:   { priority: PRIORITIES.CRITICAL },
    });
  }

  const oldItems = open.filter((i) => (now - i.createdAt) > sevenDaysMs);
  if (oldItems.length) {
    items.push({
      type:     'aged',
      severity: 'warning',
      title:    `${oldItems.length} Item${oldItems.length !== 1 ? 's' : ''} Older Than 7 Days`,
      body:     'These items have been pending for over a week.',
      count:    oldItems.length,
      filter:   null,
    });
  }

  const bySource = {};
  for (const i of open) {
    bySource[i.source] = (bySource[i.source] || 0) + 1;
  }
  for (const [source, count] of Object.entries(bySource)) {
    items.push({
      type:     `source_${source.toLowerCase()}`,
      severity: 'info',
      title:    `${count} from ${source}`,
      body:     `${source} items awaiting review.`,
      count,
      filter:   { source },
    });
  }

  return items;
}

// ================================================================
// ENRICHMENT
// ================================================================

function _enrich(item, productMap, supplierMap) {
  const product  = item.productId  ? productMap.get(item.productId)   : null;
  const supplier = item.supplierId ? supplierMap.get(item.supplierId) : null;

  // Infer productId from originalValue if present
  const inferredProduct = !product && item.originalValue
    ? [...productMap.values()].find((p) =>
        p.productName?.toLowerCase() === item.originalValue?.toLowerCase()
      )
    : null;

  return {
    ...item,
    priority:     _toPriority(item.severity),
    source:       _inferSource(item),
    productName:  product?.productName || inferredProduct?.productName || item.originalValue || null,
    supplierName: supplier?.supplierName || null,
    hasEvidence:  false, // evidence is on Demand records, not ReviewQueue — placeholder
    resolvedAt:   item.resolvedAt || null,
    updatedAt:    item.updatedAt  || null,
  };
}

// ================================================================
// UNIQUE VALUES (for filter dropdowns)
// ================================================================

export function getCategories(items) {
  return [...new Set(items.map((i) => i.category).filter(Boolean))].sort();
}

export function getSources(items) {
  return [...new Set(items.map((i) => i.source).filter(Boolean))].sort();
}

// ================================================================
// HELPERS
// ================================================================

function _startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
