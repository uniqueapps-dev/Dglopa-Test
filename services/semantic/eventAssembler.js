/**
 * DGLOPA PLATFORM — SEMANTIC INTELLIGENCE FRAMEWORK
 * eventAssembler.js — DT-008A (Semantic)
 *
 * The primary entry point. Orchestrates:
 *   1. Parallel data load (scoped by entity if requested)
 *   2. Lookup Map construction (zero N+1)
 *   3. Single normalisation pass through all sources
 *      — registry-driven event creation (no switch statements)
 *      — running aggregates computed inline
 *   4. Synthetic event generation (milestones, platform events)
 *   5. Importance reclassification (context overrides)
 *   6. Semantic reclassification (context-driven strategicIntent/obligationType)
 *   7. Filter → chronological sort → limit
 *   8. SemanticTimeline metadata
 *
 * ASSEMBLER RULE: The assembler performs NO business interpretation.
 * It calls classifiers (transform) and engines (classify) but makes
 * no decisions of its own about meaning or urgency.
 *
 * The assembler is STATELESS. Every call returns a fresh timeline.
 */

import { db }                         from '../../db/database.js';
import { createPlatformEvent }        from './eventFactory.js';
import { getDefinition }              from './eventRegistry.js';
import { reclassifyImportance }       from './importanceEngine.js';
import { reclassifySemantics }        from './semanticEngine.js';
import { generateSyntheticEvents }    from './syntheticEventGenerator.js';
import {
  IMPORTANCE, STRATEGIC_INTENT, OBLIGATION_TYPE,
  CATEGORY, ENTITY_TYPE, SOURCE_MODULE,
} from './eventConstants.js';
import * as ET from './eventTypes.js';

const NEAR_EXPIRY_DAYS = 90;

// ================================================================
// PUBLIC ENTRY POINT
// ================================================================

/**
 * Assemble a complete semantic event timeline.
 *
 * @param {object} options
 *   entityType:        ENTITY_TYPE — scope to one entity type
 *   entityId:          string      — scope to one entity
 *   fromTs:            number      — include events from this timestamp
 *   toTs:              number      — include events to this timestamp
 *   categories:        string[]    — filter to these categories
 *   importanceLevels:  string[]    — filter to these importance levels
 *   limit:             number      — max events (default 500)
 *   includeSynthetic:  boolean     — include milestones (default true)
 *
 * @returns {Promise<SemanticAssemblyResult>}
 */
export async function assembleSemanticEvents({
  entityType        = null,
  entityId          = null,
  fromTs            = null,
  toTs              = null,
  categories        = null,
  importanceLevels  = null,
  limit             = 500,
  includeSynthetic  = true,
} = {}) {
  const now          = Date.now();
  const nearExpiryMs = NEAR_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  // ---- 1. Parallel load ----
  const [sessions, lots, purchases, demands, suppliers, reviewItems] =
    await Promise.all([
      _load('ReceivingSessions', entityType, entityId, 'supplierId'),
      _load('InventoryLots',     entityType, entityId, entityType === ENTITY_TYPE.PRODUCT ? 'productId' : 'supplierId'),
      _load('PurchaseHistory',   entityType, entityId, entityType === ENTITY_TYPE.PRODUCT ? 'productId' : 'supplierId'),
      _load('Demand',            entityType, entityId, 'productId'),
      _loadSuppliers(entityType, entityId),
      db.ReviewQueue.toArray(),
    ]);

  // ---- 2. Lookup Maps ----
  const productIds = new Set([
    ...lots.map((l) => l.productId),
    ...purchases.map((p) => p.productId),
    ...demands.map((d) => d.productId),
  ].filter(Boolean));
  const productRecords = await Promise.all([...productIds].map((id) => db.Products.get(id)));
  const productMap     = new Map(productRecords.filter(Boolean).map((p) => [p.id, p]));
  const supplierMap    = new Map(suppliers.map((s) => [s.id, s]));

  // ---- 3. Normalisation pass (registry-driven, no switch) ----
  const events = [];
  const aggregates = {
    firstPurchaseBySupplier: new Map(),
    demandCountByKey:        new Map(),
    supplierTotals:          new Map(), // for milestone computation
  };

  // Supplier lifecycle
  for (const s of suppliers) {
    events.push(..._fromRecord(ET.SUPPLIER_CREATED, s, { supplierName: s.supplierName }, s.createdAt, s.id, ENTITY_TYPE.SUPPLIER));
    if (s.status === 'Archived') {
      events.push(..._fromRecord(ET.SUPPLIER_ARCHIVED, s, { supplierName: s.supplierName }, s.updatedAt || s.createdAt, s.id, ENTITY_TYPE.SUPPLIER));
    }
    if (s.status === 'Merged' && s.mergedDate) {
      events.push(..._fromRecord(ET.SUPPLIER_MERGED, s, { supplierName: s.supplierName, survivorId: s.mergedIntoId, reason: s.mergedReason }, s.mergedDate, s.id, ENTITY_TYPE.SUPPLIER));
    }
    _initSupplierAgg(aggregates.supplierTotals, s.id, s.supplierName);
  }

  // Receiving sessions
  for (const s of sessions) {
    events.push(..._fromRecord(
      ET.RECEIVING_SESSION_STARTED, s,
      { invoiceNumber: s.invoiceNumber, supplierName: s.supplierName, supplierId: s.supplierId },
      s.createdAt, s.id, ENTITY_TYPE.RECEIVING_SESSION,
      s.supplierId ? [{ type: ENTITY_TYPE.SUPPLIER, id: s.supplierId }] : []
    ));
    if (s.status === 'Completed' && s.completedAt) {
      events.push(..._fromRecord(
        ET.RECEIVING_SESSION_COMPLETED, s,
        { invoiceNumber: s.invoiceNumber, linesImported: s.linesImported, linesReviewed: s.linesReviewed, duration: s.duration },
        s.completedAt, s.id, ENTITY_TYPE.RECEIVING_SESSION,
        s.supplierId ? [{ type: ENTITY_TYPE.SUPPLIER, id: s.supplierId }] : []
      ));
      // Aggregate
      const agg = aggregates.supplierTotals.get(s.supplierId);
      if (agg) agg.sessionCount++;
    }
    if (s.status === 'Cancelled') {
      events.push(..._fromRecord(ET.RECEIVING_SESSION_CANCELLED, s, { invoiceNumber: s.invoiceNumber, notes: s.notes }, s.updatedAt || s.createdAt, s.id, ENTITY_TYPE.RECEIVING_SESSION));
    }
  }

  // Lots
  for (const l of lots) {
    const product = productMap.get(l.productId);
    const productName = product?.productName || null;
    const ctx = { productName };

    events.push(..._fromRecord(
      ET.INVENTORY_LOT_CREATED, l,
      { quantityReceived: l.quantityReceived, unitCost: l.unitCost, expiryDate: l.expiryDate, batchNumber: l.batchNumber, shelfLocation: l.shelfLocation, productName },
      l.createdAt, l.id, ENTITY_TYPE.INVENTORY_LOT,
      [
        ...(l.productId  ? [{ type: ENTITY_TYPE.PRODUCT,  id: l.productId  }] : []),
        ...(l.supplierId ? [{ type: ENTITY_TYPE.SUPPLIER, id: l.supplierId }] : []),
      ]
    ));

    if (l.expiryDate != null) {
      const daysToExpiry = Math.floor((l.expiryDate - now) / 86400000);
      if (l.expiryDate < now) {
        events.push(..._fromRecord(
          ET.INVENTORY_LOT_EXPIRED, l,
          { daysOverdue: Math.abs(daysToExpiry), quantityAvailable: l.quantityAvailable, unitCost: l.unitCost, productName },
          l.expiryDate, l.id, ENTITY_TYPE.INVENTORY_LOT,
          l.productId ? [{ type: ENTITY_TYPE.PRODUCT, id: l.productId }] : []
        ));
      } else if (l.expiryDate < now + nearExpiryMs && l.quantityAvailable > 0) {
        events.push(..._fromRecord(
          ET.INVENTORY_LOT_NEAR_EXPIRY, l,
          { daysToExpiry, quantityAvailable: l.quantityAvailable, unitCost: l.unitCost, productName },
          now, l.id, ENTITY_TYPE.INVENTORY_LOT,
          l.productId ? [{ type: ENTITY_TYPE.PRODUCT, id: l.productId }] : []
        ));
      }
    }
  }

  // Purchases (with first-purchase detection)
  for (const p of purchases) {
    if (p.supplierId) {
      const fp = aggregates.firstPurchaseBySupplier;
      if (!fp.has(p.supplierId) || p.purchaseDate < fp.get(p.supplierId)) {
        fp.set(p.supplierId, p.purchaseDate);
      }
    }
  }
  for (const p of purchases) {
    const productName  = productMap.get(p.productId)?.productName || null;
    const supplierName = supplierMap.get(p.supplierId)?.supplierName || null;
    const isFirst      = p.supplierId && aggregates.firstPurchaseBySupplier.get(p.supplierId) === p.purchaseDate;
    const lineValue    = (p.quantity || 0) * (p.unitCost || 0);

    events.push(..._fromRecord(
      isFirst ? ET.SUPPLIER_FIRST_PURCHASE : ET.SUPPLIER_PURCHASE_RECORDED,
      p,
      { productName, supplierName, quantity: p.quantity, unitCost: p.unitCost, totalValue: lineValue, invoiceNumber: p.invoiceNumber },
      p.purchaseDate, p.id, ENTITY_TYPE.RECEIVING_SESSION,
      [
        ...(p.productId  ? [{ type: ENTITY_TYPE.PRODUCT,  id: p.productId  }] : []),
        ...(p.supplierId ? [{ type: ENTITY_TYPE.SUPPLIER, id: p.supplierId }] : []),
      ]
    ));

    // Aggregate for milestones
    const agg = aggregates.supplierTotals.get(p.supplierId);
    if (agg) {
      agg.totalPurchaseValue += lineValue;
      if (p.productId) agg.productIds.add(p.productId);
      if (!agg.firstPurchaseDate || p.purchaseDate < agg.firstPurchaseDate) {
        agg.firstPurchaseDate = p.purchaseDate;
      }
    }
  }

  // Demand
  for (const d of demands) {
    const productName = productMap.get(d.productId)?.productName || d.productName || null;
    const key         = d.productId || d.productName?.toLowerCase() || 'unknown';
    const count       = (aggregates.demandCountByKey.get(key) || 0) + 1;
    aggregates.demandCountByKey.set(key, count);

    events.push(..._fromRecord(
      count > 1 ? ET.DEMAND_REPEAT_DETECTED : ET.DEMAND_CAPTURED,
      d,
      { productName, reason: d.reason, requestedQty: d.requestedQty, missingQty: d.missingQty, repeatCount: count,
        estimatedLoss: d.estimatedPrice ? (d.missingQty || 0) * d.estimatedPrice : null,
        productCurrentStock: productMap.get(d.productId)?.currentStock ?? null },
      d.loggedAt || d.createdAt, d.id, ENTITY_TYPE.DEMAND_ENTRY,
      d.productId ? [{ type: ENTITY_TYPE.PRODUCT, id: d.productId }] : []
    ));

    if (d.status === 'Resolved' && d.resolvedAt) {
      events.push(..._fromRecord(
        ET.DEMAND_RESOLVED, d, { productName },
        d.resolvedAt, d.id, ENTITY_TYPE.DEMAND_ENTRY,
        d.productId ? [{ type: ENTITY_TYPE.PRODUCT, id: d.productId }] : []
      ));
    }
  }

  // Review items
  for (const r of reviewItems) {
    events.push(..._fromRecord(
      ET.REVIEW_ITEM_RAISED, r,
      { category: r.category, severity: r.severity, originalValue: r.originalValue },
      r.createdAt, r.id, ENTITY_TYPE.REVIEW_ITEM
    ));
    if (r.status === 'Resolved' && r.resolvedAt) {
      events.push(..._fromRecord(
        ET.REVIEW_ITEM_RESOLVED, r, { category: r.category, notes: r.notes },
        r.resolvedAt, r.id, ENTITY_TYPE.REVIEW_ITEM
      ));
    }
  }

  // ---- 4. Synthetic events ----
  let syntheticEvents = [];
  if (includeSynthetic) {
    // Finalise aggregates
    for (const agg of aggregates.supplierTotals.values()) {
      agg.productCount = agg.productIds.size;
      delete agg.productIds;
    }
    syntheticEvents = generateSyntheticEvents({
      supplierAggregates: [...aggregates.supplierTotals.values()],
      demandFrequencies:  [...aggregates.demandCountByKey.entries()].map(([key, count]) => {
        const d = demands.find((x) => (x.productId || x.productName?.toLowerCase() || 'unknown') === key);
        return { productId: d?.productId || null, productName: productMap.get(d?.productId)?.productName || d?.productName || key, count };
      }),
      reviewItems,
      now,
    });
    events.push(...syntheticEvents);
  }

  // ---- 5. Importance reclassification ----
  const afterImportance = reclassifyImportance(events);

  // ---- 6. Semantic reclassification ----
  const afterSemantics = reclassifySemantics(afterImportance);

  // ---- 7. Filter ----
  let filtered = afterSemantics;
  if (!includeSynthetic)        filtered = filtered.filter((e) => !e.synthetic);
  if (fromTs != null)           filtered = filtered.filter((e) => e.timestamp >= fromTs);
  if (toTs   != null)           filtered = filtered.filter((e) => e.timestamp <= toTs);
  if (categories?.length)       filtered = filtered.filter((e) => categories.includes(e.category));
  if (importanceLevels?.length) filtered = filtered.filter((e) => importanceLevels.includes(e.importance));

  // ---- 8. Sort + limit ----
  filtered.sort((a, b) => b.timestamp - a.timestamp);
  const limited = filtered.slice(0, limit);

  // ---- 9. Timeline metadata ----
  const timeline = _buildTimelineMeta(limited, now);

  return {
    events:           limited,
    timeline,
    totalBeforeLimit: filtered.length,
    assembledAt:      now,
  };
}

// ================================================================
// REGISTRY-DRIVEN EVENT CREATION (no switch statements)
// ================================================================

function _fromRecord(eventType, record, extraMetadata, timestamp, entityId, entityType, relatedEntities = []) {
  const def = getDefinition(eventType);
  if (!def) {
    console.warn(`[EventAssembler] No registry definition for "${eventType}" — skipping.`);
    return [];
  }

  const metadata = { ...def.buildMetadata(record, extraMetadata), ...extraMetadata };

  return [createPlatformEvent({
    eventType,
    category:        def.category,
    importance:      def.importance,
    strategicIntent: def.strategicIntent,
    obligationType:  def.obligationType,
    timestamp:       timestamp ?? Date.now(),
    entityType,
    entityId,
    title:           def.title,
    description:     _buildDescription(eventType, metadata),
    sourceModule:    def.sourceModule,
    relatedEntities,
    metadata,
    synthetic:       false,
  })];
}

function _buildDescription(eventType, meta) {
  const templates = {
    [ET.RECEIVING_SESSION_STARTED]:   () => `Invoice ${meta.invoiceNumber || 'unnumbered'} — ${meta.supplierName || 'unknown supplier'}.`,
    [ET.RECEIVING_SESSION_COMPLETED]: () => `${meta.linesImported || 0} lot${(meta.linesImported||0)!==1?'s':''} created. ${meta.linesReviewed||0} item${(meta.linesReviewed||0)!==1?'s':''} in review queue.`,
    [ET.RECEIVING_SESSION_CANCELLED]: () => `Invoice ${meta.invoiceNumber || 'unnumbered'} cancelled.`,
    [ET.RECEIVING_INVOICE_RECEIVED]:  () => `Invoice ${meta.invoiceNumber || 'unnumbered'} received and committed.`,
    [ET.INVENTORY_LOT_CREATED]:       () => `${meta.productName || 'Product'} — qty ${meta.quantityReceived}, exp ${meta.expiryDate ? new Date(meta.expiryDate).toLocaleDateString('en-NG') : 'none'}.`,
    [ET.INVENTORY_LOT_EXPIRED]:       () => `${meta.productName || 'Product'} lot expired ${meta.daysOverdue || 0} day${(meta.daysOverdue||0)!==1?'s':''} ago. ${meta.quantityAvailable} unit${(meta.quantityAvailable||0)!==1?'s':''} affected.`,
    [ET.INVENTORY_LOT_NEAR_EXPIRY]:   () => `${meta.productName || 'Product'} expires in ${meta.daysToExpiry} day${meta.daysToExpiry!==1?'s':''}. ${meta.quantityAvailable} unit${(meta.quantityAvailable||0)!==1?'s':''} remaining.`,
    [ET.INVENTORY_STOCK_OUT]:         () => `${meta.productName || 'Product'} is out of stock.`,
    [ET.INVENTORY_LOW_STOCK]:         () => `${meta.productName || 'Product'} — ${meta.currentStock} unit${(meta.currentStock||0)!==1?'s':''} remaining.`,
    [ET.SUPPLIER_CREATED]:            () => `${meta.supplierName} added to the platform.`,
    [ET.SUPPLIER_ARCHIVED]:           () => `${meta.supplierName} archived.`,
    [ET.SUPPLIER_MERGED]:             () => `${meta.supplierName} merged into ${meta.survivorId || 'another supplier'}.`,
    [ET.SUPPLIER_FIRST_PURCHASE]:     () => `First purchase from ${meta.supplierName || 'supplier'} — ${meta.quantity || 0} units @ ₦${(meta.unitCost||0).toLocaleString('en-NG')}.`,
    [ET.SUPPLIER_PURCHASE_RECORDED]:  () => `${meta.productName || 'Product'} — ${meta.quantity || 0} units @ ₦${(meta.unitCost||0).toLocaleString('en-NG')}.`,
    [ET.DEMAND_CAPTURED]:             () => `${meta.productName || 'Product'} — ${meta.reason}, ${meta.missingQty || 0} unit${(meta.missingQty||0)!==1?'s':''} missing.`,
    [ET.DEMAND_REPEAT_DETECTED]:      () => `${meta.productName || 'Product'} requested ${meta.repeatCount} time${meta.repeatCount!==1?'s':''}. Reason: ${meta.reason}.`,
    [ET.DEMAND_RESOLVED]:             () => `${meta.productName || 'Product'} demand marked as resolved.`,
    [ET.REVIEW_ITEM_RAISED]:          () => `${meta.category}: ${meta.originalValue || 'see details'}.`,
    [ET.REVIEW_ITEM_RESOLVED]:        () => `Review item resolved.${meta.notes ? ' ' + meta.notes : ''}`,
    [ET.MIGRATION_IMPORT_COMMITTED]:  () => `${meta.rowsImported || 0} rows committed from ${meta.workbookName || 'workbook'}.`,
    [ET.MIGRATION_IMPORT_FAILED]:     () => `Import from ${meta.workbookName || 'workbook'} failed and was rolled back.`,
  };
  const builder = templates[eventType];
  return builder ? builder() : eventType;
}

// ================================================================
// SCOPED DATA LOADERS
// ================================================================

async function _load(tableName, entityType, entityId, fkField) {
  const table = db[tableName];
  if (!table) return [];
  if (entityType && entityId && fkField) {
    return table.where(fkField).equals(entityId).toArray().catch(() => table.toArray());
  }
  return table.toArray();
}

async function _loadSuppliers(entityType, entityId) {
  if (entityType === ENTITY_TYPE.SUPPLIER && entityId) {
    const s = await db.Suppliers.get(entityId);
    return s ? [s] : [];
  }
  return db.Suppliers.toArray();
}

// ================================================================
// AGGREGATE HELPERS
// ================================================================

function _initSupplierAgg(map, supplierId, supplierName) {
  if (!map.has(supplierId)) {
    map.set(supplierId, {
      supplierId,
      supplierName,
      totalPurchaseValue: 0,
      sessionCount:       0,
      productIds:         new Set(),
      productCount:       0,
      firstPurchaseDate:  null,
    });
  }
}

// ================================================================
// TIMELINE METADATA
// ================================================================

function _buildTimelineMeta(events, now) {
  const todayStart  = _startOfDay(now);
  const weekStart   = todayStart - (new Date(now).getDay() * 86400000);
  const monthStart  = _startOfMonth(now);

  return {
    totalEvents:     events.length,
    criticalCount:   events.filter((e) => e.importance === 'CRITICAL').length,
    warningCount:    events.filter((e) => e.importance === 'WARNING').length,
    successCount:    events.filter((e) => e.importance === 'SUCCESS').length,
    syntheticCount:  events.filter((e) => e.synthetic).length,
    protectCount:    events.filter((e) => e.strategicIntent === 'PROTECT').length,
    growCount:       events.filter((e) => e.strategicIntent === 'GROW').length,
    mandatoryCount:  events.filter((e) => e.obligationType  === 'MANDATORY').length,
    todayCount:      events.filter((e) => e.timestamp >= todayStart).length,
    weekCount:       events.filter((e) => e.timestamp >= weekStart).length,
    monthCount:      events.filter((e) => e.timestamp >= monthStart).length,
    oldestEvent:     events.length ? events[events.length - 1].timestamp : null,
    newestEvent:     events.length ? events[0].timestamp : null,
  };
}

function _startOfDay(ts)   { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime(); }
function _startOfMonth(ts) { const d = new Date(ts); d.setDate(1); d.setHours(0,0,0,0); return d.getTime(); }
