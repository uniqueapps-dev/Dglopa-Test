/**
 * DGLOPA PLATFORM — CONTEXT INTELLIGENCE FRAMEWORK
 * contextConstants.js — DT-008B
 *
 * All controlled vocabularies used across the Context Intelligence Framework.
 *
 * DESIGN PRINCIPLE: Context answers questions that individual events cannot.
 *   Individual event → "What happened?"
 *   Semantic layer   → "What does this mean?"
 *   Context layer    → "How do these events influence one another?"
 *   Commercial layer → "What should be done?"  (future)
 */

// ================================================================
// RELATIONSHIP TYPES
// "How does event A relate to event B?"
// ================================================================
export const RELATIONSHIP_TYPE = Object.freeze({
  CAUSES:       'CAUSES',        // A directly produces B
  RESULTS_IN:   'RESULTS_IN',    // A is a contributing factor in B
  INFLUENCES:   'INFLUENCES',    // A changes the likelihood or severity of B
  BLOCKS:       'BLOCKS',        // A prevents or delays B
  DEPENDS_ON:   'DEPENDS_ON',    // B cannot exist without A
  RELATED_TO:   'RELATED_TO',    // A and B share context but have no causal direction
  REINFORCES:   'REINFORCES',    // A strengthens the signal of B
  CONTRADICTS:  'CONTRADICTS',   // A weakens or contradicts the signal of B
});

// ================================================================
// CONFIDENCE LEVELS
// "How well-evidenced is this context?"
// Confidence measures evidence quality, not probability.
// ================================================================
export const CONFIDENCE = Object.freeze({
  HIGH:   'HIGH',    // multiple independent corroborating evidence sources
  MEDIUM: 'MEDIUM',  // some corroboration or moderate evidence
  LOW:    'LOW',     // single isolated signal or weak evidence
});

// ================================================================
// CONTEXT TYPES
// "What kind of business understanding does this context represent?"
// ================================================================
export const CONTEXT_TYPE = Object.freeze({
  SUPPLY_CHAIN:       'SupplyChain',      // events spanning supplier → receiving → inventory
  REVENUE_IMPACT:     'RevenueImpact',    // demand not met → estimated lost revenue
  STOCK_HEALTH:       'StockHealth',      // expiry + availability + supplier reliability
  SUPPLIER_BEHAVIOUR: 'SupplierBehaviour',// purchasing patterns and reliability
  DEMAND_SIGNAL:      'DemandSignal',     // repeated or clustered demand patterns
  DATA_QUALITY:       'DataQuality',      // review queue + unmatched records
  OPERATIONAL:        'Operational',      // general operational continuity
  MILESTONE:          'Milestone',        // synthetic milestone context
});

// ================================================================
// CONTEXT WINDOW TYPES
// "Over what time or entity scope is this context computed?"
// ================================================================
export const WINDOW_TYPE = Object.freeze({
  INVOICE:          'Invoice',
  RECEIVING_SESSION:'ReceivingSession',
  SUPPLIER:         'Supplier',
  PRODUCT:          'Product',
  INVENTORY:        'Inventory',
  DEMAND:           'Demand',
  DAILY:            'Daily',
  WEEKLY:           'Weekly',
  MONTHLY:          'Monthly',
});

// ================================================================
// FRAMEWORK METADATA
// ================================================================
export const CONTEXT_VERSION    = '1.0';
export const FRAMEWORK_VERSION  = '1.0.0';
