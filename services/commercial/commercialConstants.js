/**
 * DGLOPA PLATFORM — COMMERCIAL INTELLIGENCE CORE (CIA Core)
 * commercialConstants.js — EPIC-001A
 *
 * All controlled vocabularies for the Commercial Intelligence Core.
 *
 * DESIGN PRINCIPLES:
 *   ADR-062: CIA Core consumes understanding, never recreates it.
 *     The CIA Core reads Pattern/Context/Event objects assembled by
 *     the cognitive architecture. It never queries operational tables,
 *     never reimplements pattern detection, never reimplements semantic
 *     classification. It interprets what the architecture has already
 *     produced.
 *
 *   ADR-063: Commercial outputs are typed value objects, not raw primitives.
 *     A CommercialDriver is never a string. A CommercialSignal is never
 *     a boolean. Every output carries identity, evidence, and provenance.
 *
 *   ADR-064: Drivers are computed independently from Assessments.
 *     The pipeline order is: Drivers → Assessments → Signals → Position.
 *     Assessments consume Drivers but Drivers are computed without
 *     knowledge of Assessments. No circular dependency.
 *
 *   ADR-065: Commercial Position is a point-in-time snapshot.
 *     Stateless, reproducible, never persisted. Given the same inputs,
 *     the same Position is always produced. Commercial Position is not
 *     a ledger — it is a reading.
 */

// ================================================================
// COMMERCIAL DRIVER TYPES
// "What force is shaping the commercial situation?"
// ================================================================
export const DRIVER_TYPE = Object.freeze({
  // Revenue drivers — forces affecting income
  DEMAND_PRESSURE:          'DemandPressure',         // repeated unmet demand creating revenue gap
  STOCKOUT_FREQUENCY:       'StockoutFrequency',       // how often products run out of stock
  DEAD_STOCK_ACCUMULATION:  'DeadStockAccumulation',   // capital tied up in non-moving inventory

  // Cost drivers — forces affecting expenditure
  EXPIRY_WASTE:             'ExpiryWaste',             // inventory lost to expiry — direct capital loss
  PURCHASE_COST_TREND:      'PurchaseCostTrend',       // direction and magnitude of purchase costs

  // Supply drivers — forces affecting reliability of supply
  SUPPLIER_RELIABILITY:     'SupplierReliability',     // consistency of delivery performance
  SUPPLY_CHAIN_RISK:        'SupplyChainRisk',         // probability of supply disruption

  // Operational drivers — forces affecting operational efficiency
  DATA_QUALITY:             'DataQuality',             // review queue congestion, unmatched records
  PURCHASE_MOMENTUM:        'PurchaseMomentum',        // direction and rate of purchasing activity
});

// ================================================================
// DRIVER DIRECTION
// "Which way is this driver pushing the business?"
// ================================================================
export const DRIVER_DIRECTION = Object.freeze({
  POSITIVE:  'Positive',    // driver is creating value or reducing risk
  NEGATIVE:  'Negative',    // driver is destroying value or increasing risk
  NEUTRAL:   'Neutral',     // driver is present but not directionally significant
  MIXED:     'Mixed',       // driver has both positive and negative components
});

// ================================================================
// DRIVER MAGNITUDE
// "How strongly is this driver operating?"
// ================================================================
export const DRIVER_MAGNITUDE = Object.freeze({
  NEGLIGIBLE: 'Negligible',
  LOW:        'Low',
  MODERATE:   'Moderate',
  HIGH:       'High',
  DOMINANT:   'Dominant',
});

// ================================================================
// ASSESSMENT TYPES
// "What commercial situation has been identified?"
// ================================================================
export const ASSESSMENT_TYPE = Object.freeze({
  REVENUE_GAP:            'RevenueGap',           // revenue being lost due to unmet demand
  CAPITAL_AT_RISK:        'CapitalAtRisk',         // capital exposed to loss via expiry or dead stock
  SUPPLY_VULNERABILITY:   'SupplyVulnerability',   // commercial exposure from supply chain risk
  GROWTH_OPPORTUNITY:     'GrowthOpportunity',     // commercial opportunity from demand or relationships
  OPERATIONAL_DRAG:       'OperationalDrag',       // commercial cost of operational inefficiency
  MARGIN_EXPOSURE:        'MarginExposure',        // commercial risk to margin from cost trends
});

// ================================================================
// ASSESSMENT SEVERITY
// "How commercially significant is this situation?"
// ================================================================
export const ASSESSMENT_SEVERITY = Object.freeze({
  NEGLIGIBLE: 'Negligible',   // present but commercially minor
  MODERATE:   'Moderate',     // warrants attention and monitoring
  SIGNIFICANT:'Significant',  // materially affecting commercial outcomes
  CRITICAL:   'Critical',     // immediate commercial impact requiring urgent response
});

// ================================================================
// SIGNAL TYPES
// "What commercial dimension deserves immediate attention?"
// ================================================================
export const SIGNAL_TYPE = Object.freeze({
  // Revenue signals
  REVENUE_LOSS_SIGNAL:      'RevenueLossSignal',      // identifiable lost revenue
  GROWTH_SIGNAL:            'GrowthSignal',            // identifiable revenue opportunity

  // Cost signals
  CAPITAL_LOSS_SIGNAL:      'CapitalLossSignal',       // identifiable capital loss (expiry, dead stock)
  COST_PRESSURE_SIGNAL:     'CostPressureSignal',      // rising costs threatening margin

  // Supply signals
  SUPPLY_RISK_SIGNAL:       'SupplyRiskSignal',         // supply chain vulnerability

  // Operational signals
  EFFICIENCY_SIGNAL:        'EfficiencySignal',         // operational drag with commercial consequence
});

// ================================================================
// SIGNAL URGENCY
// "How quickly does this signal require commercial attention?"
// ================================================================
export const SIGNAL_URGENCY = Object.freeze({
  MONITOR:    'Monitor',     // track but no immediate action required
  ATTENTION:  'Attention',   // requires commercial attention within days
  URGENT:     'Urgent',      // requires commercial attention within hours
  IMMEDIATE:  'Immediate',   // requires commercial response now
});

// ================================================================
// POSITION GRADE
// "What is the overall commercial standing?"
// ================================================================
export const POSITION_GRADE = Object.freeze({
  STRONG:     'Strong',       // commercial position is robust across all dimensions
  HEALTHY:    'Healthy',      // commercial position is sound with minor exposures
  STABLE:     'Stable',       // commercial position is adequate but under pressure
  STRESSED:   'Stressed',     // commercial position is materially strained
  AT_RISK:    'AtRisk',       // commercial position is critically exposed
});

// ================================================================
// EVIDENCE QUALITY (mirrors CONFIDENCE from context layer)
// ================================================================
export const EVIDENCE_QUALITY = Object.freeze({
  HIGH:   'High',
  MEDIUM: 'Medium',
  LOW:    'Low',
});

// ================================================================
// FRAMEWORK METADATA
// ================================================================
export const CIA_VERSION   = '1.0';
export const FRAMEWORK_VERSION = '1.0.0';
