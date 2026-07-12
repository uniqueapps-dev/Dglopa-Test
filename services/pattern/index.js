/**
 * DGLOPA PLATFORM — PATTERN INTELLIGENCE FRAMEWORK
 * Public API — DT-008C
 *
 * All consumers import from this file only.
 *
 * ================================================================
 * QUICK REFERENCE
 * ================================================================
 *
 * Primary usage (full pipeline):
 *
 *   import { assembleSemanticEvents }  from '../semantic/index.js';
 *   import { correlate }               from '../context/index.js';
 *   import { correlatePatterns, PATTERN_WINDOW, PATTERN_TYPE } from '../pattern/index.js';
 *
 *   // Assemble + correlate into context graphs (one per scope/entity)
 *   const { events } = await assembleSemanticEvents({ entityType: ENTITY_TYPE.SUPPLIER, entityId });
 *   const contextGraph = correlate(events, { entityId, windowType: WINDOW_TYPE.SUPPLIER });
 *
 *   // Correlate context graphs into pattern graph
 *   const patternGraph = correlatePatterns([contextGraph], {
 *     windowType: PATTERN_WINDOW.ROLLING_90,
 *   });
 *
 *   // Inspect patterns (Commercial Intelligence input)
 *   patternGraph.patterns.forEach((p) => {
 *     console.log(p.patternType);     // RepeatedStockout | ExpiryLoss | ...
 *     console.log(p.patternStrength); // VERY_HIGH | HIGH | MEDIUM | LOW | VERY_LOW
 *     console.log(p.confidence);      // HIGH | MEDIUM | LOW
 *     console.log(p.evolution);       // EMERGING | STABLE | STRENGTHENING | ...
 *     console.log(p.patternSummary);  // plain-language business description
 *   });
 *
 * Register a new pattern from a future module:
 *
 *   import { registerPattern } from '../pattern/index.js';
 *   registerPattern('PricePressure', {
 *     label:       'Price Pressure Pattern',
 *     description: 'Unit costs are rising consistently from a supplier.',
 *     detect: (contexts, window, now) => { ... return { rawStrength, occurrences, evidence, contextIds }; },
 *   });
 * ================================================================
 */

// ---- Primary correlator ----
export { correlatePatterns }   from './patternCorrelator.js';

// ---- Pattern engine ----
export { discoverPatterns }    from './patternEngine.js';

// ---- Pattern constants ----
export {
  PATTERN_STRENGTH, PATTERN_EVOLUTION, PATTERN_TYPE,
  PATTERN_RELATIONSHIP, PATTERN_WINDOW, CONFIDENCE,
  PATTERN_VERSION, FRAMEWORK_VERSION,
} from './patternConstants.js';

// ---- Pattern factory ----
export {
  createPattern, enrichPattern,
  createPatternWindow, createPatternRelationship, createPatternGraph,
} from './patternFactory.js';

// ---- Pattern registry ----
export {
  getAllPatternDefinitions, getPatternDefinition, registerPattern,
} from './patternRegistry.js';

// ---- Pattern window engine ----
export {
  buildPatternWindow, buildPatternWindows, filterContextsToWindow, registerPatternWindow,
} from './patternWindowEngine.js';

// ---- Pattern strength + evolution engines ----
export {
  classifyStrength, explainStrength,
  classifyEvolution, explainEvolution,
} from './patternStrengthEngine.js';

// ---- Type documentation ----
export { _TYPES_ONLY } from './patternTypes.js';
