/**
 * DGLOPA PLATFORM — PATTERN INTELLIGENCE FRAMEWORK
 * patternTypes.js — DT-008C
 *
 * JSDoc type definitions. Runtime no-op — type documentation only.
 *
 * Tracability chain (per spec success criteria):
 *   PatternGraph
 *     → Pattern[]
 *       → Context[]  (from DT-008B)
 *         → PlatformEvent[]  (from DT-008A)
 *           → OperationalRecord  (original DB row)
 *
 * Every Pattern object is fully traceable back to the originating
 * operational records via this chain.
 */

/**
 * @typedef {object} PatternDefinition
 * @property {string}   patternType
 * @property {string}   label           — human-readable name
 * @property {string}   description     — what behaviour this pattern captures
 * @property {function} detect          — (contexts, window, now) => DetectionResult | null
 *                                        Returns null if pattern not detected.
 *                                        Returns { rawStrength, occurrences, evidence } if detected.
 * @property {string[]} requiredContextTypes — CONTEXT_TYPE values that must be present
 */

/**
 * @typedef {object} DetectionResult
 * @property {number}   rawStrength     — 0..1 computed strength before PATTERN_STRENGTH mapping
 * @property {number}   occurrences     — how many times the behaviour was observed
 * @property {string[]} evidence        — human-readable evidence strings
 * @property {string[]} contextIds      — IDs of contexts supporting this detection
 */

/**
 * @typedef {object} PatternWindow
 * @property {string} windowType        — PATTERN_WINDOW value
 * @property {number} fromTs
 * @property {number} toTs
 * @property {number} durationMs
 * @property {string} label             — human-readable window description
 */

/**
 * @typedef {object} PatternRelationship
 * @property {string} relationshipId
 * @property {string} fromPatternId
 * @property {string} toPatternId
 * @property {string} relationshipType  — PATTERN_RELATIONSHIP value
 * @property {string} label
 */

/**
 * @typedef {object} Pattern
 * @property {string}              patternId
 * @property {string}              patternVersion
 * @property {string}              patternType     — PATTERN_TYPE value
 * @property {string}              patternStrength — PATTERN_STRENGTH value
 * @property {string}              confidence      — CONFIDENCE value
 * @property {string}              evolution       — PATTERN_EVOLUTION value
 * @property {object}              primaryContext   — the leading Context object
 * @property {object[]}            relatedContexts
 * @property {PatternWindow}       patternWindow
 * @property {string}              patternSummary
 * @property {string[]}            supportingEvidence
 * @property {number}              generatedAt
 * @property {object}              metadata
 */

/**
 * @typedef {object} PatternGraph
 * @property {Pattern[]}           patterns
 * @property {PatternRelationship[]} relationships
 * @property {number}              totalContextsAnalysed
 * @property {string}              dominantPatternType
 * @property {string}              dominantStrength
 * @property {number}              generatedAt
 */

export const _TYPES_ONLY = true;
