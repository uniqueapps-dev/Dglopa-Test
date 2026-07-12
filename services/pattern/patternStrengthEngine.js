/**
 * DGLOPA PLATFORM — PATTERN INTELLIGENCE FRAMEWORK
 * patternStrengthEngine.js — DT-008C
 *
 * PATTERN STRENGTH ENGINE
 * Maps a raw strength score (0..1 from detect()) to a PATTERN_STRENGTH level.
 *
 * DESIGN PRINCIPLE (ADR-057):
 *   Pattern Strength measures operational magnitude of recurring behaviour.
 *   Pattern Strength is NOT Confidence.
 *   Pattern Strength is NOT urgency (Importance).
 *   These three dimensions are fully independent.
 *
 *   A single extreme event may have VERY_HIGH strength but LOW confidence.
 *   Thirty consistent minor events may have HIGH confidence but LOW strength.
 *
 * PATTERN EVOLUTION ENGINE
 * Tracks how a pattern is changing across time by comparing occurrence rates
 * in successive time sub-windows.
 *
 * Evolution is computed from the raw detection results across two or more
 * time sub-windows — no historical state is required.
 * Evolution is always reproducible from the same input data.
 */

import { PATTERN_STRENGTH, PATTERN_EVOLUTION } from './patternConstants.js';

// ================================================================
// PATTERN STRENGTH ENGINE
// ================================================================

// Strength thresholds — configuration, not hardcoding
const STRENGTH_THRESHOLDS = [
  { min: 0.80, strength: PATTERN_STRENGTH.VERY_HIGH },
  { min: 0.60, strength: PATTERN_STRENGTH.HIGH      },
  { min: 0.35, strength: PATTERN_STRENGTH.MEDIUM    },
  { min: 0.15, strength: PATTERN_STRENGTH.LOW       },
  { min: 0.00, strength: PATTERN_STRENGTH.VERY_LOW  },
];

/**
 * Map a raw detection strength score (0..1) to a PATTERN_STRENGTH level.
 *
 * @param {number} rawStrength — 0..1 from detect()
 * @returns {string} PATTERN_STRENGTH value
 */
export function classifyStrength(rawStrength) {
  const clamped = Math.max(0, Math.min(1, rawStrength ?? 0));
  for (const t of STRENGTH_THRESHOLDS) {
    if (clamped >= t.min) return t.strength;
  }
  return PATTERN_STRENGTH.VERY_LOW;
}

/**
 * Explain the strength classification in plain language.
 *
 * @param {string} strength — PATTERN_STRENGTH value
 * @param {number} occurrences
 * @param {string} windowLabel
 * @returns {string}
 */
export function explainStrength(strength, occurrences, windowLabel) {
  const descriptions = {
    [PATTERN_STRENGTH.VERY_HIGH]: `Very high operational impact — ${occurrences} occurrence${occurrences !== 1 ? 's' : ''} in ${windowLabel}. This pattern is significantly affecting operations.`,
    [PATTERN_STRENGTH.HIGH]:      `High operational impact — ${occurrences} occurrence${occurrences !== 1 ? 's' : ''} in ${windowLabel}. This pattern is consistently present.`,
    [PATTERN_STRENGTH.MEDIUM]:    `Medium operational impact — ${occurrences} occurrence${occurrences !== 1 ? 's' : ''} in ${windowLabel}. This pattern is emerging and worth monitoring.`,
    [PATTERN_STRENGTH.LOW]:       `Low operational impact — ${occurrences} occurrence${occurrences !== 1 ? 's' : ''} in ${windowLabel}. This pattern is present but minor.`,
    [PATTERN_STRENGTH.VERY_LOW]:  `Very low operational impact — ${occurrences} occurrence${occurrences !== 1 ? 's' : ''} in ${windowLabel}. This may be noise rather than a recurring pattern.`,
  };
  return descriptions[strength] || 'Strength unknown.';
}

// ================================================================
// PATTERN EVOLUTION ENGINE
// ================================================================

/**
 * Determine how a pattern is evolving by comparing detection results
 * across two time sub-windows (early half vs late half of the analysis window).
 *
 * @param {object[]} earlyContexts  — contexts from the earlier sub-window
 * @param {object[]} lateContexts   — contexts from the later sub-window
 * @param {function} detect         — the pattern's detect() function
 * @param {object}   window         — the full PatternWindow
 * @param {number}   now
 * @returns {string} PATTERN_EVOLUTION value
 */
export function classifyEvolution(earlyContexts, lateContexts, detect, window, now) {
  const earlyResult = detect(earlyContexts, { fromTs: window.fromTs, toTs: window.fromTs + window.durationMs / 2 }, now);
  const lateResult  = detect(lateContexts,  { fromTs: window.fromTs + window.durationMs / 2, toTs: window.toTs }, now);

  const earlyStr = earlyResult?.rawStrength ?? 0;
  const lateStr  = lateResult?.rawStrength  ?? 0;

  // Neither half has any signal → no pattern to evaluate evolution for
  if (earlyStr === 0 && lateStr === 0) return PATTERN_EVOLUTION.DISAPPEARING;

  // Pattern only appears in the late half → emerging
  if (earlyStr === 0 && lateStr > 0) return PATTERN_EVOLUTION.EMERGING;

  // Pattern only appears in the early half → disappearing
  if (earlyStr > 0 && lateStr === 0) return PATTERN_EVOLUTION.DISAPPEARING;

  // Both halves have signal — compare rates
  const delta     = lateStr - earlyStr;
  const threshold = 0.15; // >15% change = strengthening/weakening

  if (delta >  threshold) return PATTERN_EVOLUTION.STRENGTHENING;
  if (delta < -threshold) return PATTERN_EVOLUTION.WEAKENING;
  return                         PATTERN_EVOLUTION.STABLE;
}

/**
 * Explain pattern evolution in plain language.
 *
 * @param {string} evolution — PATTERN_EVOLUTION value
 * @returns {string}
 */
export function explainEvolution(evolution) {
  const descriptions = {
    [PATTERN_EVOLUTION.EMERGING]:      'This pattern has recently appeared and is not yet established. Monitor to see if it persists.',
    [PATTERN_EVOLUTION.STABLE]:        'This pattern is recurring consistently without significant change in frequency or severity.',
    [PATTERN_EVOLUTION.STRENGTHENING]: 'This pattern is becoming more frequent or severe. It may require attention soon.',
    [PATTERN_EVOLUTION.WEAKENING]:     'This pattern is becoming less frequent or severe. Operational improvements may be taking effect.',
    [PATTERN_EVOLUTION.DISAPPEARING]:  'This pattern has not recurred in recent periods. It may have been resolved or is seasonal.',
  };
  return descriptions[evolution] || 'Evolution unknown.';
}
