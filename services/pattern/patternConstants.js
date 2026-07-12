/**
 * DGLOPA PLATFORM — PATTERN INTELLIGENCE FRAMEWORK
 * patternConstants.js — DT-008C
 *
 * All controlled vocabularies for the Pattern Intelligence Framework.
 *
 * DESIGN PRINCIPLE (ADR-056):
 *   Patterns are emergent properties of Context Graphs across time.
 *   Pattern discovery consumes Context Graphs, never raw operational records.
 *
 * DESIGN PRINCIPLE (ADR-057):
 *   PATTERN_STRENGTH measures operational magnitude of recurring behaviour.
 *   CONFIDENCE measures evidence quality.
 *   These are independent dimensions. Neither implies the other.
 *
 *   A VERY_HIGH strength pattern may have LOW confidence if it is based on
 *   limited evidence (e.g. one large repeating event).
 *
 *   A HIGH confidence pattern may have LOW strength if the behaviour is
 *   real but operationally minor.
 */

// ================================================================
// PATTERN STRENGTH
// "What is the operational magnitude of this recurring behaviour?"
// ================================================================
export const PATTERN_STRENGTH = Object.freeze({
  VERY_LOW:  'VERY_LOW',
  LOW:       'LOW',
  MEDIUM:    'MEDIUM',
  HIGH:      'HIGH',
  VERY_HIGH: 'VERY_HIGH',
});

// ================================================================
// PATTERN EVOLUTION
// "How is this pattern changing over time?"
// ================================================================
export const PATTERN_EVOLUTION = Object.freeze({
  EMERGING:     'EMERGING',      // pattern appeared recently, not yet established
  STABLE:       'STABLE',        // pattern recurs consistently without major change
  STRENGTHENING:'STRENGTHENING', // pattern is becoming more frequent or severe
  WEAKENING:    'WEAKENING',     // pattern is becoming less frequent or severe
  DISAPPEARING: 'DISAPPEARING',  // pattern has not recurred in recent periods
});

// ================================================================
// PATTERN TYPES
// "What business behaviour does this pattern describe?"
// ================================================================
export const PATTERN_TYPE = Object.freeze({
  REPEATED_STOCKOUT:          'RepeatedStockout',
  SUPPLIER_DELAY:             'SupplierDelay',
  REPEATED_DEMAND:            'RepeatedDemand',
  EXPIRY_LOSS:                'ExpiryLoss',
  PURCHASE_GROWTH:            'PurchaseGrowth',
  SUPPLIER_RELIABILITY:       'SupplierReliability',
  REVIEW_QUEUE_CONGESTION:    'ReviewQueueCongestion',
  DEAD_STOCK:                 'DeadStock',
  MARGIN_COMPRESSION:         'MarginCompression',         // placeholder (future)
  REPLACEMENT_COST_INFLATION: 'ReplacementCostInflation',  // placeholder (future)
  SEASONAL:                   'Seasonal',                  // placeholder (future)
  OPERATIONAL:                'Operational',               // general pattern
});

// ================================================================
// PATTERN RELATIONSHIP TYPES
// "How does one pattern relate to another pattern?"
// ================================================================
export const PATTERN_RELATIONSHIP = Object.freeze({
  REPEATS:       'REPEATS',        // this pattern occurs again
  ESCALATES:     'ESCALATES',      // this pattern is getting worse
  DECLINES:      'DECLINES',       // this pattern is getting better
  STABILIZES:    'STABILIZES',     // this pattern has reached equilibrium
  PRECEDES:      'PRECEDES',       // this pattern tends to appear before another
  FOLLOWS:       'FOLLOWS',        // this pattern tends to appear after another
  COEXISTS_WITH: 'COEXISTS_WITH',  // both patterns appear together
  AMPLIFIES:     'AMPLIFIES',      // this pattern makes another worse
  SUPPRESSES:    'SUPPRESSES',     // this pattern reduces another
});

// ================================================================
// PATTERN WINDOW TYPES
// ================================================================
export const PATTERN_WINDOW = Object.freeze({
  DAILY:     'Daily',
  WEEKLY:    'Weekly',
  MONTHLY:   'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY:    'Yearly',
  ROLLING_7:  'Rolling7Days',
  ROLLING_30: 'Rolling30Days',
  ROLLING_90: 'Rolling90Days',
  CUSTOM:    'Custom',
});

// ================================================================
// CONFIDENCE (re-used from context layer for consistency)
// ================================================================
export const CONFIDENCE = Object.freeze({
  HIGH:   'HIGH',
  MEDIUM: 'MEDIUM',
  LOW:    'LOW',
});

// ================================================================
// FRAMEWORK METADATA
// ================================================================
export const PATTERN_VERSION   = '1.0';
export const FRAMEWORK_VERSION = '1.0.0';
