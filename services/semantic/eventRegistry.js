/**
 * DGLOPA PLATFORM — SEMANTIC INTELLIGENCE FRAMEWORK
 * eventRegistry.js — DT-008A (Semantic)
 *
 * Registry-based architecture. No switch statements anywhere in the framework.
 * Every supported event type registers its full semantic definition — including
 * all three orthogonal dimensions — plus a metadata builder function.
 *
 * OPEN/CLOSED PRINCIPLE:
 *   Open  → registerEventType() adds new types
 *   Closed → existing entries are frozen; duplicate keys throw
 *
 * METADATA BUILDERS:
 *   Each registration includes a buildMetadata(record) function
 *   that extracts the relevant fields from the raw operational record.
 *   This keeps domain knowledge in the registry, not scattered across
 *   the assembler or classifier.
 */

import {
  IMPORTANCE, STRATEGIC_INTENT, OBLIGATION_TYPE, CATEGORY, SOURCE_MODULE,
} from './eventConstants.js';

import * as ET from './eventTypes.js';

// ================================================================
// REGISTRY INTERNAL MAP
// ================================================================

const _registry = new Map();

function reg(eventType, def) {
  _registry.set(eventType, Object.freeze({
    eventType,
    synthetic:    false,
    buildMetadata: () => ({}),
    ...def,
  }));
}

// ================================================================
// BUILT-IN EVENT TYPE REGISTRATIONS
// All three dimensions explicit for every type.
// ================================================================

// ---- Receiving ----
reg(ET.RECEIVING_SESSION_STARTED, {
  category:        CATEGORY.OPERATIONAL,
  importance:      IMPORTANCE.INFO,
  strategicIntent: STRATEGIC_INTENT.OPERATE,
  obligationType:  OBLIGATION_TYPE.NONE,
  sourceModule:    SOURCE_MODULE.RECEIVING,
  title:           'Receiving Session Opened',
  buildMetadata:   (r) => ({ invoiceNumber: r.invoiceNumber, supplierName: r.supplierName, supplierId: r.supplierId }),
});

reg(ET.RECEIVING_SESSION_COMPLETED, {
  category:        CATEGORY.COMMERCIAL,
  importance:      IMPORTANCE.SUCCESS,
  strategicIntent: STRATEGIC_INTENT.OPERATE,
  obligationType:  OBLIGATION_TYPE.NONE,
  sourceModule:    SOURCE_MODULE.RECEIVING,
  title:           'Receiving Session Committed',
  buildMetadata:   (r) => ({ invoiceNumber: r.invoiceNumber, linesImported: r.linesImported, linesReviewed: r.linesReviewed, duration: r.duration }),
});

reg(ET.RECEIVING_SESSION_CANCELLED, {
  category:        CATEGORY.OPERATIONAL,
  importance:      IMPORTANCE.WARNING,
  strategicIntent: STRATEGIC_INTENT.LEARN,
  obligationType:  OBLIGATION_TYPE.ASPIRATIONAL,
  sourceModule:    SOURCE_MODULE.RECEIVING,
  title:           'Receiving Session Cancelled',
  buildMetadata:   (r) => ({ invoiceNumber: r.invoiceNumber, notes: r.notes }),
});

reg(ET.RECEIVING_INVOICE_RECEIVED, {
  category:        CATEGORY.COMMERCIAL,
  importance:      IMPORTANCE.SUCCESS,
  strategicIntent: STRATEGIC_INTENT.GROW,
  obligationType:  OBLIGATION_TYPE.NONE,
  sourceModule:    SOURCE_MODULE.RECEIVING,
  title:           'Invoice Received',
  buildMetadata:   (r) => ({ invoiceNumber: r.invoiceNumber, supplierId: r.supplierId }),
});

// ---- Inventory ----
reg(ET.INVENTORY_LOT_CREATED, {
  category:        CATEGORY.INVENTORY,
  importance:      IMPORTANCE.INFO,
  strategicIntent: STRATEGIC_INTENT.OPERATE,
  obligationType:  OBLIGATION_TYPE.NONE,
  sourceModule:    SOURCE_MODULE.INVENTORY,
  title:           'Inventory Lot Created',
  buildMetadata:   (r) => ({ quantityReceived: r.quantityReceived, unitCost: r.unitCost, expiryDate: r.expiryDate, batchNumber: r.batchNumber, shelfLocation: r.shelfLocation }),
});

reg(ET.INVENTORY_LOT_EXPIRED, {
  category:        CATEGORY.INVENTORY,
  importance:      IMPORTANCE.CRITICAL,
  strategicIntent: STRATEGIC_INTENT.PROTECT,
  obligationType:  OBLIGATION_TYPE.MANDATORY,
  sourceModule:    SOURCE_MODULE.INVENTORY,
  title:           'Lot Expired',
  buildMetadata:   (r, ctx) => ({ daysOverdue: ctx?.daysOverdue, quantityAvailable: r.quantityAvailable, unitCost: r.unitCost }),
});

reg(ET.INVENTORY_LOT_NEAR_EXPIRY, {
  category:        CATEGORY.INVENTORY,
  importance:      IMPORTANCE.WARNING,
  strategicIntent: STRATEGIC_INTENT.PROTECT,
  obligationType:  OBLIGATION_TYPE.ASPIRATIONAL,
  sourceModule:    SOURCE_MODULE.INVENTORY,
  title:           'Lot Near Expiry',
  buildMetadata:   (r, ctx) => ({ daysToExpiry: ctx?.daysToExpiry, quantityAvailable: r.quantityAvailable, unitCost: r.unitCost }),
});

reg(ET.INVENTORY_STOCK_OUT, {
  category:        CATEGORY.INVENTORY,
  importance:      IMPORTANCE.CRITICAL,
  strategicIntent: STRATEGIC_INTENT.GROW,
  obligationType:  OBLIGATION_TYPE.MANDATORY,
  sourceModule:    SOURCE_MODULE.INVENTORY,
  title:           'Product Out of Stock',
  buildMetadata:   (r) => ({ productId: r.id, productName: r.productName }),
});

reg(ET.INVENTORY_LOW_STOCK, {
  category:        CATEGORY.INVENTORY,
  importance:      IMPORTANCE.WARNING,
  strategicIntent: STRATEGIC_INTENT.GROW,
  obligationType:  OBLIGATION_TYPE.ASPIRATIONAL,
  sourceModule:    SOURCE_MODULE.INVENTORY,
  title:           'Low Stock',
  buildMetadata:   (r, ctx) => ({ currentStock: ctx?.currentStock, productName: r.productName }),
});

// ---- Supplier ----
reg(ET.SUPPLIER_CREATED, {
  category:        CATEGORY.ADMINISTRATIVE,
  importance:      IMPORTANCE.INFO,
  strategicIntent: STRATEGIC_INTENT.GROW,
  obligationType:  OBLIGATION_TYPE.NONE,
  sourceModule:    SOURCE_MODULE.SUPPLIER,
  title:           'Supplier Added',
  buildMetadata:   (r) => ({ supplierName: r.supplierName, paymentMethod: r.paymentMethod }),
});

reg(ET.SUPPLIER_ARCHIVED, {
  category:        CATEGORY.ADMINISTRATIVE,
  importance:      IMPORTANCE.WARNING,
  strategicIntent: STRATEGIC_INTENT.LEARN,
  obligationType:  OBLIGATION_TYPE.NONE,
  sourceModule:    SOURCE_MODULE.SUPPLIER,
  title:           'Supplier Archived',
  buildMetadata:   (r) => ({ supplierName: r.supplierName }),
});

reg(ET.SUPPLIER_MERGED, {
  category:        CATEGORY.ADMINISTRATIVE,
  importance:      IMPORTANCE.INFO,
  strategicIntent: STRATEGIC_INTENT.LEARN,
  obligationType:  OBLIGATION_TYPE.NONE,
  sourceModule:    SOURCE_MODULE.SUPPLIER,
  title:           'Supplier Merged',
  buildMetadata:   (r) => ({ supplierName: r.supplierName, survivorId: r.mergedIntoId, reason: r.mergedReason }),
});

reg(ET.SUPPLIER_FIRST_PURCHASE, {
  category:        CATEGORY.COMMERCIAL,
  importance:      IMPORTANCE.SUCCESS,
  strategicIntent: STRATEGIC_INTENT.GROW,
  obligationType:  OBLIGATION_TYPE.NONE,
  sourceModule:    SOURCE_MODULE.SUPPLIER,
  title:           'First Purchase from Supplier',
  buildMetadata:   (r, ctx) => ({ supplierName: ctx?.supplierName, quantity: r.quantity, unitCost: r.unitCost, totalValue: (r.quantity || 0) * (r.unitCost || 0) }),
});

reg(ET.SUPPLIER_PURCHASE_RECORDED, {
  category:        CATEGORY.COMMERCIAL,
  importance:      IMPORTANCE.INFO,
  strategicIntent: STRATEGIC_INTENT.OPERATE,
  obligationType:  OBLIGATION_TYPE.NONE,
  sourceModule:    SOURCE_MODULE.SUPPLIER,
  title:           'Purchase Recorded',
  buildMetadata:   (r, ctx) => ({ supplierName: ctx?.supplierName, quantity: r.quantity, unitCost: r.unitCost, totalValue: (r.quantity || 0) * (r.unitCost || 0), invoiceNumber: r.invoiceNumber }),
});

// ---- Demand ----
reg(ET.DEMAND_CAPTURED, {
  category:        CATEGORY.DEMAND,
  importance:      IMPORTANCE.WARNING,
  strategicIntent: STRATEGIC_INTENT.GROW,
  obligationType:  OBLIGATION_TYPE.ASPIRATIONAL,
  sourceModule:    SOURCE_MODULE.DEMAND,
  title:           'Unmet Demand Captured',
  buildMetadata:   (r, ctx) => ({ productName: ctx?.productName || r.productName, reason: r.reason, requestedQty: r.requestedQty, missingQty: r.missingQty, estimatedLoss: r.estimatedPrice ? (r.missingQty || 0) * r.estimatedPrice : null }),
});

reg(ET.DEMAND_REPEAT_DETECTED, {
  category:        CATEGORY.DEMAND,
  importance:      IMPORTANCE.WARNING,
  strategicIntent: STRATEGIC_INTENT.GROW,
  obligationType:  OBLIGATION_TYPE.ASPIRATIONAL,
  sourceModule:    SOURCE_MODULE.DEMAND,
  title:           'Repeated Demand Detected',
  buildMetadata:   (r, ctx) => ({ productName: ctx?.productName || r.productName, repeatCount: ctx?.repeatCount, reason: r.reason }),
});

reg(ET.DEMAND_RESOLVED, {
  category:        CATEGORY.DEMAND,
  importance:      IMPORTANCE.SUCCESS,
  strategicIntent: STRATEGIC_INTENT.OPERATE,
  obligationType:  OBLIGATION_TYPE.NONE,
  sourceModule:    SOURCE_MODULE.DEMAND,
  title:           'Demand Resolved',
  buildMetadata:   (r, ctx) => ({ productName: ctx?.productName || r.productName }),
});

// ---- Review ----
reg(ET.REVIEW_ITEM_RAISED, {
  category:        CATEGORY.REVIEW,
  importance:      IMPORTANCE.WARNING,
  strategicIntent: STRATEGIC_INTENT.LEARN,
  obligationType:  OBLIGATION_TYPE.ASPIRATIONAL,
  sourceModule:    SOURCE_MODULE.REVIEW,
  title:           'Review Item Raised',
  buildMetadata:   (r) => ({ category: r.category, severity: r.severity, originalValue: r.originalValue }),
});

reg(ET.REVIEW_ITEM_RESOLVED, {
  category:        CATEGORY.REVIEW,
  importance:      IMPORTANCE.SUCCESS,
  strategicIntent: STRATEGIC_INTENT.OPERATE,
  obligationType:  OBLIGATION_TYPE.NONE,
  sourceModule:    SOURCE_MODULE.REVIEW,
  title:           'Review Item Resolved',
  buildMetadata:   (r) => ({ category: r.category, notes: r.notes }),
});

// ---- Migration ----
reg(ET.MIGRATION_IMPORT_COMMITTED, {
  category:        CATEGORY.MIGRATION,
  importance:      IMPORTANCE.SUCCESS,
  strategicIntent: STRATEGIC_INTENT.OPERATE,
  obligationType:  OBLIGATION_TYPE.NONE,
  sourceModule:    SOURCE_MODULE.MIGRATION,
  title:           'Import Committed',
  buildMetadata:   (r) => ({ workbookName: r.workbookName, rowsImported: r.rowsImported, rowsReviewed: r.rowsReviewed }),
});

reg(ET.MIGRATION_IMPORT_FAILED, {
  category:        CATEGORY.MIGRATION,
  importance:      IMPORTANCE.CRITICAL,
  strategicIntent: STRATEGIC_INTENT.PROTECT,
  obligationType:  OBLIGATION_TYPE.MANDATORY,
  sourceModule:    SOURCE_MODULE.MIGRATION,
  title:           'Import Failed — Rolled Back',
  buildMetadata:   (r) => ({ workbookName: r.workbookName, errorMessage: r.notes }),
});

// ---- Synthetic Milestones ----
[
  [ET.MILESTONE_PURCHASE_VALUE,   CATEGORY.COMMERCIAL,     STRATEGIC_INTENT.GROW,    'Purchase Value Milestone'],
  [ET.MILESTONE_SESSION_COUNT,    CATEGORY.OPERATIONAL,    STRATEGIC_INTENT.GROW,    'Receiving Session Milestone'],
  [ET.MILESTONE_PRODUCT_COUNT,    CATEGORY.INVENTORY,      STRATEGIC_INTENT.GROW,    'Products Supplied Milestone'],
  [ET.MILESTONE_RELATIONSHIP,     CATEGORY.SUPPLIER,       STRATEGIC_INTENT.GROW,    'Partnership Milestone'],
  [ET.MILESTONE_DEMAND_THRESHOLD, CATEGORY.DEMAND,         STRATEGIC_INTENT.GROW,    'Demand Threshold Milestone'],
  [ET.MILESTONE_REVIEW_CLEARED,   CATEGORY.REVIEW,         STRATEGIC_INTENT.OPERATE, 'Review Queue Cleared'],
].forEach(([eventType, category, strategicIntent, title]) => {
  reg(eventType, {
    category,
    importance:      IMPORTANCE.SUCCESS,
    strategicIntent,
    obligationType:  OBLIGATION_TYPE.NONE,
    sourceModule:    SOURCE_MODULE.SYSTEM,
    title,
    synthetic:       true,
    buildMetadata:   (r, ctx) => ({ ...ctx }),
  });
});

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Get the full definition for an event type.
 * @param {string} eventType
 * @returns {EventDefinition|null}
 */
export function getDefinition(eventType) {
  return _registry.get(eventType) ?? null;
}

/**
 * Get all registered definitions.
 */
export function getAllDefinitions() {
  return [..._registry.values()];
}

/**
 * Register a new event type. Throws if already registered.
 * @param {string} eventType
 * @param {EventDefinition} definition
 */
export function registerEventType(eventType, definition) {
  if (_registry.has(eventType)) {
    throw new Error(`[EventRegistry] Event type "${eventType}" is already registered.`);
  }
  _registry.set(eventType, Object.freeze({
    eventType,
    synthetic:    false,
    buildMetadata: () => ({}),
    ...definition,
  }));
}

/**
 * Get definitions for a specific category.
 */
export function getDefinitionsByCategory(category) {
  return [..._registry.values()].filter((d) => d.category === category);
}

/**
 * Get all synthetic event definitions.
 */
export function getSyntheticDefinitions() {
  return [..._registry.values()].filter((d) => d.synthetic === true);
}

/**
 * Check if an event type is registered.
 */
export function isRegistered(eventType) {
  return _registry.has(eventType);
}
