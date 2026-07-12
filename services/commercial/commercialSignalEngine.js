/**
 * DGLOPA PLATFORM — COMMERCIAL INTELLIGENCE CORE (CIA Core)
 * commercialSignalEngine.js — EPIC-001A
 *
 * Derives Commercial Signals from Commercial Assessments.
 * PIPELINE POSITION: Stage 3 of 4.
 * Input:  CommercialAssessment[]
 * Output: CommercialSignal[]
 *
 * SIGNAL LANGUAGE CONTRACT (ADR-062):
 *   Signals identify and describe — they do NOT prescribe action.
 *   Every signal title and description uses the vocabulary of observation:
 *     ✓ "Revenue gap is widening"
 *     ✓ "Capital loss from expiry is significant"
 *     ✗ "Order more stock"
 *     ✗ "Switch suppliers"
 *   Action verbs belong to a future Decision Intelligence layer.
 *
 * URGENCY MAPPING:
 *   CRITICAL severity  → Immediate
 *   SIGNIFICANT severity → Urgent
 *   MODERATE severity  → Attention
 *   NEGLIGIBLE severity → Monitor
 *
 * Every signal carries the assessmentId of its parent — full traceability.
 */

import { createSignal }      from './commercialFactory.js';
import {
  SIGNAL_TYPE, SIGNAL_URGENCY, EVIDENCE_QUALITY,
  ASSESSMENT_TYPE, ASSESSMENT_SEVERITY,
} from './commercialConstants.js';

// ================================================================
// URGENCY MAPPING
// ================================================================

function _toUrgency(severity) {
  const map = {
    [ASSESSMENT_SEVERITY.CRITICAL]:   SIGNAL_URGENCY.IMMEDIATE,
    [ASSESSMENT_SEVERITY.SIGNIFICANT]:SIGNAL_URGENCY.URGENT,
    [ASSESSMENT_SEVERITY.MODERATE]:   SIGNAL_URGENCY.ATTENTION,
    [ASSESSMENT_SEVERITY.NEGLIGIBLE]: SIGNAL_URGENCY.MONITOR,
  };
  return map[severity] ?? SIGNAL_URGENCY.MONITOR;
}

// ================================================================
// SIGNAL TEMPLATES (one per assessment type)
// ================================================================

const SIGNAL_TEMPLATES = {

  [ASSESSMENT_TYPE.REVENUE_GAP]: (assessment) => ({
    signalType:     SIGNAL_TYPE.REVENUE_LOSS_SIGNAL,
    title:          `Revenue Gap Identified — ${assessment.severity}`,
    description:    assessment.detail,
    evidenceSummary:`${assessment.drivers.length} commercial driver${assessment.drivers.length !== 1 ? 's' : ''} are contributing to this revenue gap.`,
  }),

  [ASSESSMENT_TYPE.CAPITAL_AT_RISK]: (assessment) => ({
    signalType:     SIGNAL_TYPE.CAPITAL_LOSS_SIGNAL,
    title:          `Capital At Risk — ${assessment.severity}`,
    description:    assessment.detail,
    evidenceSummary:`Expiry and dead stock drivers indicate capital exposure in the current inventory.`,
  }),

  [ASSESSMENT_TYPE.SUPPLY_VULNERABILITY]: (assessment) => ({
    signalType:     SIGNAL_TYPE.SUPPLY_RISK_SIGNAL,
    title:          `Supply Vulnerability — ${assessment.severity}`,
    description:    assessment.detail,
    evidenceSummary:`Supply chain disruption patterns and reliability signals indicate commercial exposure.`,
  }),

  [ASSESSMENT_TYPE.GROWTH_OPPORTUNITY]: (assessment) => ({
    signalType:     SIGNAL_TYPE.GROWTH_SIGNAL,
    title:          `Commercial Growth Signal — ${assessment.severity}`,
    description:    assessment.detail,
    evidenceSummary:`Demand pressure and supplier relationship signals indicate an identifiable commercial opportunity.`,
  }),

  [ASSESSMENT_TYPE.OPERATIONAL_DRAG]: (assessment) => ({
    signalType:     SIGNAL_TYPE.EFFICIENCY_SIGNAL,
    title:          `Operational Drag — ${assessment.severity}`,
    description:    assessment.detail,
    evidenceSummary:`Data quality and operational efficiency drivers are creating an indirect commercial cost.`,
  }),

  [ASSESSMENT_TYPE.MARGIN_EXPOSURE]: (assessment) => ({
    signalType:     SIGNAL_TYPE.COST_PRESSURE_SIGNAL,
    title:          `Margin Exposure — ${assessment.severity}`,
    description:    assessment.detail,
    evidenceSummary:`Cost trend and inventory loss drivers indicate margin compression risk.`,
  }),
};

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Derive Commercial Signals from assessments.
 *
 * @param {CommercialAssessment[]} assessments
 * @returns {CommercialSignal[]} — sorted by urgency (Immediate first)
 */
export function deriveSignals(assessments) {
  const urgencyOrder = {
    [SIGNAL_URGENCY.IMMEDIATE]: 0,
    [SIGNAL_URGENCY.URGENT]:    1,
    [SIGNAL_URGENCY.ATTENTION]: 2,
    [SIGNAL_URGENCY.MONITOR]:   3,
  };

  const signals = [];

  for (const assessment of assessments) {
    const template = SIGNAL_TEMPLATES[assessment.assessmentType];
    if (!template) continue;

    try {
      const parts = template(assessment);

      signals.push(createSignal({
        ...parts,
        urgency:         _toUrgency(assessment.severity),
        assessmentId:    assessment.assessmentId,
        driverIds:       assessment.driverIds || [],
        patternIds:      assessment.patternIds,
        evidenceQuality: assessment.evidenceQuality,
      }));
    } catch (err) {
      console.warn(`[SignalEngine] Signal generation failed for "${assessment.assessmentType}": ${err.message}`);
    }
  }

  return signals.sort((a, b) =>
    (urgencyOrder[a.urgency] ?? 9) - (urgencyOrder[b.urgency] ?? 9)
  );
}
