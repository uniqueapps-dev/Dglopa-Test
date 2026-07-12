/**
 * DGLOPA PLATFORM — COMMERCIAL INTELLIGENCE CORE (CIA Core)
 * commercialScoringEngine.js — EPIC-001A
 *
 * Aggregates Drivers, Assessments, and Signals into a Commercial Position.
 * PIPELINE POSITION: Stage 4 of 4.
 * Input:  CommercialDriver[], CommercialAssessment[], CommercialSignal[]
 * Output: CommercialPosition
 *
 * ADR-065: Commercial Position is a point-in-time snapshot.
 *   Stateless, reproducible, never persisted. Given the same inputs,
 *   the same Position is always produced.
 *
 * SCORING ALGORITHM:
 *   1. Compute a composite score from driver rawScores, weighted by direction:
 *      - NEGATIVE drivers subtract from score
 *      - POSITIVE drivers add to score
 *      - Score is clamped 0..1 (0 = worst, 1 = best)
 *   2. Apply signal urgency penalty:
 *      - Each IMMEDIATE signal applies a penalty
 *      - Each URGENT signal applies a smaller penalty
 *   3. Map composite score to POSITION_GRADE
 *   4. Build position summary narrative from assessments
 */

import { createPosition }    from './commercialFactory.js';
import {
  POSITION_GRADE, SIGNAL_URGENCY,
  DRIVER_DIRECTION, ASSESSMENT_SEVERITY,
} from './commercialConstants.js';

// ================================================================
// POSITION GRADE THRESHOLDS
// ================================================================

const GRADE_THRESHOLDS = [
  { min: 0.75, grade: POSITION_GRADE.STRONG   },
  { min: 0.55, grade: POSITION_GRADE.HEALTHY  },
  { min: 0.35, grade: POSITION_GRADE.STABLE   },
  { min: 0.15, grade: POSITION_GRADE.STRESSED },
  { min: 0.00, grade: POSITION_GRADE.AT_RISK  },
];

function _toGrade(score) {
  const s = Math.max(0, Math.min(1, score));
  for (const t of GRADE_THRESHOLDS) {
    if (s >= t.min) return t.grade;
  }
  return POSITION_GRADE.AT_RISK;
}

// ================================================================
// COMPOSITE SCORE
// ================================================================

function _computeCompositeScore(drivers, signals) {
  if (drivers.length === 0) return 0.6; // no data = assume stable baseline

  // Base score from driver directions
  let score = 0.6; // starting baseline

  const negativeDrivers = drivers.filter((d) => d.direction === DRIVER_DIRECTION.NEGATIVE);
  const positiveDrivers = drivers.filter((d) => d.direction === DRIVER_DIRECTION.POSITIVE);

  // Each negative driver subtracts proportionally to its rawScore
  for (const d of negativeDrivers) {
    score -= d.rawScore * 0.15; // max deduction per driver: 0.15
  }

  // Each positive driver adds proportionally to its rawScore
  for (const d of positiveDrivers) {
    score += d.rawScore * 0.08; // max addition per driver: 0.08
  }

  // Signal urgency penalties
  const immediateCount = signals.filter((s) => s.urgency === SIGNAL_URGENCY.IMMEDIATE).length;
  const urgentCount    = signals.filter((s) => s.urgency === SIGNAL_URGENCY.URGENT).length;
  score -= immediateCount * 0.12;
  score -= urgentCount    * 0.06;

  return Math.max(0, Math.min(1, score));
}

// ================================================================
// POSITION SUMMARY NARRATIVE
// ================================================================

function _buildPositionSummary(grade, assessments, signals) {
  const criticalAssessments = assessments.filter(
    (a) => a.severity === ASSESSMENT_SEVERITY.CRITICAL || a.severity === ASSESSMENT_SEVERITY.SIGNIFICANT
  );

  const immediateSignals = signals.filter((s) => s.urgency === SIGNAL_URGENCY.IMMEDIATE);
  const urgentSignals    = signals.filter((s) => s.urgency === SIGNAL_URGENCY.URGENT);

  const gradeNarratives = {
    [POSITION_GRADE.STRONG]:  'The pharmacy\'s commercial position is strong. The business is generating revenue effectively with limited capital exposure and reliable supply.',
    [POSITION_GRADE.HEALTHY]: 'The pharmacy\'s commercial position is healthy. Operations are commercially sound with minor exposures that are being managed.',
    [POSITION_GRADE.STABLE]:  'The pharmacy\'s commercial position is stable but under pressure. Known challenges are present and require active management.',
    [POSITION_GRADE.STRESSED]:'The pharmacy\'s commercial position is materially strained. Multiple commercial pressures are active and compound one another.',
    [POSITION_GRADE.AT_RISK]: 'The pharmacy\'s commercial position is critically exposed. Immediate commercial attention is required across multiple dimensions.',
  };

  let summary = gradeNarratives[grade] || 'Commercial position assessment is in progress.';

  if (criticalAssessments.length > 0) {
    summary += ` ${criticalAssessments.length} significant commercial situation${criticalAssessments.length !== 1 ? 's' : ''} identified: ${criticalAssessments.map((a) => a.assessmentType).join(', ')}.`;
  }

  if (immediateSignals.length > 0) {
    summary += ` ${immediateSignals.length} signal${immediateSignals.length !== 1 ? 's' : ''} require immediate commercial attention.`;
  } else if (urgentSignals.length > 0) {
    summary += ` ${urgentSignals.length} signal${urgentSignals.length !== 1 ? 's' : ''} require urgent attention within the next operating period.`;
  }

  return summary;
}

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Compute the Commercial Position from all CIA Core outputs.
 * ADR-065: Stateless, reproducible, never persisted.
 *
 * @param {CommercialDriver[]}     drivers
 * @param {CommercialAssessment[]} assessments
 * @param {CommercialSignal[]}     signals
 * @param {number}                 [now]
 * @returns {CommercialPosition}
 */
export function computePosition(drivers, assessments, signals, now = Date.now()) {
  const compositeScore = _computeCompositeScore(drivers, signals);
  const grade          = _toGrade(compositeScore);
  const positionSummary = _buildPositionSummary(grade, assessments, signals);

  return createPosition({
    grade,
    positionSummary,
    drivers,
    assessments,
    signals,
    now,
  });
}

/**
 * Explain the grade computation for auditability.
 * Used by diagnostic tooling — not part of the standard pipeline.
 */
export function explainGrade(drivers, signals) {
  const score = _computeCompositeScore(drivers, signals);
  const grade = _toGrade(score);

  const negCount = drivers.filter((d) => d.direction === DRIVER_DIRECTION.NEGATIVE).length;
  const posCount = drivers.filter((d) => d.direction === DRIVER_DIRECTION.POSITIVE).length;
  const immCount = signals.filter((s) => s.urgency === SIGNAL_URGENCY.IMMEDIATE).length;
  const urgCount = signals.filter((s) => s.urgency === SIGNAL_URGENCY.URGENT).length;

  return {
    compositeScore: Number(score.toFixed(3)),
    grade,
    explanation: `Score ${score.toFixed(2)}: ${negCount} negative driver${negCount !== 1 ? 's' : ''}, ${posCount} positive driver${posCount !== 1 ? 's' : ''}, ${immCount} immediate signal${immCount !== 1 ? 's' : ''}, ${urgCount} urgent signal${urgCount !== 1 ? 's' : ''}.`,
  };
}
