/**
 * DGLOPA PLATFORM — SEMANTIC INTELLIGENCE FRAMEWORK
 * Public API — DT-008A (Semantic)
 *
 * All consumers import from this file only.
 * Internal structure may evolve without touching consumers.
 *
 * ================================================================
 * QUICK REFERENCE
 * ================================================================
 *
 * Assembly:
 *   assembleSemanticEvents(options)  → SemanticAssemblyResult
 *   assembleSemanticEvents({ entityType: ENTITY_TYPE.SUPPLIER, entityId: 'SUP-000001' })
 *   assembleSemanticEvents({ categories: [CATEGORY.DEMAND, CATEGORY.INVENTORY] })
 *   assembleSemanticEvents({ importanceLevels: [IMPORTANCE.CRITICAL] })
 *
 * Event Creation:
 *   createPlatformEvent({ ... })    → immutable PlatformEvent
 *   enrichEvent(event, enrichment)  → new immutable PlatformEvent
 *   isPlatformEvent(obj)            → boolean
 *
 * Registry:
 *   getDefinition(eventType)        → EventDefinition | null
 *   getAllDefinitions()              → EventDefinition[]
 *   registerEventType(type, def)    → void (extends registry for future modules)
 *
 * Engines:
 *   classifyImportance(event)       → IMPORTANCE value
 *   classifySemantics(event)        → { strategicIntent, obligationType }
 *   explainSemantics(event)         → human-readable string
 *   registerImportanceRule(fn)      → void (extend importance context rules)
 *   registerSemanticRule(fn)        → void (extend semantic context rules)
 *
 * Milestones:
 *   detectSupplierMilestones(agg, now) → PlatformEvent[]
 *   detectDemandMilestones(freqs, now) → PlatformEvent[]
 *   registerMilestoneGroup(key, cfg)   → void
 *   MILESTONE_CONFIG                   → read-only configuration object
 *
 * Constants:
 *   IMPORTANCE, STRATEGIC_INTENT, OBLIGATION_TYPE
 *   CATEGORY, ENTITY_TYPE, SOURCE_MODULE
 *   FRAMEWORK_VERSION, EVENT_VERSION
 *
 * Event Types:
 *   RECEIVING_SESSION_STARTED, INVENTORY_LOT_EXPIRED, DEMAND_CAPTURED, ...
 *   (see eventTypes.js for full list)
 * ================================================================
 */

// ---- Assembly ----
export { assembleSemanticEvents } from './eventAssembler.js';

// ---- Event factory ----
export { createPlatformEvent, enrichEvent, isPlatformEvent } from './eventFactory.js';

// ---- Constants ----
export {
  IMPORTANCE, STRATEGIC_INTENT, OBLIGATION_TYPE,
  CATEGORY, ENTITY_TYPE, SOURCE_MODULE,
  FRAMEWORK_VERSION, EVENT_VERSION,
} from './eventConstants.js';

// ---- Event types ----
export * from './eventTypes.js';

// ---- Registry ----
export {
  getDefinition,
  getAllDefinitions,
  registerEventType,
  getDefinitionsByCategory,
  getSyntheticDefinitions,
  isRegistered,
} from './eventRegistry.js';

// ---- Importance engine ----
export { classifyImportance, reclassifyImportance, registerImportanceRule } from './importanceEngine.js';

// ---- Semantic engine ----
export { classifySemantics, reclassifySemantics, registerSemanticRule, explainSemantics } from './semanticEngine.js';

// ---- Milestone engine ----
export { detectSupplierMilestones, detectDemandMilestones, registerMilestoneGroup, MILESTONE_CONFIG } from './milestoneEngine.js';

// ---- Synthetic generator ----
export {
  generateSyntheticEvents,
  generateSupplierMilestones,
  generateDemandMilestones,
  generateReviewQueueClearedEvent,
} from './syntheticEventGenerator.js';
