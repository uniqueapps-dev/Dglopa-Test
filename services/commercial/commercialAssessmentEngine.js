/**
 * DGLOPA PLATFORM — COMMERCIAL INTELLIGENCE CORE (CIA Core)
 * commercialAssessmentEngine.js — EPIC-001A
 *
 * Builds Commercial Assessments from Commercial Drivers.
 * PIPELINE POSITION: Stage 2 of 4.
 * Input:  CommercialDriver[]
 * Output: CommercialAssessment[]
 *
 * DESIGN PRINCIPLE: Registry-driven, no switch statements.
 * Each Assessment type has a detect() function that receives the full
 * driver array and returns an assessment or null.
 *
 * The pipeline order (ADR-064) is enforced structurally:
 *   Assessments consume Drivers — no circular reference is possible
 *   because Drivers have already been frozen before this engine runs.
 *
 * ADR-062: No recommendations. Assessments describe situations.
 *   "The pharmacy has a Revenue Gap of Significant severity caused by
 *    Demand Pressure and Stockout Frequency drivers."
 *   — not —
 *   "Order more Amoxicillin from Quicksave."
 */

import { createAssessment }  from './commercialFactory.js';
import {
  ASSESSMENT_TYPE, ASSESSMENT_SEVERITY, EVIDENCE_QUALITY,
  DRIVER_TYPE, DRIVER_DIRECTION, DRIVER_MAGNITUDE,
} from './commercialConstants.js';

// ================================================================
// SEVERITY MAPPING (from driver magnitude combinations)
// ================================================================

function _toSeverity(dominantMagnitude) {
  const map = {
    [DRIVER_MAGNITUDE.DOMINANT]:   ASSESSMENT_SEVERITY.CRITICAL,
    [DRIVER_MAGNITUDE.HIGH]:       ASSESSMENT_SEVERITY.SIGNIFICANT,
    [DRIVER_MAGNITUDE.MODERATE]:   ASSESSMENT_SEVERITY.MODERATE,
    [DRIVER_MAGNITUDE.LOW]:        ASSESSMENT_SEVERITY.NEGLIGIBLE,
    [DRIVER_MAGNITUDE.NEGLIGIBLE]: ASSESSMENT_SEVERITY.NEGLIGIBLE,
  };
  return map[dominantMagnitude] ?? ASSESSMENT_SEVERITY.NEGLIGIBLE;
}

function _byType(drivers, ...types) {
  return drivers.filter((d) => types.includes(d.driverType));
}

function _negative(drivers) {
  return drivers.filter((d) => d.direction === DRIVER_DIRECTION.NEGATIVE);
}

function _positive(drivers) {
  return drivers.filter((d) => d.direction === DRIVER_DIRECTION.POSITIVE);
}

function _dominantMagnitude(drivers) {
  const magnitudeOrder = {
    [DRIVER_MAGNITUDE.DOMINANT]:  0,
    [DRIVER_MAGNITUDE.HIGH]:      1,
    [DRIVER_MAGNITUDE.MODERATE]:  2,
    [DRIVER_MAGNITUDE.LOW]:       3,
    [DRIVER_MAGNITUDE.NEGLIGIBLE]:4,
  };
  return drivers.reduce((best, d) =>
    (magnitudeOrder[d.magnitude] ?? 9) < (magnitudeOrder[best] ?? 9) ? d.magnitude : best,
    DRIVER_MAGNITUDE.NEGLIGIBLE
  );
}

function _bestEvidenceQuality(drivers) {
  if (drivers.some((d) => d.evidenceQuality === EVIDENCE_QUALITY.HIGH))   return EVIDENCE_QUALITY.HIGH;
  if (drivers.some((d) => d.evidenceQuality === EVIDENCE_QUALITY.MEDIUM)) return EVIDENCE_QUALITY.MEDIUM;
  return EVIDENCE_QUALITY.LOW;
}

function _allPatternIds(drivers) {
  return [...new Set(drivers.flatMap((d) => d.patternIds || []))];
}

function _allContextIds(drivers) {
  return [...new Set(drivers.flatMap((d) => d.contextIds || []))];
}

function _allEvidence(drivers) {
  return [...new Set(drivers.flatMap((d) => d.supportingEvidence || []))].slice(0, 6);
}

// ================================================================
// ASSESSMENT REGISTRY
// ================================================================

const ASSESSMENT_REGISTRY = [

  // ---- Revenue Gap ----
  {
    assessmentType: ASSESSMENT_TYPE.REVENUE_GAP,
    detect(drivers) {
      const relevant = _negative(_byType(drivers,
        DRIVER_TYPE.DEMAND_PRESSURE, DRIVER_TYPE.STOCKOUT_FREQUENCY
      ));
      if (relevant.length === 0) return null;

      const severity  = _toSeverity(_dominantMagnitude(relevant));
      const hasBoth   = relevant.some((d) => d.driverType === DRIVER_TYPE.DEMAND_PRESSURE) &&
                        relevant.some((d) => d.driverType === DRIVER_TYPE.STOCKOUT_FREQUENCY);

      return createAssessment({
        assessmentType:  ASSESSMENT_TYPE.REVENUE_GAP,
        severity,
        headline:        `Revenue Gap — ${severity}`,
        detail:          hasBoth
          ? 'Repeated unmet customer demand combined with frequent stock-outs is creating a material and ongoing revenue gap. Customers are arriving and leaving without completing purchases.'
          : relevant[0]?.driverType === DRIVER_TYPE.DEMAND_PRESSURE
            ? 'Repeated unmet customer demand is creating a revenue gap. Products customers request are not available for purchase.'
            : 'Frequent stock-outs are interrupting sales, creating a revenue gap even when demand is present.',
        commercialImpact:'Revenue is being lost on each unserved customer interaction. The gap widens proportionally with demand frequency and stock-out duration.',
        drivers:          relevant,
        patternIds:       _allPatternIds(relevant),
        contextIds:       _allContextIds(relevant),
        evidenceQuality:  _bestEvidenceQuality(relevant),
        supportingEvidence: _allEvidence(relevant),
      });
    },
  },

  // ---- Capital At Risk ----
  {
    assessmentType: ASSESSMENT_TYPE.CAPITAL_AT_RISK,
    detect(drivers) {
      const relevant = _negative(_byType(drivers,
        DRIVER_TYPE.EXPIRY_WASTE, DRIVER_TYPE.DEAD_STOCK_ACCUMULATION
      ));
      if (relevant.length === 0) return null;

      const severity = _toSeverity(_dominantMagnitude(relevant));

      return createAssessment({
        assessmentType:  ASSESSMENT_TYPE.CAPITAL_AT_RISK,
        severity,
        headline:        `Capital At Risk — ${severity}`,
        detail:          'Pharmacy capital is exposed to direct loss via inventory expiry and dead stock accumulation. Money paid for inventory is not being converted to revenue before it loses value.',
        commercialImpact:'Every expired unit and every day of dead stock is capital that cannot be reinvested in productive inventory. This directly reduces the working capital available for purchasing.',
        drivers:          relevant,
        patternIds:       _allPatternIds(relevant),
        contextIds:       _allContextIds(relevant),
        evidenceQuality:  _bestEvidenceQuality(relevant),
        supportingEvidence: _allEvidence(relevant),
      });
    },
  },

  // ---- Supply Vulnerability ----
  {
    assessmentType: ASSESSMENT_TYPE.SUPPLY_VULNERABILITY,
    detect(drivers) {
      const relevant = _negative(_byType(drivers,
        DRIVER_TYPE.SUPPLY_CHAIN_RISK, DRIVER_TYPE.SUPPLIER_RELIABILITY
      ));
      if (relevant.length === 0) return null;

      const severity = _toSeverity(_dominantMagnitude(relevant));

      return createAssessment({
        assessmentType:  ASSESSMENT_TYPE.SUPPLY_VULNERABILITY,
        severity,
        headline:        `Supply Vulnerability — ${severity}`,
        detail:          'The pharmacy has commercial exposure from supply chain instability. Unreliable supplier performance or recurring disruptions are creating gaps between what is ordered and what arrives on time.',
        commercialImpact:'Supply vulnerability translates to stockout risk, which translates to revenue loss. Each disrupted delivery creates a downstream commercial cost in lost sales and customer dissatisfaction.',
        drivers:          relevant,
        patternIds:       _allPatternIds(relevant),
        contextIds:       _allContextIds(relevant),
        evidenceQuality:  _bestEvidenceQuality(relevant),
        supportingEvidence: _allEvidence(relevant),
      });
    },
  },

  // ---- Growth Opportunity ----
  {
    assessmentType: ASSESSMENT_TYPE.GROWTH_OPPORTUNITY,
    detect(drivers) {
      const relevant = _positive(_byType(drivers,
        DRIVER_TYPE.PURCHASE_MOMENTUM, DRIVER_TYPE.SUPPLIER_RELIABILITY
      ));
      // Also check for demand pressure as opportunity signal
      const demandDriver = _byType(drivers, DRIVER_TYPE.DEMAND_PRESSURE)
        .filter((d) => d.magnitude !== DRIVER_MAGNITUDE.NEGLIGIBLE);

      const combined = [...relevant, ...demandDriver];
      if (combined.length === 0) return null;

      const severity = demandDriver.length > 0
        ? _toSeverity(_dominantMagnitude(demandDriver))  // demand gap = opportunity scale
        : ASSESSMENT_SEVERITY.MODERATE;

      return createAssessment({
        assessmentType:  ASSESSMENT_TYPE.GROWTH_OPPORTUNITY,
        severity,
        headline:        `Growth Opportunity — ${severity}`,
        detail:          demandDriver.length > 0
          ? 'Customer demand for products the pharmacy currently cannot supply represents an identifiable and actionable commercial opportunity. The demand signal exists; the supply response is the gap.'
          : 'Growing purchase momentum and reliable supplier relationships provide a foundation for expanding commercial operations.',
        commercialImpact:'Each served customer demand represents revenue currently being lost to unmet supply. Addressing identified demand gaps converts existing customer intent into revenue.',
        drivers:          combined,
        patternIds:       _allPatternIds(combined),
        contextIds:       _allContextIds(combined),
        evidenceQuality:  _bestEvidenceQuality(combined),
        supportingEvidence: _allEvidence(combined),
      });
    },
  },

  // ---- Operational Drag ----
  {
    assessmentType: ASSESSMENT_TYPE.OPERATIONAL_DRAG,
    detect(drivers) {
      const relevant = _negative(_byType(drivers, DRIVER_TYPE.DATA_QUALITY));
      if (relevant.length === 0) return null;

      const severity = _toSeverity(_dominantMagnitude(relevant));

      return createAssessment({
        assessmentType:  ASSESSMENT_TYPE.OPERATIONAL_DRAG,
        severity,
        headline:        `Operational Drag — ${severity}`,
        detail:          'Accumulating operational data quality issues are creating a commercial drag. Management time spent resolving data quality problems is time not spent on revenue-generating activity.',
        commercialImpact:'Operational drag is an indirect commercial cost — it does not appear on a balance sheet but reduces the effective capacity of the pharmacy for commercial decision-making.',
        drivers:          relevant,
        patternIds:       _allPatternIds(relevant),
        contextIds:       _allContextIds(relevant),
        evidenceQuality:  _bestEvidenceQuality(relevant),
        supportingEvidence: _allEvidence(relevant),
      });
    },
  },

  // ---- Margin Exposure ----
  {
    assessmentType: ASSESSMENT_TYPE.MARGIN_EXPOSURE,
    detect(drivers) {
      const costDriver = _byType(drivers, DRIVER_TYPE.PURCHASE_COST_TREND)
        .filter((d) => d.direction === DRIVER_DIRECTION.NEGATIVE);
      const wasteDriver = _negative(_byType(drivers, DRIVER_TYPE.EXPIRY_WASTE));

      const relevant = [...costDriver, ...wasteDriver];
      if (relevant.length === 0) return null;

      const severity = _toSeverity(_dominantMagnitude(relevant));

      return createAssessment({
        assessmentType:  ASSESSMENT_TYPE.MARGIN_EXPOSURE,
        severity,
        headline:        `Margin Exposure — ${severity}`,
        detail:          'The pharmacy\'s commercial margin is under pressure from rising purchase costs and inventory losses. The gap between what is paid for inventory and what is recovered through sales is narrowing.',
        commercialImpact:'Margin compression reduces the financial return on each unit sold. Compounded with expiry losses, this creates a double commercial impact: less recovered per unit sold and some units never recovered at all.',
        drivers:          relevant,
        patternIds:       _allPatternIds(relevant),
        contextIds:       _allContextIds(relevant),
        evidenceQuality:  _bestEvidenceQuality(relevant),
        supportingEvidence: _allEvidence(relevant),
      });
    },
  },

];

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Build all active Commercial Assessments from drivers.
 *
 * @param {CommercialDriver[]} drivers
 * @returns {CommercialAssessment[]} — sorted by severity (Critical first)
 */
export function buildAssessments(drivers) {
  const severityOrder = {
    [ASSESSMENT_SEVERITY.CRITICAL]:   0,
    [ASSESSMENT_SEVERITY.SIGNIFICANT]:1,
    [ASSESSMENT_SEVERITY.MODERATE]:   2,
    [ASSESSMENT_SEVERITY.NEGLIGIBLE]: 3,
  };

  const assessments = [];
  for (const def of ASSESSMENT_REGISTRY) {
    try {
      const a = def.detect(drivers);
      if (a) assessments.push(a);
    } catch (err) {
      console.warn(`[AssessmentEngine] Assessment failed for "${def.assessmentType}": ${err.message}`);
    }
  }

  return assessments.sort((a, b) =>
    (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
  );
}
