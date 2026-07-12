/**
 * DGLOPA PLATFORM — EVENT INTELLIGENCE FRAMEWORK
 * DT-008A: Public API for the Event Intelligence Framework.
 *
 * Consumers (intelligence modules, future UI components, analytics engines)
 * import exclusively from this file. The internal structure of the framework
 * can change without touching any consumer — as long as this public API
 * contract is preserved.
 *
 * USAGE:
 *
 *   import { assembleEvents, IMPORTANCE, CATEGORY, ENTITY_TYPE } from '../intelligence/index.js';
 *
 *   // Full platform timeline (newest first)
 *   const { events, timeline } = await assembleEvents();
 *
 *   // Scoped to one supplier
 *   const { events } = await assembleEvents({
 *     entityType: ENTITY_TYPE.SUPPLIER,
 *     entityId:   'SUP-000001',
 *   });
 *
 *   // Only demand and inventory events, last 30 days
 *   const thirtyDays = Date.now() - 30 * 86400000;
 *   const { events } = await assembleEvents({
 *     fromTs:     thirtyDays,
 *     categories: [CATEGORY.DEMAND, CATEGORY.INVENTORY],
 *   });
 *
 *   // Register a new event type from a future module
 *   registerEventType('SALE_COMPLETED', {
 *     category:     CATEGORY.COMMERCIAL,
 *     importance:   IMPORTANCE.SUCCESS,
 *     sourceModule: 'Sales',
 *     description:  'A sale was completed.',
 *   });
 *
 *   // Register a new milestone group from a future module
 *   registerMilestoneGroup('salesRevenue', {
 *     eventType:   'MILESTONE_SALES_REVENUE',
 *     category:    CATEGORY.COMMERCIAL,
 *     entityType:  ENTITY_TYPE.PLATFORM,
 *     sourceModule:'System',
 *     thresholds:  [
 *       { value: 1_000_000, label: '₦1M', title: '₦1 Million Revenue' },
 *     ],
 *   });
 */

// ---- Core assembly ----
export { assembleEvents }         from './eventAssembler.js';

// ---- Event model ----
export { createEvent, IMPORTANCE, CATEGORY, ENTITY_TYPE, SOURCE_MODULE } from './eventModel.js';

// ---- Event registry ----
export {
  getEventDefinition,
  getAllEventTypes,
  registerEventType,
  getEventTypesByCategory,
  getSyntheticEventTypes,
} from './eventRegistry.js';

// ---- Importance engine ----
export { classify, reclassifyAll, registerContextRule } from './importanceEngine.js';

// ---- Milestone engine ----
export {
  detectSupplierMilestones,
  detectDemandMilestones,
  registerMilestoneGroup,
  MILESTONE_CONFIG,
} from './milestoneEngine.js';

// ---- Classifiers (for direct use in scoped consumers, e.g. Supplier Timeline) ----
export {
  classifySession,
  classifyLot,
  classifyPurchase,
  classifyDemand,
  classifySupplier,
  classifyReviewItem,
} from './eventClassifier.js';
