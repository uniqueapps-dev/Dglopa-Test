/**
 * DGLOPA PLATFORM — COMMERCIAL INTELLIGENCE CORE (CIA Core)
 * Public API — EPIC-001A
 *
 * All consumers import from this file only.
 * Internal pipeline structure can evolve without touching consumers.
 *
 * ================================================================
 * QUICK REFERENCE
 * ================================================================
 *
 * Standard usage (full pipeline):
 *
 *   import { buildCommercialIntelligence } from '../commercial/index.js';
 *   import { assembleSemanticEvents }      from '../semantic/index.js';
 *   import { correlate }                   from '../context/index.js';
 *   import { correlatePatterns }           from '../pattern/index.js';
 *
 *   // Assemble the cognitive architecture outputs
 *   const { events }      = await assembleSemanticEvents();
 *   const contextGraph    = correlate(events, { windowType: WINDOW_TYPE.SUPPLIER });
 *   const patternGraph    = correlatePatterns([contextGraph]);
 *
 *   // Run CIA Core pipeline
 *   const { drivers, assessments, signals, position } = buildCommercialIntelligence({
 *     patternGraphs: [patternGraph],
 *     contextGraphs: [contextGraph],
 *     events,
 *   });
 *
 *   // Inspect outputs
 *   console.log(position.grade);           // 'Stable' | 'Stressed' | 'AtRisk' | ...
 *   console.log(position.positionSummary); // plain-language commercial position
 *   signals.forEach((s) => {
 *     console.log(s.title);     // 'Revenue Gap Identified — Significant'
 *     console.log(s.urgency);   // 'Immediate' | 'Urgent' | 'Attention' | 'Monitor'
 *   });
 *
 * Extend with a new driver type:
 *
 *   import { registerDriverType } from '../commercial/index.js';
 *   registerDriverType('PriceInflation', {
 *     label:            'Price Inflation',
 *     defaultDirection: DRIVER_DIRECTION.NEGATIVE,
 *     description:      'Selling prices are not keeping pace with cost increases.',
 *   });
 * ================================================================
 */

// ---- Primary entry point ----
export { buildCommercialIntelligence } from './commercialCore.js';

// ---- Stage engines (for direct use in specialised consumers) ----
export { computeDrivers }              from './driverEngine.js';
export { buildAssessments }            from './commercialAssessmentEngine.js';
export { deriveSignals }               from './commercialSignalEngine.js';
export { computePosition, explainGrade } from './commercialScoringEngine.js';

// ---- Constants ----
export {
  DRIVER_TYPE, DRIVER_DIRECTION, DRIVER_MAGNITUDE,
  ASSESSMENT_TYPE, ASSESSMENT_SEVERITY,
  SIGNAL_TYPE, SIGNAL_URGENCY,
  POSITION_GRADE, EVIDENCE_QUALITY,
  CIA_VERSION, FRAMEWORK_VERSION,
} from './commercialConstants.js';

// ---- Factory ----
export {
  createDriver, createAssessment, createSignal, createPosition,
  enrichDriver, enrichAssessment, enrichSignal, enrichPosition,
} from './commercialFactory.js';

// ---- Registry ----
export {
  getDriverDefinition, getAssessmentDefinition, getSignalDefinition,
  getAllDriverDefinitions, getAllAssessmentDefinitions, getAllSignalDefinitions,
  registerDriverType, registerAssessmentType, registerSignalType,
} from './commercialRegistry.js';

// ---- Type documentation ----
export { _TYPES_ONLY } from './commercialTypes.js';
