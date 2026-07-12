/**
 * DGLOPA PLATFORM — CONTEXT INTELLIGENCE FRAMEWORK
 * Public API — DT-008B
 *
 * All consumers import from this file only.
 *
 * ================================================================
 * QUICK REFERENCE
 * ================================================================
 *
 * Primary usage (full correlation pipeline):
 *
 *   import { assembleSemanticEvents } from '../semantic/index.js';
 *   import { correlate, CONTEXT_TYPE, CONFIDENCE } from '../context/index.js';
 *
 *   // Assemble semantic events for a supplier
 *   const { events } = await assembleSemanticEvents({
 *     entityType: ENTITY_TYPE.SUPPLIER,
 *     entityId:   'SUP-000001',
 *   });
 *
 *   // Correlate into a Context Graph
 *   const graph = correlate(events, {
 *     entityId:   'SUP-000001',
 *     windowType: WINDOW_TYPE.SUPPLIER,
 *   });
 *
 *   // Inspect contexts
 *   graph.contexts.forEach((ctx) => {
 *     console.log(ctx.contextSummary);  // plain-language understanding
 *     console.log(ctx.confidence);      // HIGH | MEDIUM | LOW
 *     console.log(ctx.contextType);     // SupplyChain | RevenueImpact | ...
 *   });
 *
 * Fine-grained usage:
 *
 *   // Discover relationships for one event
 *   import { discoverChildren, discoverParents } from '../context/index.js';
 *   const children = discoverChildren(event, allEvents);
 *
 *   // Build a specific context window
 *   import { buildWindow } from '../context/index.js';
 *   const window = buildWindow(WINDOW_TYPE.MONTHLY, allEvents, null, Date.now());
 *
 *   // Register a new relationship type from a future module
 *   import { registerRelationship, RELATIONSHIP_TYPE } from '../context/index.js';
 *   registerRelationship({
 *     fromType:        'SALE_COMPLETED',
 *     toType:          'INVENTORY_LOW_STOCK',
 *     relationship:    RELATIONSHIP_TYPE.RESULTS_IN,
 *     label:           'A sale depletes inventory and may cause low stock',
 *     matchPredicate:  (from, to) => from.metadata?.productId === to.entityId,
 *     maxWindowDays:   1,
 *     strength:        0.9,
 *   });
 * ================================================================
 */

// ---- Primary correlation entry point ----
export { correlate }                              from './eventCorrelator.js';

// ---- Context constants ----
export {
  RELATIONSHIP_TYPE, CONFIDENCE, CONTEXT_TYPE, WINDOW_TYPE,
  CONTEXT_VERSION, FRAMEWORK_VERSION,
} from './contextConstants.js';

// ---- Context factory ----
export {
  createContext, enrichContext,
  createRelationship, createChain, createWindow, createEvidence,
} from './contextFactory.js';

// ---- Relationship registry ----
export {
  getAllRelationships, getRelationshipsFrom, getRelationshipsTo, registerRelationship,
} from './relationshipRegistry.js';

// ---- Relationship engine ----
export { discoverChildren, discoverParents, traverseChain, discoverRelated } from './relationshipEngine.js';

// ---- Context engine ----
export { buildContext, detectContextType } from './contextEngine.js';

// ---- Context window engine ----
export { buildWindow, buildWindows, registerWindowType } from './contextWindowEngine.js';

// ---- Confidence engine ----
export { classifyConfidence, assessChainConfidence } from './confidenceEngine.js';

// ---- Type documentation (no runtime exports) ----
export { _TYPES_ONLY } from './contextTypes.js';
