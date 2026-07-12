/**
 * DGLOPA PLATFORM — EVENT MODEL
 * DT-008A: The standard shape for every business event in the platform.
 *
 * Every operational record — a receiving session, an inventory lot,
 * a demand entry, a review resolution — is translated into this shape
 * before being consumed by any intelligence module.
 *
 * DESIGN PRINCIPLES:
 *   - Flat structure: no deeply nested objects (fast to sort, filter, map)
 *   - Fully self-describing: every consumer gets everything it needs from
 *     the event itself, without a secondary DB lookup
 *   - Importance is a business decision: the framework sets it;
 *     the UI maps it to colours independently
 *   - synthetic: true events are computed, never stored; they are always
 *     reproducible from the same source data
 */

// ================================================================
// IMPORTANCE LEVELS
// ================================================================

export const IMPORTANCE = Object.freeze({
  INFO:     'INFO',
  SUCCESS:  'SUCCESS',
  WARNING:  'WARNING',
  CRITICAL: 'CRITICAL',
});

// ================================================================
// CATEGORIES
// ================================================================

export const CATEGORY = Object.freeze({
  OPERATIONAL:    'Operational',
  COMMERCIAL:     'Commercial',
  INVENTORY:      'Inventory',
  SUPPLIER:       'Supplier',
  DEMAND:         'Demand',
  REVIEW:         'Review',
  MIGRATION:      'Migration',
  ADMINISTRATIVE: 'Administrative',
});

// ================================================================
// ENTITY TYPES
// ================================================================

export const ENTITY_TYPE = Object.freeze({
  PRODUCT:           'Product',
  SUPPLIER:          'Supplier',
  INVENTORY_LOT:     'InventoryLot',
  RECEIVING_SESSION: 'ReceivingSession',
  DEMAND_ENTRY:      'DemandEntry',
  REVIEW_ITEM:       'ReviewItem',
  IMPORT_AUDIT:      'ImportAudit',
  PLATFORM:          'Platform',
});

// ================================================================
// SOURCE MODULES
// ================================================================

export const SOURCE_MODULE = Object.freeze({
  RECEIVING:  'Receiving',
  INVENTORY:  'Inventory',
  SUPPLIER:   'Supplier',
  DEMAND:     'Demand',
  REVIEW:     'Review',
  MIGRATION:  'Migration',
  SYSTEM:     'System',
});

// ================================================================
// EVENT FACTORY
// ================================================================

let _seq = 0;

/**
 * Create a standard business event from raw components.
 * All fields are required to be explicit — no implicit defaults that hide bugs.
 *
 * @param {object} parts
 * @returns {BusinessEvent}
 */
export function createEvent({
  eventType,
  category,
  importance,
  timestamp,
  entityType,
  entityId,
  title,
  description,
  sourceModule,
  relatedEntities = [],
  evidence        = null,
  metadata        = {},
  synthetic       = false,
}) {
  return Object.freeze({
    eventId:         `EVT-${Date.now()}-${++_seq}`,
    eventType,
    category,
    importance,
    timestamp:       timestamp ?? Date.now(),
    entityType,
    entityId:        entityId  ?? null,
    title,
    description,
    sourceModule,
    relatedEntities: Object.freeze(relatedEntities),
    evidence:        evidence ?? null,
    metadata:        Object.freeze(metadata),
    synthetic,
  });
}

/**
 * Reset the event sequence counter (use in tests only).
 */
export function _resetSeq() { _seq = 0; }
