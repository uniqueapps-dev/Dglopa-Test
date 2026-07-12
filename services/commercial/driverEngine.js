/**
 * DGLOPA PLATFORM — COMMERCIAL INTELLIGENCE CORE (CIA Core)
 * driverEngine.js — EPIC-001A
 *
 * Computes Commercial Drivers from Pattern and Context inputs.
 * ADR-064: Drivers are computed independently from Assessments.
 *
 * PIPELINE POSITION: Stage 1 of 4.
 * Input:  PatternGraph[], ContextGraph[], PlatformEvent[]
 * Output: CommercialDriver[]
 *
 * DRIVER COMPUTATION RULES:
 *   Each driver type has a compute() function that reads relevant
 *   patterns and contexts, calculates a rawScore (0..1), classifies
 *   direction and magnitude, and returns a CommercialDriver or null.
 *
 *   compute(patterns, contexts, events) => CommercialDriver | null
 *
 *   Returning null means this driver is not currently active.
 *   The driver engine collects all non-null results.
 *
 * ADR-062: No DB reads. No pattern reimplementation. No recommendations.
 * The engine reads patterns already detected by DT-008C and interprets
 * their commercial meaning — nothing more.
 */

import { createDriver }  from './commercialFactory.js';
import {
  DRIVER_TYPE, DRIVER_DIRECTION, DRIVER_MAGNITUDE, EVIDENCE_QUALITY,
} from './commercialConstants.js';
import { PATTERN_TYPE, PATTERN_STRENGTH, PATTERN_EVOLUTION } from '../pattern/patternConstants.js';
import { CONTEXT_TYPE } from '../context/contextConstants.js';

// ================================================================
// MAGNITUDE MAPPING
// rawScore 0..1 → DRIVER_MAGNITUDE
// ================================================================

const MAGNITUDE_THRESHOLDS = [
  { min: 0.80, magnitude: DRIVER_MAGNITUDE.DOMINANT    },
  { min: 0.60, magnitude: DRIVER_MAGNITUDE.HIGH        },
  { min: 0.35, magnitude: DRIVER_MAGNITUDE.MODERATE    },
  { min: 0.10, magnitude: DRIVER_MAGNITUDE.LOW         },
  { min: 0.00, magnitude: DRIVER_MAGNITUDE.NEGLIGIBLE  },
];

function _toMagnitude(rawScore) {
  const s = Math.max(0, Math.min(1, rawScore ?? 0));
  for (const t of MAGNITUDE_THRESHOLDS) {
    if (s >= t.min) return t.magnitude;
  }
  return DRIVER_MAGNITUDE.NEGLIGIBLE;
}

function _strengthToScore(strength) {
  const map = { VERY_HIGH: 0.9, HIGH: 0.7, MEDIUM: 0.45, LOW: 0.2, VERY_LOW: 0.05 };
  return map[strength] ?? 0;
}

function _toEvidenceQuality(confidence) {
  const map = { HIGH: EVIDENCE_QUALITY.HIGH, MEDIUM: EVIDENCE_QUALITY.MEDIUM, LOW: EVIDENCE_QUALITY.LOW };
  return map[confidence] ?? EVIDENCE_QUALITY.LOW;
}

function _patternsOf(patterns, ...types) {
  return patterns.filter((p) => types.includes(p.patternType));
}

function _contextsOf(contexts, ...types) {
  return contexts.filter((c) => types.includes(c.contextType));
}

function _collectIds(items, field) {
  return [...new Set(items.flatMap((i) => i[field] || []).filter(Boolean))];
}

function _collectEvidence(items) {
  return [...new Set(items.flatMap((i) => i.supportingEvidence || []).filter(Boolean))].slice(0, 5);
}

// ================================================================
// DRIVER COMPUTE FUNCTIONS
// ================================================================

const DRIVER_COMPUTERS = {

  // ---- Demand Pressure ----
  [DRIVER_TYPE.DEMAND_PRESSURE]: (patterns, contexts, events) => {
    const relevant = _patternsOf(patterns, PATTERN_TYPE.REPEATED_DEMAND);
    if (relevant.length === 0) return null;

    const strongest = relevant.reduce((a, b) =>
      _strengthToScore(a.patternStrength) > _strengthToScore(b.patternStrength) ? a : b
    );
    const rawScore = _strengthToScore(strongest.patternStrength);

    // Amplify if strengthening
    const amplified = relevant.some((p) => p.evolution === PATTERN_EVOLUTION.STRENGTHENING)
      ? Math.min(1, rawScore * 1.2) : rawScore;

    return createDriver({
      driverType:         DRIVER_TYPE.DEMAND_PRESSURE,
      direction:          DRIVER_DIRECTION.NEGATIVE,  // unmet demand = negative
      magnitude:          _toMagnitude(amplified),
      rawScore:           amplified,
      label:              'Demand Pressure',
      narrative:          `Repeated unmet customer demand is creating a revenue gap. ${relevant.length} demand pattern${relevant.length !== 1 ? 's' : ''} detected.`,
      patternIds:         relevant.map((p) => p.patternId),
      contextIds:         _collectIds(relevant, 'metadata.detectedContextIds'),
      evidenceQuality:    _toEvidenceQuality(strongest.confidence),
      supportingEvidence: _collectEvidence(relevant),
    });
  },

  // ---- Stockout Frequency ----
  [DRIVER_TYPE.STOCKOUT_FREQUENCY]: (patterns, contexts) => {
    const relevant = _patternsOf(patterns, PATTERN_TYPE.REPEATED_STOCKOUT);
    const supplyCtx = _contextsOf(contexts, CONTEXT_TYPE.REVENUE_IMPACT, CONTEXT_TYPE.SUPPLY_CHAIN);
    if (relevant.length === 0 && supplyCtx.length === 0) return null;

    const patternScore  = relevant.length > 0 ? _strengthToScore(relevant[0]?.patternStrength) : 0;
    const contextScore  = Math.min(0.4, supplyCtx.length * 0.1);
    const rawScore      = Math.min(1, patternScore + contextScore);

    return createDriver({
      driverType:         DRIVER_TYPE.STOCKOUT_FREQUENCY,
      direction:          DRIVER_DIRECTION.NEGATIVE,
      magnitude:          _toMagnitude(rawScore),
      rawScore,
      label:              'Stockout Frequency',
      narrative:          `Products are running out of stock repeatedly, interrupting sales and damaging customer satisfaction.`,
      patternIds:         relevant.map((p) => p.patternId),
      contextIds:         supplyCtx.map((c) => c.contextId),
      evidenceQuality:    relevant.length > 0 ? _toEvidenceQuality(relevant[0]?.confidence) : EVIDENCE_QUALITY.LOW,
      supportingEvidence: _collectEvidence([...relevant, ...supplyCtx.map((c) => ({ supportingEvidence: [c.contextSummary] }))]),
    });
  },

  // ---- Dead Stock Accumulation ----
  [DRIVER_TYPE.DEAD_STOCK_ACCUMULATION]: (patterns) => {
    const relevant = _patternsOf(patterns, PATTERN_TYPE.DEAD_STOCK);
    if (relevant.length === 0) return null;

    const rawScore = _strengthToScore(relevant[0]?.patternStrength);

    return createDriver({
      driverType:         DRIVER_TYPE.DEAD_STOCK_ACCUMULATION,
      direction:          DRIVER_DIRECTION.NEGATIVE,
      magnitude:          _toMagnitude(rawScore),
      rawScore,
      label:              'Dead Stock Accumulation',
      narrative:          `Inventory older than 90 days with remaining stock is tying up capital that is not generating revenue.`,
      patternIds:         relevant.map((p) => p.patternId),
      contextIds:         [],
      evidenceQuality:    _toEvidenceQuality(relevant[0]?.confidence),
      supportingEvidence: _collectEvidence(relevant),
    });
  },

  // ---- Expiry Waste ----
  [DRIVER_TYPE.EXPIRY_WASTE]: (patterns, contexts) => {
    const relevant  = _patternsOf(patterns, PATTERN_TYPE.EXPIRY_LOSS);
    const stockCtx  = _contextsOf(contexts, CONTEXT_TYPE.STOCK_HEALTH);
    if (relevant.length === 0 && stockCtx.length === 0) return null;

    const patternScore = relevant.length > 0 ? _strengthToScore(relevant[0]?.patternStrength) : 0;
    const contextScore = Math.min(0.3, stockCtx.length * 0.1);
    const rawScore     = Math.min(1, patternScore + contextScore);

    return createDriver({
      driverType:         DRIVER_TYPE.EXPIRY_WASTE,
      direction:          DRIVER_DIRECTION.NEGATIVE,
      magnitude:          _toMagnitude(rawScore),
      rawScore,
      label:              'Expiry Waste',
      narrative:          `Inventory is expiring before it can be sold. Each expired lot represents direct capital loss.`,
      patternIds:         relevant.map((p) => p.patternId),
      contextIds:         stockCtx.map((c) => c.contextId),
      evidenceQuality:    relevant.length > 0 ? _toEvidenceQuality(relevant[0]?.confidence) : EVIDENCE_QUALITY.LOW,
      supportingEvidence: _collectEvidence([...relevant, ...stockCtx.map((c) => ({ supportingEvidence: [c.contextSummary] }))]),
    });
  },

  // ---- Purchase Cost Trend ----
  [DRIVER_TYPE.PURCHASE_COST_TREND]: (patterns, contexts) => {
    const relevant = _patternsOf(patterns, PATTERN_TYPE.PURCHASE_GROWTH);
    if (relevant.length === 0) return null;

    const rawScore  = _strengthToScore(relevant[0]?.patternStrength);
    const direction = relevant.some((p) => p.evolution === PATTERN_EVOLUTION.STRENGTHENING)
      ? DRIVER_DIRECTION.NEGATIVE   // growing costs = negative pressure
      : relevant.some((p) => p.evolution === PATTERN_EVOLUTION.WEAKENING)
        ? DRIVER_DIRECTION.POSITIVE // declining costs = positive
        : DRIVER_DIRECTION.NEUTRAL;

    return createDriver({
      driverType:         DRIVER_TYPE.PURCHASE_COST_TREND,
      direction,
      magnitude:          _toMagnitude(rawScore),
      rawScore,
      label:              'Purchase Cost Trend',
      narrative:          `Purchase cost volume is ${direction === DRIVER_DIRECTION.NEGATIVE ? 'increasing' : direction === DRIVER_DIRECTION.POSITIVE ? 'decreasing' : 'stable'}, ${direction === DRIVER_DIRECTION.NEGATIVE ? 'putting pressure on margins' : direction === DRIVER_DIRECTION.POSITIVE ? 'improving margin opportunity' : 'with no clear directional impact'}.`,
      patternIds:         relevant.map((p) => p.patternId),
      contextIds:         [],
      evidenceQuality:    _toEvidenceQuality(relevant[0]?.confidence),
      supportingEvidence: _collectEvidence(relevant),
    });
  },

  // ---- Supplier Reliability ----
  [DRIVER_TYPE.SUPPLIER_RELIABILITY]: (patterns, contexts) => {
    const reliable  = _patternsOf(patterns, PATTERN_TYPE.SUPPLIER_RELIABILITY);
    const delayPat  = _patternsOf(patterns, PATTERN_TYPE.SUPPLIER_DELAY);
    const supplyCtx = _contextsOf(contexts, CONTEXT_TYPE.SUPPLIER_BEHAVIOUR);
    if (reliable.length === 0 && delayPat.length === 0) return null;

    const reliableScore = reliable.length > 0 ? _strengthToScore(reliable[0]?.patternStrength) : 0;
    const delayScore    = delayPat.length  > 0 ? _strengthToScore(delayPat[0]?.patternStrength)  : 0;

    // Net reliability: reliable presence lifts, delay presence drags
    const rawScore  = Math.min(1, Math.max(0, reliableScore - delayScore * 0.5));
    const direction = delayScore > reliableScore
      ? DRIVER_DIRECTION.NEGATIVE
      : reliableScore > 0 ? DRIVER_DIRECTION.POSITIVE : DRIVER_DIRECTION.NEUTRAL;

    return createDriver({
      driverType:         DRIVER_TYPE.SUPPLIER_RELIABILITY,
      direction,
      magnitude:          _toMagnitude(Math.max(reliableScore, delayScore)),
      rawScore,
      label:              'Supplier Reliability',
      narrative:          direction === DRIVER_DIRECTION.POSITIVE
        ? 'Supplier delivery performance is consistent, providing a stable supply base.'
        : direction === DRIVER_DIRECTION.NEGATIVE
          ? 'Supplier delivery is unreliable, creating supply chain risk and potential stockouts.'
          : 'Mixed supplier reliability signals — some consistent, some problematic.',
      patternIds:         [...reliable, ...delayPat].map((p) => p.patternId),
      contextIds:         supplyCtx.map((c) => c.contextId),
      evidenceQuality:    EVIDENCE_QUALITY.MEDIUM,
      supportingEvidence: _collectEvidence([...reliable, ...delayPat]),
    });
  },

  // ---- Supply Chain Risk ----
  [DRIVER_TYPE.SUPPLY_CHAIN_RISK]: (patterns, contexts) => {
    const delayPat  = _patternsOf(patterns, PATTERN_TYPE.SUPPLIER_DELAY);
    const chainCtx  = _contextsOf(contexts, CONTEXT_TYPE.SUPPLY_CHAIN);
    if (delayPat.length === 0 && chainCtx.length === 0) return null;

    const patternScore = delayPat.length > 0 ? _strengthToScore(delayPat[0]?.patternStrength) : 0;
    const contextScore = Math.min(0.4, chainCtx.length * 0.15);
    const rawScore     = Math.min(1, patternScore + contextScore);

    return createDriver({
      driverType:         DRIVER_TYPE.SUPPLY_CHAIN_RISK,
      direction:          DRIVER_DIRECTION.NEGATIVE,
      magnitude:          _toMagnitude(rawScore),
      rawScore,
      label:              'Supply Chain Risk',
      narrative:          `Supply chain disruptions are recurring. ${chainCtx.length} supply chain context${chainCtx.length !== 1 ? 's' : ''} with ${delayPat.length} delay pattern${delayPat.length !== 1 ? 's' : ''} detected.`,
      patternIds:         delayPat.map((p) => p.patternId),
      contextIds:         chainCtx.map((c) => c.contextId),
      evidenceQuality:    chainCtx.length >= 2 ? EVIDENCE_QUALITY.HIGH : chainCtx.length === 1 ? EVIDENCE_QUALITY.MEDIUM : EVIDENCE_QUALITY.LOW,
      supportingEvidence: _collectEvidence([...delayPat, ...chainCtx.map((c) => ({ supportingEvidence: [c.contextSummary] }))]),
    });
  },

  // ---- Data Quality ----
  [DRIVER_TYPE.DATA_QUALITY]: (patterns) => {
    const relevant = _patternsOf(patterns, PATTERN_TYPE.REVIEW_QUEUE_CONGESTION);
    if (relevant.length === 0) return null;

    const rawScore = _strengthToScore(relevant[0]?.patternStrength);

    return createDriver({
      driverType:         DRIVER_TYPE.DATA_QUALITY,
      direction:          DRIVER_DIRECTION.NEGATIVE,
      magnitude:          _toMagnitude(rawScore),
      rawScore,
      label:              'Data Quality Drag',
      narrative:          `Accumulating review items indicate operational data quality issues that are absorbing management time and potentially masking commercial risks.`,
      patternIds:         relevant.map((p) => p.patternId),
      contextIds:         [],
      evidenceQuality:    _toEvidenceQuality(relevant[0]?.confidence),
      supportingEvidence: _collectEvidence(relevant),
    });
  },

  // ---- Purchase Momentum ----
  [DRIVER_TYPE.PURCHASE_MOMENTUM]: (patterns, contexts) => {
    const relevant  = _patternsOf(patterns, PATTERN_TYPE.PURCHASE_GROWTH);
    const supplyCtx = _contextsOf(contexts, CONTEXT_TYPE.SUPPLIER_BEHAVIOUR);
    if (relevant.length === 0) return null;

    const rawScore  = _strengthToScore(relevant[0]?.patternStrength);
    const isGrowing = relevant.some((p) =>
      p.evolution === PATTERN_EVOLUTION.EMERGING || p.evolution === PATTERN_EVOLUTION.STRENGTHENING
    );

    return createDriver({
      driverType:         DRIVER_TYPE.PURCHASE_MOMENTUM,
      direction:          isGrowing ? DRIVER_DIRECTION.POSITIVE : DRIVER_DIRECTION.NEUTRAL,
      magnitude:          _toMagnitude(rawScore),
      rawScore,
      label:              'Purchase Momentum',
      narrative:          isGrowing
        ? 'Purchasing activity is growing — indicating expanding operations or responding to demand signals.'
        : 'Purchasing activity is stable — consistent with ongoing operational needs.',
      patternIds:         relevant.map((p) => p.patternId),
      contextIds:         supplyCtx.map((c) => c.contextId),
      evidenceQuality:    _toEvidenceQuality(relevant[0]?.confidence),
      supportingEvidence: _collectEvidence(relevant),
    });
  },
};

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Compute all active Commercial Drivers from Pattern and Context inputs.
 * ADR-064: Drivers are computed independently — no cross-driver reference.
 *
 * @param {Pattern[]}      patterns  — from PatternGraph[].patterns
 * @param {Context[]}      contexts  — from ContextGraph[].contexts
 * @param {PlatformEvent[]} events   — from assembleSemanticEvents()
 * @returns {CommercialDriver[]}     — only active (non-null) drivers, sorted by rawScore desc
 */
export function computeDrivers(patterns, contexts, events) {
  const drivers = [];

  for (const [driverType, compute] of Object.entries(DRIVER_COMPUTERS)) {
    try {
      const driver = compute(patterns, contexts, events);
      if (driver) drivers.push(driver);
    } catch (err) {
      console.warn(`[DriverEngine] Driver computation failed for "${driverType}": ${err.message}`);
    }
  }

  // Sort by rawScore descending — strongest drivers first
  return drivers.sort((a, b) => b.rawScore - a.rawScore);
}
