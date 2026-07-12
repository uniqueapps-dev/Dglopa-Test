/**
 * DGLOPA PLATFORM — SUPPLIER TIMELINE SERVICE
 * DT-005B: Assembles a chronological event narrative for a supplier
 * from existing operational records. No timeline table. No duplicate data.
 *
 * ARCHITECTURE:
 *   1. Parallel load of all relevant records for the supplier
 *   2. One normalisation pass — each record mapped to a typed TimelineEvent
 *   3. Merge and sort chronologically (newest first)
 *   4. Group by time bucket (Today / Yesterday / This Week / This Month / Older)
 *
 * TimelineEvent shape:
 *   {
 *     id:           string,      // unique within the timeline
 *     timestamp:    number,      // epoch ms — sort key
 *     type:         string,      // EVENT_TYPES value
 *     category:     string,      // CATEGORIES value — for filter
 *     title:        string,      // short event label
 *     description:  string,      // one-sentence narrative
 *     relatedId:    string|null, // id of the source record
 *     relatedType:  string|null, // 'session'|'lot'|'purchase'|'review'|'product'|'audit'
 *     invoiceNumber:string|null,
 *     productName:  string|null,
 *     sessionId:    string|null,
 *   }
 */

import { db } from '../db/database.js';

// ================================================================
// CONSTANTS
// ================================================================

export const EVENT_TYPES = Object.freeze({
  SUPPLIER_CREATED:      'Supplier Created',
  SUPPLIER_ARCHIVED:     'Supplier Archived',
  SUPPLIER_RESTORED:     'Supplier Restored',
  SUPPLIER_MERGED:       'Merge Completed',
  SUPPLIER_UPDATED:      'Supplier Updated',
  SESSION_STARTED:       'Receiving Session Started',
  SESSION_COMPLETED:     'Receiving Session Completed',
  SESSION_CANCELLED:     'Receiving Session Cancelled',
  INVOICE_RECEIVED:      'Invoice Received',
  LOT_CREATED:           'Inventory Lot Created',
  PRODUCT_ADDED:         'Product Added via Receiving',
  REVIEW_RAISED:         'Review Item Raised',
  REVIEW_RESOLVED:       'Review Item Resolved',
  PURCHASE_RECORDED:     'Purchase Recorded',
});

export const CATEGORIES = Object.freeze({
  ALL:            'All',
  RECEIVING:      'Receiving',
  INVENTORY:      'Inventory',
  PRODUCTS:       'Products',
  REVIEW:         'Review',
  ADMINISTRATION: 'Administration',
});

const CATEGORY_MAP = {
  [EVENT_TYPES.SUPPLIER_CREATED]:   CATEGORIES.ADMINISTRATION,
  [EVENT_TYPES.SUPPLIER_ARCHIVED]:  CATEGORIES.ADMINISTRATION,
  [EVENT_TYPES.SUPPLIER_RESTORED]:  CATEGORIES.ADMINISTRATION,
  [EVENT_TYPES.SUPPLIER_MERGED]:    CATEGORIES.ADMINISTRATION,
  [EVENT_TYPES.SUPPLIER_UPDATED]:   CATEGORIES.ADMINISTRATION,
  [EVENT_TYPES.SESSION_STARTED]:    CATEGORIES.RECEIVING,
  [EVENT_TYPES.SESSION_COMPLETED]:  CATEGORIES.RECEIVING,
  [EVENT_TYPES.SESSION_CANCELLED]:  CATEGORIES.RECEIVING,
  [EVENT_TYPES.INVOICE_RECEIVED]:   CATEGORIES.RECEIVING,
  [EVENT_TYPES.LOT_CREATED]:        CATEGORIES.INVENTORY,
  [EVENT_TYPES.PRODUCT_ADDED]:      CATEGORIES.PRODUCTS,
  [EVENT_TYPES.REVIEW_RAISED]:      CATEGORIES.REVIEW,
  [EVENT_TYPES.REVIEW_RESOLVED]:    CATEGORIES.REVIEW,
  [EVENT_TYPES.PURCHASE_RECORDED]:  CATEGORIES.RECEIVING,
};

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Build the full timeline for a supplier.
 *
 * @param {string} supplierId
 * @param {{ category, query, limit }} options
 * @returns {Promise<{ events: TimelineEvent[], groups: TimelineGroup[] }>}
 */
export async function getSupplierTimeline(supplierId, {
  category = CATEGORIES.ALL,
  query    = '',
  limit    = 200,
} = {}) {
  const supplier = await db.Suppliers.get(supplierId);
  if (!supplier) return { events: [], groups: [] };

  // ---- Parallel load (all at once — no N+1) ----
  const [sessions, lots, purchases, reviewItems, auditEntries] = await Promise.all([
    db.ReceivingSessions.where('supplierId').equals(supplierId).toArray(),
    db.InventoryLots.where('supplierId').equals(supplierId).toArray(),
    db.PurchaseHistory.where('supplierId').equals(supplierId).toArray(),
    db.ReviewQueue.filter((r) => r.notes?.includes(supplierId) || false).toArray(),
    db.AuditLog.where('entityId').equals(supplierId).toArray(),
  ]);

  // Build product name lookup from lot productIds (batch, not N+1)
  const productIds = new Set([
    ...lots.map((l) => l.productId),
    ...purchases.map((p) => p.productId),
  ].filter(Boolean));
  const productList = await Promise.all([...productIds].map((id) => db.Products.get(id)));
  const productMap  = new Map(productList.filter(Boolean).map((p) => [p.id, p]));

  // ---- Assemble events ----
  const events = [
    ..._supplierLifecycleEvents(supplier, auditEntries),
    ..._sessionEvents(sessions),
    ..._lotEvents(lots, productMap),
    ..._purchaseEvents(purchases, productMap),
    ..._reviewEvents(reviewItems),
  ];

  // ---- Filter ----
  let filtered = events;
  if (category && category !== CATEGORIES.ALL) {
    filtered = filtered.filter((e) => e.category === category);
  }
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    filtered = filtered.filter((e) =>
      e.title?.toLowerCase().includes(q)          ||
      e.description?.toLowerCase().includes(q)    ||
      e.invoiceNumber?.toLowerCase().includes(q)  ||
      e.productName?.toLowerCase().includes(q)    ||
      e.sessionId?.toLowerCase().includes(q)
    );
  }

  // ---- Sort newest first ----
  filtered.sort((a, b) => b.timestamp - a.timestamp);
  const limited = filtered.slice(0, limit);

  // ---- Group ----
  const groups = _groupEvents(limited);

  return { events: limited, groups };
}

// ================================================================
// EVENT ASSEMBLERS
// ================================================================

function _supplierLifecycleEvents(supplier, auditEntries) {
  const events = [];

  // Supplier created
  events.push(_event(
    `sup-created-${supplier.id}`,
    supplier.createdAt,
    EVENT_TYPES.SUPPLIER_CREATED,
    'Supplier added to the platform.',
    null, null, null, null
  ));

  // AuditLog events (STATUS_CHANGE, MERGE, etc.)
  for (const entry of auditEntries) {
    if (entry.action === 'STATUS_CHANGE:Archived') {
      events.push(_event(
        `audit-${entry._rowid || entry.id || Math.random()}`,
        entry.performedAt,
        EVENT_TYPES.SUPPLIER_ARCHIVED,
        'Supplier marked as Archived.',
        null, null, null, null
      ));
    } else if (entry.action === 'STATUS_CHANGE:Active') {
      events.push(_event(
        `audit-restore-${entry._rowid || Math.random()}`,
        entry.performedAt,
        EVENT_TYPES.SUPPLIER_RESTORED,
        'Supplier restored to Active status.',
        null, null, null, null
      ));
    } else if (entry.action === 'MERGE') {
      events.push(_event(
        `audit-merge-${entry._rowid || Math.random()}`,
        entry.performedAt,
        EVENT_TYPES.SUPPLIER_MERGED,
        `Merged into supplier ${entry.detail?.survivorId || 'unknown'}.`,
        null, null, null, null
      ));
    }
  }

  return events;
}

function _sessionEvents(sessions) {
  const events = [];
  for (const s of sessions) {
    // Session started (createdAt)
    events.push(_event(
      `sess-start-${s.id}`,
      s.createdAt,
      EVENT_TYPES.SESSION_STARTED,
      `Receiving session opened — Invoice ${s.invoiceNumber || 'unnumbered'}.`,
      s.id, 'session', s.invoiceNumber, null
    ));

    // Session outcome
    if (s.status === 'Completed' && s.completedAt) {
      events.push(_event(
        `sess-done-${s.id}`,
        s.completedAt,
        EVENT_TYPES.SESSION_COMPLETED,
        `Receiving session committed — ${s.linesImported || '?'} lot${(s.linesImported || 0) !== 1 ? 's' : ''} created, ${s.linesReviewed || 0} items queued for review.`,
        s.id, 'session', s.invoiceNumber, null
      ));
      // Invoice received (same time as completion — distinct event type for filtering)
      if (s.invoiceNumber) {
        events.push(_event(
          `inv-${s.id}`,
          s.completedAt,
          EVENT_TYPES.INVOICE_RECEIVED,
          `Invoice ${s.invoiceNumber} received and committed.`,
          s.id, 'session', s.invoiceNumber, null
        ));
      }
    } else if (s.status === 'Cancelled') {
      events.push(_event(
        `sess-cancel-${s.id}`,
        s.updatedAt || s.createdAt,
        EVENT_TYPES.SESSION_CANCELLED,
        `Receiving session cancelled — Invoice ${s.invoiceNumber || 'unnumbered'}.`,
        s.id, 'session', s.invoiceNumber, null
      ));
    }
  }
  return events;
}

function _lotEvents(lots, productMap) {
  const events = [];
  for (const lot of lots) {
    const product = productMap.get(lot.productId);
    const name    = product?.productName || 'Unknown Product';
    events.push(_event(
      `lot-${lot.id}`,
      lot.createdAt,
      EVENT_TYPES.LOT_CREATED,
      `Inventory lot created — ${name}, qty ${lot.quantityReceived}, exp ${lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString('en-NG') : 'none'}.`,
      lot.id, 'lot', lot.invoiceId, name
    ));
  }
  return events;
}

function _purchaseEvents(purchases, productMap) {
  const events = [];
  // De-duplicate: one purchase event per session (not per lot), by grouping on invoiceNumber
  const byInvoice = new Map();
  for (const p of purchases) {
    const key = p.invoiceNumber || p.id;
    if (!byInvoice.has(key)) byInvoice.set(key, []);
    byInvoice.get(key).push(p);
  }
  for (const [invoice, group] of byInvoice.entries()) {
    const earliest = Math.min(...group.map((p) => p.purchaseDate).filter(Boolean));
    const totalQty = group.reduce((s, p) => s + (p.quantity || 0), 0);
    const totalVal = group.reduce((s, p) => s + (p.quantity || 0) * (p.unitCost || 0), 0);
    const productNames = [...new Set(group.map((p) => productMap.get(p.productId)?.productName).filter(Boolean))];

    events.push(_event(
      `pur-${invoice}`,
      earliest,
      EVENT_TYPES.PURCHASE_RECORDED,
      `Purchase recorded — ${group.length} product${group.length !== 1 ? 's' : ''}, ${totalQty} units, ₦${totalVal.toLocaleString('en-NG', { maximumFractionDigits: 2 })}.`,
      group[0]?.id, 'purchase', invoice, productNames[0] || null
    ));
  }
  return events;
}

function _reviewEvents(items) {
  const events = [];
  for (const item of items) {
    events.push(_event(
      `rev-raised-${item.id}`,
      item.createdAt,
      EVENT_TYPES.REVIEW_RAISED,
      `Review item raised — ${item.category}: ${item.description || item.notes || ''}`,
      item.id, 'review', null, null
    ));
    if (item.status === 'Resolved' && item.resolvedAt) {
      events.push(_event(
        `rev-resolved-${item.id}`,
        item.resolvedAt,
        EVENT_TYPES.REVIEW_RESOLVED,
        `Review item resolved — ${item.category}.`,
        item.id, 'review', null, null
      ));
    }
  }
  return events;
}

// ================================================================
// GROUPING
// ================================================================

function _groupEvents(sortedEvents) {
  const now       = Date.now();
  const today     = _startOfDay(now);
  const yesterday = today - 86400000;
  const weekStart = today - (new Date(now).getDay() * 86400000);
  const monthStart= _startOfMonth(now);

  const buckets = [
    { key: 'today',      label: 'Today',              events: [] },
    { key: 'yesterday',  label: 'Yesterday',           events: [] },
    { key: 'this_week',  label: 'Earlier This Week',   events: [] },
    { key: 'this_month', label: 'Earlier This Month',  events: [] },
    { key: 'older',      label: 'Older',               events: [] },
  ];

  for (const event of sortedEvents) {
    const ts = event.timestamp;
    if      (ts >= today)     buckets[0].events.push(event);
    else if (ts >= yesterday) buckets[1].events.push(event);
    else if (ts >= weekStart) buckets[2].events.push(event);
    else if (ts >= monthStart)buckets[3].events.push(event);
    else                      buckets[4].events.push(event);
  }

  return buckets.filter((b) => b.events.length > 0);
}

// ================================================================
// HELPERS
// ================================================================

function _event(id, timestamp, type, description, relatedId, relatedType, invoiceNumber, productName, sessionId = null) {
  return {
    id,
    timestamp:     timestamp || Date.now(),
    type,
    category:      CATEGORY_MAP[type] || CATEGORIES.ADMINISTRATION,
    title:         type,
    description,
    relatedId:     relatedId   || null,
    relatedType:   relatedType || null,
    invoiceNumber: invoiceNumber || null,
    productName:   productName  || null,
    sessionId:     sessionId    || null,
  };
}

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
