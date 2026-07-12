/**
 * DGLOPA PLATFORM — SEMANTIC INTELLIGENCE FRAMEWORK
 * eventConstants.js — DT-008A (Semantic)
 *
 * All controlled vocabularies used across the Semantic Intelligence Framework.
 *
 * DESIGN PRINCIPLE: Every semantic dimension answers exactly one question.
 * The three dimensions are orthogonal — no field encodes two meanings.
 *
 *   IMPORTANCE      → "How urgent is this?"
 *   STRATEGIC_INTENT → "Why does this matter to the business?"
 *   OBLIGATION_TYPE → "What is the nature of the commitment?"
 *
 * Consumers map these to colours, icons, sort order, or routing rules
 * independently. The framework never prescribes presentation.
 */

// ================================================================
// DIMENSION 1: IMPORTANCE
// "How urgent is this?"
// ================================================================
export const IMPORTANCE = Object.freeze({
  INFO:     'INFO',
  SUCCESS:  'SUCCESS',
  WARNING:  'WARNING',
  CRITICAL: 'CRITICAL',
});

// ================================================================
// DIMENSION 2: STRATEGIC INTENT
// "Why does this matter to the business?"
// ================================================================
export const STRATEGIC_INTENT = Object.freeze({
  PROTECT:  'PROTECT',   // capital preservation, expiry, waste reduction
  GROW:     'GROW',      // revenue opportunity, purchasing, new relationships
  LEARN:    'LEARN',     // data quality, pattern detection, intelligence input
  OPERATE:  'OPERATE',   // standard operational continuity — no special signal
});

// ================================================================
// DIMENSION 3: OBLIGATION TYPE
// "What is the nature of the commitment this event implies?"
// ================================================================
export const OBLIGATION_TYPE = Object.freeze({
  MANDATORY:    'MANDATORY',    // action required — failure to act has consequences
  ASPIRATIONAL: 'ASPIRATIONAL', // action recommended — not acting is acceptable
  NONE:         'NONE',         // informational only — no action implied
});

// ================================================================
// CATEGORIES
// "Which operational domain produced this event?"
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
// FRAMEWORK VERSION
// ================================================================
export const FRAMEWORK_VERSION = '2.0.0';
export const EVENT_VERSION      = '2.0';
