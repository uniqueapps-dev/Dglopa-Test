/**
 * DGLOPA PLATFORM — EVENT REGISTRY
 * DT-008A: One registry describing every supported event type,
 * its default importance, its category, and its synthetic generator
 * hooks. Future modules register their event types here; no other
 * framework file needs to change.
 *
 * DESIGN PRINCIPLE: Open/Closed.
 * The registry is open for extension (registerEventType) and closed
 * for modification (existing entries are frozen on read).
 */

import {
  IMPORTANCE, CATEGORY, SOURCE_MODULE,
} from './eventModel.js';

// ================================================================
// BUILT-IN EVENT TYPE DEFINITIONS
// ================================================================

const _registry = new Map();

// Helper to register once
function reg(type, def) {
  _registry.set(type, Object.freeze({ eventType: type, ...def }));
}

// ---- RECEIVING ----
reg('RECEIVING_SESSION_STARTED',   { category: CATEGORY.OPERATIONAL, importance: IMPORTANCE.INFO,    sourceModule: SOURCE_MODULE.RECEIVING, description: 'A receiving session was opened.' });
reg('RECEIVING_SESSION_COMPLETED', { category: CATEGORY.COMMERCIAL,  importance: IMPORTANCE.SUCCESS,  sourceModule: SOURCE_MODULE.RECEIVING, description: 'A receiving session was committed to inventory.' });
reg('RECEIVING_SESSION_CANCELLED', { category: CATEGORY.OPERATIONAL, importance: IMPORTANCE.WARNING,  sourceModule: SOURCE_MODULE.RECEIVING, description: 'A receiving session was cancelled.' });
reg('INVOICE_RECEIVED',            { category: CATEGORY.COMMERCIAL,  importance: IMPORTANCE.SUCCESS,  sourceModule: SOURCE_MODULE.RECEIVING, description: 'An invoice was received and committed.' });

// ---- INVENTORY ----
reg('LOT_CREATED',                 { category: CATEGORY.INVENTORY,   importance: IMPORTANCE.INFO,    sourceModule: SOURCE_MODULE.INVENTORY, description: 'An inventory lot was created.' });
reg('LOT_EXPIRED',                 { category: CATEGORY.INVENTORY,   importance: IMPORTANCE.WARNING,  sourceModule: SOURCE_MODULE.INVENTORY, description: 'An inventory lot has passed its expiry date.' });
reg('LOT_NEAR_EXPIRY',             { category: CATEGORY.INVENTORY,   importance: IMPORTANCE.WARNING,  sourceModule: SOURCE_MODULE.INVENTORY, description: 'An inventory lot is approaching expiry.' });
reg('STOCK_OUT',                   { category: CATEGORY.INVENTORY,   importance: IMPORTANCE.CRITICAL, sourceModule: SOURCE_MODULE.INVENTORY, description: 'A product is out of stock.' });
reg('LOW_STOCK',                   { category: CATEGORY.INVENTORY,   importance: IMPORTANCE.WARNING,  sourceModule: SOURCE_MODULE.INVENTORY, description: 'A product is below the low-stock threshold.' });

// ---- SUPPLIER ----
reg('SUPPLIER_CREATED',            { category: CATEGORY.ADMINISTRATIVE, importance: IMPORTANCE.INFO,  sourceModule: SOURCE_MODULE.SUPPLIER, description: 'A supplier was added.' });
reg('SUPPLIER_ARCHIVED',           { category: CATEGORY.ADMINISTRATIVE, importance: IMPORTANCE.WARNING, sourceModule: SOURCE_MODULE.SUPPLIER, description: 'A supplier was archived.' });
reg('SUPPLIER_MERGED',             { category: CATEGORY.ADMINISTRATIVE, importance: IMPORTANCE.INFO,   sourceModule: SOURCE_MODULE.SUPPLIER, description: 'A supplier was merged into another.' });
reg('FIRST_PURCHASE',              { category: CATEGORY.COMMERCIAL,  importance: IMPORTANCE.SUCCESS,  sourceModule: SOURCE_MODULE.SUPPLIER, description: 'First purchase from this supplier.' });
reg('PURCHASE_RECORDED',           { category: CATEGORY.COMMERCIAL,  importance: IMPORTANCE.INFO,    sourceModule: SOURCE_MODULE.SUPPLIER, description: 'A purchase was recorded.' });

// ---- DEMAND ----
reg('DEMAND_CAPTURED',             { category: CATEGORY.DEMAND,      importance: IMPORTANCE.WARNING,  sourceModule: SOURCE_MODULE.DEMAND, description: 'An unmet demand was captured.' });
reg('DEMAND_RESOLVED',             { category: CATEGORY.DEMAND,      importance: IMPORTANCE.SUCCESS,  sourceModule: SOURCE_MODULE.DEMAND, description: 'A demand entry was resolved.' });
reg('DEMAND_REPEATED',             { category: CATEGORY.DEMAND,      importance: IMPORTANCE.WARNING,  sourceModule: SOURCE_MODULE.DEMAND, description: 'The same product has been repeatedly requested.' });

// ---- REVIEW ----
reg('REVIEW_ITEM_RAISED',          { category: CATEGORY.REVIEW,      importance: IMPORTANCE.WARNING,  sourceModule: SOURCE_MODULE.REVIEW, description: 'A review item was raised.' });
reg('REVIEW_ITEM_RESOLVED',        { category: CATEGORY.REVIEW,      importance: IMPORTANCE.SUCCESS,  sourceModule: SOURCE_MODULE.REVIEW, description: 'A review item was resolved.' });
reg('REVIEW_QUEUE_CLEARED',        { category: CATEGORY.REVIEW,      importance: IMPORTANCE.SUCCESS,  sourceModule: SOURCE_MODULE.REVIEW, description: 'The review queue has been fully cleared.' });

// ---- MIGRATION ----
reg('IMPORT_COMMITTED',            { category: CATEGORY.MIGRATION,   importance: IMPORTANCE.SUCCESS,  sourceModule: SOURCE_MODULE.MIGRATION, description: 'An import batch was committed to the database.' });
reg('IMPORT_FAILED',               { category: CATEGORY.MIGRATION,   importance: IMPORTANCE.CRITICAL, sourceModule: SOURCE_MODULE.MIGRATION, description: 'An import batch failed and was rolled back.' });

// ---- SYNTHETIC MILESTONES ----
reg('MILESTONE_PURCHASE_VALUE',    { category: CATEGORY.COMMERCIAL,  importance: IMPORTANCE.SUCCESS,  sourceModule: SOURCE_MODULE.SYSTEM, description: 'A purchase value milestone was reached.', synthetic: true });
reg('MILESTONE_SESSION_COUNT',     { category: CATEGORY.OPERATIONAL, importance: IMPORTANCE.SUCCESS,  sourceModule: SOURCE_MODULE.SYSTEM, description: 'A receiving session count milestone was reached.', synthetic: true });
reg('MILESTONE_PRODUCT_COUNT',     { category: CATEGORY.INVENTORY,   importance: IMPORTANCE.SUCCESS,  sourceModule: SOURCE_MODULE.SYSTEM, description: 'A product count milestone was reached.', synthetic: true });
reg('MILESTONE_RELATIONSHIP',      { category: CATEGORY.SUPPLIER,    importance: IMPORTANCE.SUCCESS,  sourceModule: SOURCE_MODULE.SYSTEM, description: 'A supplier relationship milestone was reached.', synthetic: true });
reg('MILESTONE_DEMAND_THRESHOLD',  { category: CATEGORY.DEMAND,      importance: IMPORTANCE.WARNING,  sourceModule: SOURCE_MODULE.SYSTEM, description: 'A repeated demand threshold was reached.', synthetic: true });

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Get the definition for an event type.
 * @param {string} eventType
 * @returns {EventDefinition|null}
 */
export function getEventDefinition(eventType) {
  return _registry.get(eventType) ?? null;
}

/**
 * Get all registered event types.
 * @returns {EventDefinition[]}
 */
export function getAllEventTypes() {
  return [..._registry.values()];
}

/**
 * Register a new event type from an external module.
 * Throws if the type is already registered (prevents silent overwrites).
 *
 * @param {string} eventType  — unique string key
 * @param {object} definition — { category, importance, sourceModule, description, synthetic? }
 */
export function registerEventType(eventType, definition) {
  if (_registry.has(eventType)) {
    throw new Error(`[EventRegistry] Event type "${eventType}" is already registered. Use a unique key.`);
  }
  _registry.set(eventType, Object.freeze({ eventType, ...definition }));
}

/**
 * Get all event types for a given category.
 */
export function getEventTypesByCategory(category) {
  return [..._registry.values()].filter((d) => d.category === category);
}

/**
 * Get all synthetic event type definitions.
 */
export function getSyntheticEventTypes() {
  return [..._registry.values()].filter((d) => d.synthetic === true);
}
