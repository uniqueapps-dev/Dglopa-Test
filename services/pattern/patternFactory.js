/**
 * DGLOPA PLATFORM — PATTERN INTELLIGENCE FRAMEWORK
 * patternFactory.js — DT-008C
 *
 * Creates immutable Pattern and PatternGraph objects.
 * All produced objects are Object.freeze()d.
 * Consumers may not mutate Pattern objects.
 * enrichPattern() creates a new frozen copy with additional fields.
 */

import { PATTERN_VERSION, FRAMEWORK_VERSION } from './patternConstants.js';

let _seq = 0;

// ================================================================
// PATTERN FACTORY
// ================================================================

/**
 * Create an immutable Pattern object.
 * @param {object} parts
 * @returns {Pattern} — frozen
 */
export function createPattern({
  patternType,
  patternStrength,
  confidence,
  evolution,
  primaryContext,
  relatedContexts    = [],
  patternWindow,
  patternSummary,
  supportingEvidence = [],
  metadata           = {},
}) {
  if (!patternType)     throw new Error('[PatternFactory] patternType is required.');
  if (!patternStrength) throw new Error('[PatternFactory] patternStrength is required.');
  if (!confidence)      throw new Error('[PatternFactory] confidence is required.');
  if (!evolution)       throw new Error('[PatternFactory] evolution is required.');
  if (!primaryContext)  throw new Error('[PatternFactory] primaryContext is required.');
  if (!patternSummary)  throw new Error('[PatternFactory] patternSummary is required.');

  return Object.freeze({
    patternId:          `PAT-${Date.now()}-${(++_seq).toString().padStart(5, '0')}`,
    patternVersion:     PATTERN_VERSION,
    patternType,
    patternStrength,
    confidence,
    evolution,
    primaryContext:     Object.freeze(primaryContext),
    relatedContexts:    Object.freeze([...relatedContexts]),
    patternWindow:      patternWindow ? Object.freeze(patternWindow) : null,
    patternSummary,
    supportingEvidence: Object.freeze([...supportingEvidence]),
    generatedAt:        Date.now(),
    metadata:           Object.freeze({ ...metadata }),
    _frameworkVersion:  FRAMEWORK_VERSION,
  });
}

/**
 * Create an enriched copy without mutating the original.
 */
export function enrichPattern(pattern, enrichment) {
  return Object.freeze({ ...pattern, ...enrichment });
}

// ================================================================
// PATTERN WINDOW FACTORY
// ================================================================

/**
 * Create a PatternWindow object.
 */
export function createPatternWindow(windowType, fromTs, toTs) {
  const durationMs = toTs - fromTs;
  const days       = Math.round(durationMs / 86400000);
  const label      = days >= 365 ? `${Math.round(days / 365)} year${days >= 730 ? 's' : ''}`
                   : days >= 90  ? `${Math.round(days / 30)} months`
                   : days >= 14  ? `${Math.round(days / 7)} weeks`
                   : `${days} days`;

  return Object.freeze({
    windowType,
    fromTs,
    toTs,
    durationMs,
    label: `${windowType} window (${label})`,
  });
}

// ================================================================
// PATTERN RELATIONSHIP FACTORY
// ================================================================

/**
 * Create an immutable PatternRelationship.
 */
export function createPatternRelationship({
  fromPatternId,
  toPatternId,
  relationshipType,
  label,
}) {
  return Object.freeze({
    relationshipId:  `PREL-${Date.now()}-${(++_seq).toString().padStart(5, '0')}`,
    fromPatternId,
    toPatternId,
    relationshipType,
    label,
  });
}

// ================================================================
// PATTERN GRAPH FACTORY
// ================================================================

/**
 * Create an immutable PatternGraph.
 */
export function createPatternGraph(patterns, relationships, totalContextsAnalysed, now = Date.now()) {
  // Compute dominant type and strength
  const typeCounts     = {};
  const strengthCounts = {};
  for (const p of patterns) {
    typeCounts[p.patternType]         = (typeCounts[p.patternType]         || 0) + 1;
    strengthCounts[p.patternStrength] = (strengthCounts[p.patternStrength] || 0) + 1;
  }
  const dominantPatternType = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';
  const dominantStrength    = Object.entries(strengthCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

  return Object.freeze({
    patterns:                Object.freeze([...patterns]),
    relationships:           Object.freeze([...relationships]),
    totalContextsAnalysed,
    dominantPatternType,
    dominantStrength,
    patternCount:            patterns.length,
    highStrengthCount:       patterns.filter((p) => ['HIGH','VERY_HIGH'].includes(p.patternStrength)).length,
    emergingCount:           patterns.filter((p) => p.evolution === 'EMERGING').length,
    strengtheningCount:      patterns.filter((p) => p.evolution === 'STRENGTHENING').length,
    generatedAt:             now,
  });
}

/**
 * Reset sequence counter (tests only).
 */
export function _resetSeq() { _seq = 0; }
