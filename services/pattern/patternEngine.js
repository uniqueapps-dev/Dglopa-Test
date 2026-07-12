/**
 * DGLOPA PLATFORM — PATTERN INTELLIGENCE FRAMEWORK
 * patternEngine.js — DT-008C
 *
 * Discovers recurring business patterns from Context objects.
 *
 * DESIGN PRINCIPLE: The Pattern Engine performs NO commercial judgment.
 * It calls registry detect() functions, classifies strength and evolution,
 * builds Pattern objects, and returns them.
 *
 * ALGORITHM (single analysis pass, no N+1):
 *   1. Receive contexts[] and a PatternWindow
 *   2. Split contexts into earlyHalf / lateHalf for evolution analysis
 *   3. For each pattern definition in the registry:
 *      a. Run detect(contexts, window, now) → DetectionResult | null
 *      b. If detected: classifyStrength, classifyEvolution, classifyConfidence
 *      c. Build Pattern object
 *   4. Return Pattern[]
 */

import { getAllPatternDefinitions }          from './patternRegistry.js';
import { classifyStrength, classifyEvolution, explainStrength, explainEvolution } from './patternStrengthEngine.js';
import { createPattern }                    from './patternFactory.js';
import { CONFIDENCE, PATTERN_STRENGTH }     from './patternConstants.js';
import { filterContextsToWindow }           from './patternWindowEngine.js';

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Discover patterns from a Context array within a given window.
 *
 * @param {object[]}     contexts    — Context[] from DT-008B
 * @param {PatternWindow} window
 * @param {number}       [now]
 * @returns {Pattern[]}
 */
export function discoverPatterns(contexts, window, now = Date.now()) {
  const defs = getAllPatternDefinitions();

  // Split contexts for evolution analysis
  const midTs       = window.fromTs + (window.toTs - window.fromTs) / 2;
  const halfWindow1 = { fromTs: window.fromTs, toTs: midTs, durationMs: midTs - window.fromTs };
  const halfWindow2 = { fromTs: midTs, toTs: window.toTs, durationMs: window.toTs - midTs };
  const earlyContexts = filterContextsToWindow(contexts, halfWindow1);
  const lateContexts  = filterContextsToWindow(contexts, halfWindow2);

  const patterns = [];

  for (const def of defs) {
    try {
      const result = def.detect(contexts, window, now);
      if (!result) continue;

      const strength  = classifyStrength(result.rawStrength);
      const evolution = classifyEvolution(earlyContexts, lateContexts, def.detect, window, now);
      const confidence = _classifyPatternConfidence(result, contexts, def);

      // Build pattern summary
      const summary = [
        `${def.label}: ${result.evidence[0] || def.description}`,
        `Strength: ${strength}. Evolution: ${evolution}.`,
        explainEvolution(evolution),
      ].join(' ');

      // Find primary context (first matching context in the detection result)
      const primaryContext = contexts.find((c) => result.contextIds?.[0] === c.contextId) || contexts[0];
      const relatedContexts = contexts.filter((c) => result.contextIds?.slice(1).includes(c.contextId));

      const supportingEvidence = [
        ...result.evidence,
        explainStrength(strength, result.occurrences, window.label || 'analysis window'),
      ];

      patterns.push(createPattern({
        patternType:     def.patternType,
        patternStrength: strength,
        confidence,
        evolution,
        primaryContext,
        relatedContexts,
        patternWindow:   window,
        patternSummary:  summary,
        supportingEvidence,
        metadata: {
          rawStrength:  result.rawStrength,
          occurrences:  result.occurrences,
          contextCount: result.contextIds?.length || 0,
          patternLabel: def.label,
          detectedContextIds: result.contextIds || [],
        },
      }));
    } catch (err) {
      // One failing pattern definition never stops the entire analysis
      console.warn(`[PatternEngine] Pattern detection failed for "${def.patternType}": ${err.message}`);
    }
  }

  // Sort by strength descending
  const strengthOrder = {
    [PATTERN_STRENGTH.VERY_HIGH]: 0,
    [PATTERN_STRENGTH.HIGH]:      1,
    [PATTERN_STRENGTH.MEDIUM]:    2,
    [PATTERN_STRENGTH.LOW]:       3,
    [PATTERN_STRENGTH.VERY_LOW]:  4,
  };
  patterns.sort((a, b) => (strengthOrder[a.patternStrength] ?? 9) - (strengthOrder[b.patternStrength] ?? 9));

  return patterns;
}

// ================================================================
// CONFIDENCE CLASSIFICATION (for patterns)
// Pattern confidence differs from event confidence:
// it measures how well the Context evidence supports the pattern,
// not how strong the pattern is.
// ================================================================

function _classifyPatternConfidence(result, contexts, def) {
  const contextCount  = result.contextIds?.length || 0;
  const occurrences   = result.occurrences || 0;
  const hasRequired   = def.requiredContextTypes.length === 0 ||
    def.requiredContextTypes.every((ct) => contexts.some((c) => c.contextType === ct));

  if (contextCount >= 3 && occurrences >= 5 && hasRequired) return CONFIDENCE.HIGH;
  if (contextCount >= 2 || (occurrences >= 3 && hasRequired)) return CONFIDENCE.MEDIUM;
  return CONFIDENCE.LOW;
}
