/**
 * DGLOPA PLATFORM — EVENT ASSEMBLER
 * DT-008A: The primary entry point for the Event Intelligence Framework.
 *
 * assembleEvents(options) performs:
 *   1. Parallel load of all relevant operational tables
 *   2. Build lookup Maps (no N+1 per-event queries)
 *   3. Single normalisation pass through each source
 *      - classifiers map records → BusinessEvents
 *      - running aggregates computed inline
 *   4. Synthetic event injection (milestones)
 *   5. Importance reclassification (context overrides)
 *   6. Chronological sort (newest first)
 *   7. Return a typed EventTimeline
 *
 * The assembler is STATELESS. Call it on demand. Results are never cached.
 * Every call returns a fresh, fully-consistent timeline from the current
 * state of the database.
 *
 * assembleEvents(options) options:
 *   entityType:  ENTITY_TYPE value — scope to one entity type
 *   entityId:    string            — scope to one entity
 *   fromTs:      number            — include events after this timestamp
 *   toTs:        number            — include events before this timestamp
 *   categories:  string[]          — filter to these categories
 *   limit:       number            — max events to return (default 500)
 *   includeSynthetic: boolean      — include milestone events (default true)
 */

import { db } from '../../db/database.js';
import {
  classifySession, classifyLot, classifyPurchase,
  classifyDemand, classifySupplier, classifyReviewItem,
} from './eventClassifier.js';
import { detectSupplierMilestones, detectDemandMilestones } from './milestoneEngine.js';
import { reclassifyAll }     from './importanceEngine.js';
import { ENTITY_TYPE }       from './eventModel.js';

const NEAR_EXPIRY_DAYS = 90;

// ================================================================
// PUBLIC ENTRY POINT
// ================================================================

/**
 * Assemble a complete event timeline from all operational sources.
 *
 * @param {object} options
 * @returns {Promise<EventTimeline>}
 */
export async function assembleEvents({
  entityType       = null,
  entityId         = null,
  fromTs           = null,
  toTs             = null,
  categories       = null,
  limit            = 500,
  includeSynthetic = true,
} = {}) {
  const now         = Date.now();
  const nearExpiryMs = NEAR_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  // ---- 1. Parallel load ----
  const [sessions, lots, purchases, demandEntries, suppliers, reviewItems] =
    await Promise.all([
      _loadSessions(entityType, entityId),
      _loadLots(entityType, entityId),
      _loadPurchases(entityType, entityId),
      _loadDemand(entityType, entityId),
      _loadSuppliers(entityType, entityId),
      _loadReview(entityType, entityId),
    ]);

  // ---- 2. Build lookup Maps ----
  const productIds = new Set([
    ...lots.map((l) => l.productId),
    ...purchases.map((p) => p.productId),
    ...demandEntries.map((d) => d.productId),
  ].filter(Boolean));
  const productList = await Promise.all([...productIds].map((id) => db.Products.get(id)));
  const productMap  = new Map(productList.filter(Boolean).map((p) => [p.id, p]));

  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

  // ---- 3. Normalisation pass + running aggregates ----
  const events = [];

  // Supplier lifecycle events
  for (const s of suppliers) {
    events.push(...classifySupplier(s));
  }

  // Receiving sessions
  for (const s of sessions) {
    events.push(...classifySession(s));
  }

  // Inventory lots
  for (const l of lots) {
    const productName = productMap.get(l.productId)?.productName || null;
    events.push(...classifyLot(l, productName, now, nearExpiryMs));
  }

  // Purchase history — compute supplier first-purchase flag inline
  const firstPurchaseBySupplier = new Map();
  for (const p of purchases) {
    if (!p.supplierId) continue;
    const existing = firstPurchaseBySupplier.get(p.supplierId);
    if (!existing || p.purchaseDate < existing) {
      firstPurchaseBySupplier.set(p.supplierId, p.purchaseDate);
    }
  }
  for (const p of purchases) {
    const productName  = productMap.get(p.productId)?.productName || null;
    const supplierName = supplierMap.get(p.supplierId)?.supplierName || null;
    const isFirst      = firstPurchaseBySupplier.get(p.supplierId) === p.purchaseDate;
    events.push(...classifyPurchase(p, productName, supplierName, isFirst));
  }

  // Demand entries — compute repeat flag inline
  const demandCountByProduct = new Map();
  for (const d of demandEntries) {
    const key = d.productId || d.productName?.toLowerCase() || 'unknown';
    demandCountByProduct.set(key, (demandCountByProduct.get(key) || 0) + 1);
  }
  for (const d of demandEntries) {
    const productName = productMap.get(d.productId)?.productName || d.productName || null;
    const key         = d.productId || d.productName?.toLowerCase() || 'unknown';
    const count       = demandCountByProduct.get(key) || 1;
    events.push(...classifyDemand(d, productName, count > 1));
  }

  // Review items
  for (const r of reviewItems) {
    events.push(...classifyReviewItem(r));
  }

  // ---- 4. Synthetic milestone injection ----
  if (includeSynthetic) {
    // Supplier milestones — aggregate per supplier
    const supplierAggregates = _computeSupplierAggregates(
      suppliers, purchases, sessions, productMap
    );
    for (const agg of supplierAggregates) {
      events.push(...detectSupplierMilestones(agg, now));
    }

    // Demand milestones
    const demandFrequencies = [...demandCountByProduct.entries()].map(([key, count]) => {
      const d = demandEntries.find(
        (x) => x.productId === key || x.productName?.toLowerCase() === key
      );
      return {
        productId:   d?.productId || null,
        productName: productMap.get(d?.productId)?.productName || d?.productName || key,
        count,
      };
    });
    events.push(...detectDemandMilestones(demandFrequencies, now));

    // Review queue cleared synthetic event
    const allOpen = reviewItems.filter((r) => r.status === 'Pending');
    if (reviewItems.length > 0 && allOpen.length === 0) {
      const lastResolved = reviewItems
        .filter((r) => r.resolvedAt)
        .sort((a, b) => b.resolvedAt - a.resolvedAt)[0];
      if (lastResolved) {
        const { createEvent, IMPORTANCE, CATEGORY, SOURCE_MODULE } = await import('./eventModel.js');
        events.push(createEvent({
          eventType:    'REVIEW_QUEUE_CLEARED',
          category:     CATEGORY.REVIEW,
          importance:   IMPORTANCE.SUCCESS,
          timestamp:    lastResolved.resolvedAt,
          entityType:   ENTITY_TYPE.PLATFORM,
          entityId:     null,
          title:        'Review Queue Cleared',
          description:  'All review items have been resolved.',
          sourceModule: SOURCE_MODULE.SYSTEM,
          metadata:     { totalResolved: reviewItems.filter((r) => r.status !== 'Pending').length },
          synthetic:    true,
        }));
      }
    }
  }

  // ---- 5. Importance reclassification ----
  const reclassified = reclassifyAll(events);

  // ---- 6. Filter ----
  let filtered = reclassified;
  if (!includeSynthetic) filtered = filtered.filter((e) => !e.synthetic);
  if (fromTs)       filtered = filtered.filter((e) => e.timestamp >= fromTs);
  if (toTs)         filtered = filtered.filter((e) => e.timestamp <= toTs);
  if (categories?.length) filtered = filtered.filter((e) => categories.includes(e.category));

  // ---- 7. Sort newest first + limit ----
  filtered.sort((a, b) => b.timestamp - a.timestamp);
  const limited = filtered.slice(0, limit);

  // ---- 8. Build timeline metadata ----
  const timeline = _buildTimeline(limited, now);

  return { events: limited, timeline, totalBeforeLimit: filtered.length };
}

// ================================================================
// SUPPLIER AGGREGATES (for milestone detection)
// ================================================================

function _computeSupplierAggregates(suppliers, purchases, sessions, productMap) {
  const bySupplier = new Map();

  for (const s of suppliers) {
    bySupplier.set(s.id, {
      supplierId:         s.id,
      supplierName:       s.supplierName,
      totalPurchaseValue: 0,
      sessionCount:       0,
      productCount:       0,
      firstPurchaseDate:  null,
      productIds:         new Set(),
    });
  }

  for (const p of purchases) {
    if (!p.supplierId || !bySupplier.has(p.supplierId)) continue;
    const agg = bySupplier.get(p.supplierId);
    agg.totalPurchaseValue += (p.quantity || 0) * (p.unitCost || 0);
    if (p.productId) agg.productIds.add(p.productId);
    if (!agg.firstPurchaseDate || p.purchaseDate < agg.firstPurchaseDate) {
      agg.firstPurchaseDate = p.purchaseDate;
    }
  }

  for (const s of sessions) {
    if (!s.supplierId || !bySupplier.has(s.supplierId)) continue;
    if (s.status === 'Completed') bySupplier.get(s.supplierId).sessionCount++;
  }

  for (const agg of bySupplier.values()) {
    agg.productCount = agg.productIds.size;
    delete agg.productIds; // clean up Set before returning
  }

  return [...bySupplier.values()];
}

// ================================================================
// TIMELINE METADATA
// ================================================================

function _buildTimeline(events, now) {
  const todayStart  = _startOfDay(now);
  const weekStart   = todayStart - (new Date(now).getDay() * 86400000);
  const monthStart  = _startOfMonth(now);

  return {
    totalEvents:   events.length,
    criticalCount: events.filter((e) => e.importance === 'CRITICAL').length,
    warningCount:  events.filter((e) => e.importance === 'WARNING').length,
    successCount:  events.filter((e) => e.importance === 'SUCCESS').length,
    syntheticCount:events.filter((e) => e.synthetic).length,
    todayCount:    events.filter((e) => e.timestamp >= todayStart).length,
    weekCount:     events.filter((e) => e.timestamp >= weekStart).length,
    monthCount:    events.filter((e) => e.timestamp >= monthStart).length,
    oldestEvent:   events.length ? events[events.length - 1].timestamp : null,
    newestEvent:   events.length ? events[0].timestamp : null,
  };
}

// ================================================================
// SCOPED DATA LOADERS
// (each returns only records relevant to the requested scope)
// ================================================================

async function _loadSessions(entityType, entityId) {
  if (entityType === ENTITY_TYPE.SUPPLIER && entityId) {
    return db.ReceivingSessions.where('supplierId').equals(entityId).toArray();
  }
  return db.ReceivingSessions.toArray();
}

async function _loadLots(entityType, entityId) {
  if (entityType === ENTITY_TYPE.PRODUCT && entityId) {
    return db.InventoryLots.where('productId').equals(entityId).toArray();
  }
  if (entityType === ENTITY_TYPE.SUPPLIER && entityId) {
    return db.InventoryLots.where('supplierId').equals(entityId).toArray();
  }
  return db.InventoryLots.toArray();
}

async function _loadPurchases(entityType, entityId) {
  if (entityType === ENTITY_TYPE.PRODUCT && entityId) {
    return db.PurchaseHistory.where('productId').equals(entityId).toArray();
  }
  if (entityType === ENTITY_TYPE.SUPPLIER && entityId) {
    return db.PurchaseHistory.where('supplierId').equals(entityId).toArray();
  }
  return db.PurchaseHistory.toArray();
}

async function _loadDemand(entityType, entityId) {
  if (entityType === ENTITY_TYPE.PRODUCT && entityId) {
    return db.Demand.where('productId').equals(entityId).toArray();
  }
  return db.Demand.toArray();
}

async function _loadSuppliers(entityType, entityId) {
  if (entityType === ENTITY_TYPE.SUPPLIER && entityId) {
    const s = await db.Suppliers.get(entityId);
    return s ? [s] : [];
  }
  return db.Suppliers.toArray();
}

async function _loadReview(entityType, entityId) {
  return db.ReviewQueue.toArray();
}

// ================================================================
// HELPERS
// ================================================================

function _startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function _startOfMonth(ts) {
  const d = new Date(ts);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
