/**
 * DGLOPA PLATFORM — EVENT CLASSIFIER
 * DT-008A: Maps raw operational records from every source table
 * to typed BusinessEvent objects using the standard event model.
 *
 * DESIGN PRINCIPLE: One function per source record type.
 * Each classifier function is pure: given a raw record (and optional
 * supporting data), it returns a BusinessEvent or null (if the record
 * does not produce a meaningful event). No DB calls inside classifiers.
 *
 * The EventAssembler calls these functions after bulk-loading all
 * relevant records — the classifiers only transform, never fetch.
 */

import {
  createEvent, IMPORTANCE, CATEGORY, ENTITY_TYPE, SOURCE_MODULE,
} from './eventModel.js';
import { getEventDefinition } from './eventRegistry.js';

// ================================================================
// RECEIVING SESSIONS
// ================================================================

export function classifySession(session) {
  const events = [];

  // Session opened
  events.push(createEvent({
    eventType:    'RECEIVING_SESSION_STARTED',
    category:     CATEGORY.OPERATIONAL,
    importance:   IMPORTANCE.INFO,
    timestamp:    session.createdAt,
    entityType:   ENTITY_TYPE.RECEIVING_SESSION,
    entityId:     session.id,
    title:        'Receiving Session Opened',
    description:  `Invoice ${session.invoiceNumber || 'unnumbered'} — ${session.supplierName || 'unknown supplier'}.`,
    sourceModule: SOURCE_MODULE.RECEIVING,
    relatedEntities: [
      ...(session.supplierId ? [{ type: ENTITY_TYPE.SUPPLIER, id: session.supplierId }] : []),
    ],
    metadata: {
      invoiceNumber: session.invoiceNumber || null,
      supplierName:  session.supplierName  || null,
      supplierId:    session.supplierId    || null,
    },
  }));

  // Session completed
  if (session.status === 'Completed' && session.completedAt) {
    events.push(createEvent({
      eventType:    'RECEIVING_SESSION_COMPLETED',
      category:     CATEGORY.COMMERCIAL,
      importance:   IMPORTANCE.SUCCESS,
      timestamp:    session.completedAt,
      entityType:   ENTITY_TYPE.RECEIVING_SESSION,
      entityId:     session.id,
      title:        'Receiving Session Committed',
      description:  `${session.linesImported || 0} lot${(session.linesImported || 0) !== 1 ? 's' : ''} created. ${session.linesReviewed || 0} item${(session.linesReviewed || 0) !== 1 ? 's' : ''} queued for review.`,
      sourceModule: SOURCE_MODULE.RECEIVING,
      relatedEntities: [
        ...(session.supplierId ? [{ type: ENTITY_TYPE.SUPPLIER, id: session.supplierId }] : []),
      ],
      metadata: {
        invoiceNumber: session.invoiceNumber || null,
        linesImported: session.linesImported || 0,
        linesReviewed: session.linesReviewed || 0,
        duration:      session.duration      || null,
      },
    }));
  }

  // Session cancelled
  if (session.status === 'Cancelled') {
    events.push(createEvent({
      eventType:    'RECEIVING_SESSION_CANCELLED',
      category:     CATEGORY.OPERATIONAL,
      importance:   IMPORTANCE.WARNING,
      timestamp:    session.updatedAt || session.createdAt,
      entityType:   ENTITY_TYPE.RECEIVING_SESSION,
      entityId:     session.id,
      title:        'Receiving Session Cancelled',
      description:  `Invoice ${session.invoiceNumber || 'unnumbered'} was cancelled.`,
      sourceModule: SOURCE_MODULE.RECEIVING,
      metadata: { invoiceNumber: session.invoiceNumber || null },
    }));
  }

  return events;
}

// ================================================================
// INVENTORY LOTS
// ================================================================

export function classifyLot(lot, productName, now, nearExpiryMs) {
  const events = [];

  // Lot created
  events.push(createEvent({
    eventType:    'LOT_CREATED',
    category:     CATEGORY.INVENTORY,
    importance:   IMPORTANCE.INFO,
    timestamp:    lot.createdAt,
    entityType:   ENTITY_TYPE.INVENTORY_LOT,
    entityId:     lot.id,
    title:        'Inventory Lot Created',
    description:  `${productName || 'Unknown product'} — qty ${lot.quantityReceived}, exp ${lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString('en-NG') : 'none'}.`,
    sourceModule: SOURCE_MODULE.INVENTORY,
    relatedEntities: [
      ...(lot.productId  ? [{ type: ENTITY_TYPE.PRODUCT,  id: lot.productId  }] : []),
      ...(lot.supplierId ? [{ type: ENTITY_TYPE.SUPPLIER, id: lot.supplierId }] : []),
    ],
    metadata: {
      productName,
      quantityReceived: lot.quantityReceived,
      unitCost:         lot.unitCost,
      expiryDate:       lot.expiryDate,
      batchNumber:      lot.batchNumber || null,
      shelfLocation:    lot.shelfLocation || null,
    },
  }));

  // Expiry events (computed from current state, not historical)
  if (lot.expiryDate != null) {
    const daysToExpiry = Math.floor((lot.expiryDate - now) / 86400000);
    if (lot.expiryDate < now) {
      events.push(createEvent({
        eventType:    'LOT_EXPIRED',
        category:     CATEGORY.INVENTORY,
        importance:   IMPORTANCE.CRITICAL,
        timestamp:    lot.expiryDate,
        entityType:   ENTITY_TYPE.INVENTORY_LOT,
        entityId:     lot.id,
        title:        'Lot Expired',
        description:  `${productName || 'Product'} lot expired ${Math.abs(daysToExpiry)} day${Math.abs(daysToExpiry) !== 1 ? 's' : ''} ago.`,
        sourceModule: SOURCE_MODULE.INVENTORY,
        relatedEntities: lot.productId ? [{ type: ENTITY_TYPE.PRODUCT, id: lot.productId }] : [],
        metadata: { productName, daysToExpiry, quantityAvailable: lot.quantityAvailable },
      }));
    } else if (lot.expiryDate < now + nearExpiryMs && lot.quantityAvailable > 0) {
      events.push(createEvent({
        eventType:    'LOT_NEAR_EXPIRY',
        category:     CATEGORY.INVENTORY,
        importance:   IMPORTANCE.WARNING,
        timestamp:    now, // current state event — timestamp is now
        entityType:   ENTITY_TYPE.INVENTORY_LOT,
        entityId:     lot.id,
        title:        'Lot Near Expiry',
        description:  `${productName || 'Product'} expires in ${daysToExpiry} day${daysToExpiry !== 1 ? 's' : ''} — ${lot.quantityAvailable} unit${lot.quantityAvailable !== 1 ? 's' : ''} remaining.`,
        sourceModule: SOURCE_MODULE.INVENTORY,
        relatedEntities: lot.productId ? [{ type: ENTITY_TYPE.PRODUCT, id: lot.productId }] : [],
        metadata: { productName, daysToExpiry, quantityAvailable: lot.quantityAvailable },
      }));
    }
  }

  return events;
}

// ================================================================
// PURCHASE HISTORY
// ================================================================

export function classifyPurchase(purchase, productName, supplierName, isFirst = false) {
  const events = [];

  events.push(createEvent({
    eventType:    isFirst ? 'FIRST_PURCHASE' : 'PURCHASE_RECORDED',
    category:     CATEGORY.COMMERCIAL,
    importance:   isFirst ? IMPORTANCE.SUCCESS : IMPORTANCE.INFO,
    timestamp:    purchase.purchaseDate,
    entityType:   ENTITY_TYPE.RECEIVING_SESSION,
    entityId:     purchase.id,
    title:        isFirst ? 'First Purchase from Supplier' : 'Purchase Recorded',
    description:  `${productName || 'Product'} — ${purchase.quantity || 0} units @ ${purchase.unitCost != null ? `₦${Number(purchase.unitCost).toLocaleString('en-NG')}` : 'no cost'}.`,
    sourceModule: SOURCE_MODULE.SUPPLIER,
    relatedEntities: [
      ...(purchase.productId  ? [{ type: ENTITY_TYPE.PRODUCT,  id: purchase.productId  }] : []),
      ...(purchase.supplierId ? [{ type: ENTITY_TYPE.SUPPLIER, id: purchase.supplierId }] : []),
    ],
    metadata: {
      productName,
      supplierName,
      quantity:    purchase.quantity,
      unitCost:    purchase.unitCost,
      totalValue:  (purchase.quantity || 0) * (purchase.unitCost || 0),
      invoiceNumber: purchase.invoiceNumber || null,
      isFirstPurchase: isFirst,
    },
  }));

  return events;
}

// ================================================================
// DEMAND ENTRIES
// ================================================================

export function classifyDemand(demand, productName, isRepeated = false) {
  const events = [];

  if (demand.status !== 'Merged') {
    events.push(createEvent({
      eventType:    isRepeated ? 'DEMAND_REPEATED' : 'DEMAND_CAPTURED',
      category:     CATEGORY.DEMAND,
      importance:   IMPORTANCE.WARNING,
      timestamp:    demand.loggedAt || demand.createdAt,
      entityType:   ENTITY_TYPE.DEMAND_ENTRY,
      entityId:     demand.id,
      title:        isRepeated ? 'Repeated Demand' : 'Unmet Demand Captured',
      description:  `${productName || demand.productName || 'Unknown product'} — ${demand.reason}, ${demand.missingQty || 0} missing.`,
      sourceModule: SOURCE_MODULE.DEMAND,
      relatedEntities: demand.productId ? [{ type: ENTITY_TYPE.PRODUCT, id: demand.productId }] : [],
      metadata: {
        productName: productName || demand.productName,
        reason:      demand.reason,
        requestedQty: demand.requestedQty,
        missingQty:   demand.missingQty,
        estimatedLoss: demand.estimatedPrice != null ? (demand.missingQty || 0) * demand.estimatedPrice : null,
        customerType: demand.customerType || null,
        hasEvidence:  !!demand.evidenceData,
        isRepeated,
      },
    }));
  }

  if (demand.status === 'Resolved' && demand.resolvedAt) {
    events.push(createEvent({
      eventType:    'DEMAND_RESOLVED',
      category:     CATEGORY.DEMAND,
      importance:   IMPORTANCE.SUCCESS,
      timestamp:    demand.resolvedAt,
      entityType:   ENTITY_TYPE.DEMAND_ENTRY,
      entityId:     demand.id,
      title:        'Demand Resolved',
      description:  `${productName || demand.productName || 'Product'} demand marked resolved.`,
      sourceModule: SOURCE_MODULE.DEMAND,
      relatedEntities: demand.productId ? [{ type: ENTITY_TYPE.PRODUCT, id: demand.productId }] : [],
      metadata: { productName: productName || demand.productName },
    }));
  }

  return events;
}

// ================================================================
// SUPPLIER LIFECYCLE
// ================================================================

export function classifySupplier(supplier) {
  const events = [];

  events.push(createEvent({
    eventType:    'SUPPLIER_CREATED',
    category:     CATEGORY.ADMINISTRATIVE,
    importance:   IMPORTANCE.INFO,
    timestamp:    supplier.createdAt,
    entityType:   ENTITY_TYPE.SUPPLIER,
    entityId:     supplier.id,
    title:        'Supplier Added',
    description:  `${supplier.supplierName} added to the platform.`,
    sourceModule: SOURCE_MODULE.SUPPLIER,
    metadata: { supplierName: supplier.supplierName, paymentMethod: supplier.paymentMethod },
  }));

  if (supplier.status === 'Archived') {
    events.push(createEvent({
      eventType:    'SUPPLIER_ARCHIVED',
      category:     CATEGORY.ADMINISTRATIVE,
      importance:   IMPORTANCE.WARNING,
      timestamp:    supplier.updatedAt || supplier.createdAt,
      entityType:   ENTITY_TYPE.SUPPLIER,
      entityId:     supplier.id,
      title:        'Supplier Archived',
      description:  `${supplier.supplierName} was archived.`,
      sourceModule: SOURCE_MODULE.SUPPLIER,
      metadata: { supplierName: supplier.supplierName },
    }));
  }

  if (supplier.status === 'Merged' && supplier.mergedDate) {
    events.push(createEvent({
      eventType:    'SUPPLIER_MERGED',
      category:     CATEGORY.ADMINISTRATIVE,
      importance:   IMPORTANCE.INFO,
      timestamp:    supplier.mergedDate,
      entityType:   ENTITY_TYPE.SUPPLIER,
      entityId:     supplier.id,
      title:        'Supplier Merged',
      description:  `${supplier.supplierName} merged into ${supplier.mergedIntoId}.`,
      sourceModule: SOURCE_MODULE.SUPPLIER,
      relatedEntities: supplier.mergedIntoId ? [{ type: ENTITY_TYPE.SUPPLIER, id: supplier.mergedIntoId }] : [],
      metadata: { supplierName: supplier.supplierName, survivorId: supplier.mergedIntoId },
    }));
  }

  return events;
}

// ================================================================
// REVIEW QUEUE ITEMS
// ================================================================

export function classifyReviewItem(item) {
  const events = [];

  events.push(createEvent({
    eventType:    'REVIEW_ITEM_RAISED',
    category:     CATEGORY.REVIEW,
    importance:   item.severity === 'error' ? IMPORTANCE.CRITICAL : IMPORTANCE.WARNING,
    timestamp:    item.createdAt,
    entityType:   ENTITY_TYPE.REVIEW_ITEM,
    entityId:     item.id,
    title:        `Review: ${item.category}`,
    description:  item.description || item.notes || item.category,
    sourceModule: SOURCE_MODULE.REVIEW,
    metadata: {
      category: item.category,
      severity: item.severity,
      originalValue: item.originalValue || null,
    },
  }));

  if (item.status === 'Resolved' && item.resolvedAt) {
    events.push(createEvent({
      eventType:    'REVIEW_ITEM_RESOLVED',
      category:     CATEGORY.REVIEW,
      importance:   IMPORTANCE.SUCCESS,
      timestamp:    item.resolvedAt,
      entityType:   ENTITY_TYPE.REVIEW_ITEM,
      entityId:     item.id,
      title:        `Resolved: ${item.category}`,
      description:  `Review item resolved.`,
      sourceModule: SOURCE_MODULE.REVIEW,
      metadata: { category: item.category, notes: item.notes || null },
    }));
  }

  return events;
}
