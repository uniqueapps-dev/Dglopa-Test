/**
 * DGLOPA PLATFORM — CONTEXT INTELLIGENCE FRAMEWORK
 * contextEngine.js — DT-008B
 *
 * Transforms relationship chains into contextual business knowledge.
 *
 * DESIGN PRINCIPLE: The Context Engine produces understanding.
 * It does NOT produce recommendations.
 * Understanding is: "Supplier reliability is negatively impacting revenue."
 * A recommendation would be: "Switch to a different supplier."
 * Recommendations belong to a future Decision Intelligence layer.
 *
 * The engine:
 *   1. Receives a primary event and its discovered relationship chain
 *   2. Identifies the contextType from the chain pattern
 *   3. Generates a contextSummary (plain-language business understanding)
 *   4. Collects supportingEvidence
 *   5. Delegates confidence classification to the ConfidenceEngine
 *   6. Returns an immutable Context object
 *
 * Context type detection is pattern-based (which event categories are
 * present in the chain) rather than switch-based (no hardcoded per-type
 * branches beyond the pattern matching table).
 */

import { CONTEXT_TYPE, CONFIDENCE }  from './contextConstants.js';
import { CATEGORY, STRATEGIC_INTENT } from '../semantic/eventConstants.js';
import * as ET                        from '../semantic/eventTypes.js';
import { createContext, createChain, createEvidence } from './contextFactory.js';
import { classifyConfidence, assessChainConfidence }  from './confidenceEngine.js';

// ================================================================
// CONTEXT TYPE PATTERNS
// Each pattern defines:
//   match: (chainEventTypes: Set<string>, categories: Set<string>) => boolean
//   type:  CONTEXT_TYPE value
//   priority: lower = checked first
// ================================================================

const CONTEXT_PATTERNS = [
  {
    priority: 1,
    type:      CONTEXT_TYPE.SUPPLY_CHAIN,
    match:     (types, cats) =>
      (types.has(ET.INVENTORY_STOCK_OUT) || types.has(ET.INVENTORY_LOW_STOCK)) &&
      types.has(ET.DEMAND_CAPTURED) &&
      cats.has(CATEGORY.SUPPLIER),
  },
  {
    priority: 2,
    type:      CONTEXT_TYPE.REVENUE_IMPACT,
    match:     (types) =>
      types.has(ET.DEMAND_REPEAT_DETECTED) &&
      (types.has(ET.INVENTORY_STOCK_OUT) || types.has(ET.INVENTORY_LOW_STOCK)),
  },
  {
    priority: 3,
    type:      CONTEXT_TYPE.STOCK_HEALTH,
    match:     (types, cats) =>
      cats.has(CATEGORY.INVENTORY) &&
      (types.has(ET.INVENTORY_LOT_NEAR_EXPIRY) || types.has(ET.INVENTORY_LOT_EXPIRED)),
  },
  {
    priority: 4,
    type:      CONTEXT_TYPE.SUPPLIER_BEHAVIOUR,
    match:     (types, cats) =>
      cats.has(CATEGORY.SUPPLIER) &&
      (types.has(ET.SUPPLIER_PURCHASE_RECORDED) || types.has(ET.SUPPLIER_FIRST_PURCHASE) ||
       types.has(ET.MILESTONE_PURCHASE_VALUE) || types.has(ET.MILESTONE_RELATIONSHIP)),
  },
  {
    priority: 5,
    type:      CONTEXT_TYPE.DEMAND_SIGNAL,
    match:     (types) =>
      types.has(ET.DEMAND_CAPTURED) || types.has(ET.DEMAND_REPEAT_DETECTED),
  },
  {
    priority: 6,
    type:      CONTEXT_TYPE.DATA_QUALITY,
    match:     (types, cats) =>
      cats.has(CATEGORY.REVIEW) || cats.has(CATEGORY.MIGRATION),
  },
  {
    priority: 7,
    type:      CONTEXT_TYPE.MILESTONE,
    match:     (types) =>
      [...types].some((t) => t.startsWith('MILESTONE_')),
  },
  {
    priority: 8,
    type:      CONTEXT_TYPE.OPERATIONAL,
    match:     () => true, // fallback
  },
];

// ================================================================
// NARRATIVE TEMPLATES
// Produce contextSummary strings from chain event data.
// These are templates, not recommendations.
// ================================================================

function _buildNarrative(contextType, primaryEvent, relatedEvents, relationships) {
  const relCount  = relatedEvents.length;
  const intents   = new Set([primaryEvent, ...relatedEvents].map((e) => e.strategicIntent));
  const hasProtect = intents.has(STRATEGIC_INTENT.PROTECT);
  const hasGrow    = intents.has(STRATEGIC_INTENT.GROW);

  switch (contextType) {
    case CONTEXT_TYPE.SUPPLY_CHAIN:
      return `A supply chain disruption is visible: ${relCount} connected event${relCount !== 1 ? 's' : ''} link stock availability to customer demand. ${hasProtect ? 'Capital may be at risk.' : ''} ${hasGrow ? 'Revenue opportunity is being missed.' : ''}`.trim();

    case CONTEXT_TYPE.REVENUE_IMPACT:
      return `Repeated unmet demand combined with insufficient stock suggests an ongoing revenue gap. ${relCount} corroborating event${relCount !== 1 ? 's' : ''} support this signal.`;

    case CONTEXT_TYPE.STOCK_HEALTH:
      return `Inventory health issue detected: ${relCount} related event${relCount !== 1 ? 's' : ''} indicate expiry risk or stock quality concerns. ${hasProtect ? 'Capital protection action may be warranted.' : ''}`.trim();

    case CONTEXT_TYPE.SUPPLIER_BEHAVIOUR:
      return `Supplier relationship activity detected across ${relCount} corroborating event${relCount !== 1 ? 's' : ''}. ${hasGrow ? 'Relationship growth signals present.' : 'Relationship pattern requires attention.'}`.trim();

    case CONTEXT_TYPE.DEMAND_SIGNAL:
      return `Demand signal detected: ${relCount} related event${relCount !== 1 ? 's' : ''} indicate ${hasGrow ? 'a purchasing or stocking opportunity' : 'unmet customer needs'}.`;

    case CONTEXT_TYPE.DATA_QUALITY:
      return `Data quality context: ${relCount} related event${relCount !== 1 ? 's' : ''} indicate operational records requiring review or correction.`;

    case CONTEXT_TYPE.MILESTONE:
      return `Milestone context: ${primaryEvent.description} ${relCount > 0 ? `Supported by ${relCount} operational event${relCount !== 1 ? 's' : ''}.` : ''}`.trim();

    default:
      return `Operational context: ${primaryEvent.description} ${relCount > 0 ? `${relCount} related event${relCount !== 1 ? 's' : ''} found.` : ''}`.trim();
  }
}

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Build a Context object from a primary event and its relationship chain.
 *
 * @param {PlatformEvent}            primaryEvent
 * @param {PlatformEvent[]}          relatedEvents — events in the chain
 * @param {DiscoveredRelationship[]} relationships — discovered links
 * @param {ContextWindow}            contextWindow
 * @returns {Context}
 */
export function buildContext(primaryEvent, relatedEvents, relationships, contextWindow) {
  // ---- Detect context type ----
  const chainTypes      = new Set([primaryEvent, ...relatedEvents].map((e) => e.eventType));
  const chainCategories = new Set([primaryEvent, ...relatedEvents].map((e) => e.category));

  const pattern = CONTEXT_PATTERNS
    .sort((a, b) => a.priority - b.priority)
    .find((p) => p.match(chainTypes, chainCategories));

  const contextType = pattern?.type ?? CONTEXT_TYPE.OPERATIONAL;

  // ---- Confidence ----
  const { confidence, explanation: confExplanation } = classifyConfidence({
    relatedEvents,
    relationships,
    primaryEvent,
  });

  // ---- Relationship chain ----
  const chainEvents = [primaryEvent, ...relatedEvents].sort((a, b) => a.timestamp - b.timestamp);
  const narrative   = _buildNarrative(contextType, primaryEvent, relatedEvents, relationships);
  const chain       = {
    chainId:       `CHN-${Date.now()}`,
    primaryEventId: primaryEvent.eventId,
    links:         Object.freeze([...relationships]),
    eventSequence: Object.freeze(chainEvents.map((e) => e.eventId)),
    narrative,
  };

  // ---- Supporting evidence ----
  const evidence = [
    createEvidence('event', `Primary event: ${primaryEvent.title}`, null, primaryEvent.eventId),
    ...relatedEvents.slice(0, 5).map((e) =>
      createEvidence('event', `Related: ${e.title}`, null, e.eventId)
    ),
    createEvidence('aggregate', `Confidence explanation: ${confExplanation}`, relatedEvents.length),
  ];

  return createContext({
    contextType,
    confidence,
    primaryEvent,
    relatedEvents,
    relationshipChain:  chain,
    contextWindow,
    contextSummary:     narrative,
    supportingEvidence: evidence,
    metadata: {
      chainLength:      chainEvents.length,
      relationshipCount: relationships.length,
      contextPatternMatched: contextType,
    },
  });
}

/**
 * Detect the most likely context type for a set of events
 * without building a full Context object (fast path for categorisation).
 *
 * @param {PlatformEvent[]} events
 * @returns {string} CONTEXT_TYPE value
 */
export function detectContextType(events) {
  const types = new Set(events.map((e) => e.eventType));
  const cats  = new Set(events.map((e) => e.category));
  const pattern = CONTEXT_PATTERNS
    .sort((a, b) => a.priority - b.priority)
    .find((p) => p.match(types, cats));
  return pattern?.type ?? CONTEXT_TYPE.OPERATIONAL;
}
