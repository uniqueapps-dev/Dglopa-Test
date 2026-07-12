/**
 * DGLOPA PLATFORM — SEMANTIC INTELLIGENCE FRAMEWORK
 * semanticEngine.js — DT-008A (Semantic)
 *
 * The Semantic Engine owns meaning.
 *
 * It assigns the two non-urgency semantic dimensions:
 *   strategicIntent  — "Why does this matter to the business?"
 *   obligationType   — "What is the nature of the commitment?"
 *
 * It does NOT determine urgency (that is the ImportanceEngine's job).
 * It does NOT generate recommendations (that is a future Decision Engine).
 *
 * DESIGN PRINCIPLE: Semantic dimensions are determined by context,
 * not just event type. The registry provides defaults; the semantic
 * engine applies context rules to override them.
 *
 * Examples of context-driven semantic overrides:
 *   - A LOT_NEAR_EXPIRY with high remaining quantity → PROTECT + MANDATORY
 *     (significant capital at risk)
 *   - A DEMAND_CAPTURED with no stock AND high repeat count → GROW + MANDATORY
 *     (consistent revenue gap)
 *   - A REVIEW_ITEM_RAISED for an Unknown Product with evidence → LEARN + ASPIRATIONAL
 *     (data enrichment opportunity)
 *   - A SUPPLIER_PURCHASE_RECORDED for the first purchase → GROW + NONE
 *     (relationship development signal)
 */

import { STRATEGIC_INTENT, OBLIGATION_TYPE } from './eventConstants.js';
import * as ET from './eventTypes.js';

// ================================================================
// BUILT-IN SEMANTIC CONTEXT RULES
// ================================================================
// Rule signature: (event) => { strategicIntent, obligationType } | null
// null = keep registry defaults

const _rules = [

  // Near-expiry lot with significant quantity → PROTECT + MANDATORY
  (ev) => {
    if (ev.eventType !== ET.INVENTORY_LOT_NEAR_EXPIRY) return null;
    const qty = ev.metadata?.quantityAvailable ?? 0;
    if (qty >= 10) {
      return { strategicIntent: STRATEGIC_INTENT.PROTECT, obligationType: OBLIGATION_TYPE.MANDATORY };
    }
    return null;
  },

  // Repeated demand above threshold → GROW + MANDATORY (purchase signal)
  (ev) => {
    if (ev.eventType !== ET.DEMAND_REPEAT_DETECTED && ev.eventType !== ET.DEMAND_CAPTURED) return null;
    const repeat = ev.metadata?.repeatCount ?? 0;
    if (repeat >= 3) {
      return { strategicIntent: STRATEGIC_INTENT.GROW, obligationType: OBLIGATION_TYPE.MANDATORY };
    }
    return null;
  },

  // Review item for Unknown Product with evidence → LEARN + ASPIRATIONAL
  (ev) => {
    if (ev.eventType !== ET.REVIEW_ITEM_RAISED) return null;
    if (ev.metadata?.category === 'Unknown Product' && ev.metadata?.hasEvidence) {
      return { strategicIntent: STRATEGIC_INTENT.LEARN, obligationType: OBLIGATION_TYPE.ASPIRATIONAL };
    }
    return null;
  },

  // Expired lot with remaining stock → PROTECT + MANDATORY
  (ev) => {
    if (ev.eventType !== ET.INVENTORY_LOT_EXPIRED) return null;
    const qty = ev.metadata?.quantityAvailable ?? 0;
    if (qty > 0) {
      return { strategicIntent: STRATEGIC_INTENT.PROTECT, obligationType: OBLIGATION_TYPE.MANDATORY };
    }
    return { strategicIntent: STRATEGIC_INTENT.LEARN, obligationType: OBLIGATION_TYPE.NONE };
  },

  // Failed import → PROTECT + MANDATORY (data integrity risk)
  (ev) => {
    if (ev.eventType !== ET.MIGRATION_IMPORT_FAILED) return null;
    return { strategicIntent: STRATEGIC_INTENT.PROTECT, obligationType: OBLIGATION_TYPE.MANDATORY };
  },

  // First purchase from a supplier → GROW + ASPIRATIONAL (relationship signal)
  (ev) => {
    if (ev.eventType !== ET.SUPPLIER_FIRST_PURCHASE) return null;
    return { strategicIntent: STRATEGIC_INTENT.GROW, obligationType: OBLIGATION_TYPE.ASPIRATIONAL };
  },

];

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Compute the final strategicIntent and obligationType for an event,
 * applying context rules over the registry defaults.
 *
 * @param {PlatformEvent} event
 * @returns {{ strategicIntent: string, obligationType: string }}
 */
export function classifySemantics(event) {
  for (const rule of _rules) {
    const override = rule(event);
    if (override !== null) return override;
  }
  // Return registry defaults already embedded in the event
  return {
    strategicIntent: event.strategicIntent,
    obligationType:  event.obligationType,
  };
}

/**
 * Apply semantic classification to an assembled batch.
 * Returns new frozen events where dimensions may be updated.
 *
 * @param {PlatformEvent[]} events
 * @returns {PlatformEvent[]}
 */
export function reclassifySemantics(events) {
  return events.map((ev) => {
    const { strategicIntent, obligationType } = classifySemantics(ev);
    if (
      strategicIntent === ev.strategicIntent &&
      obligationType  === ev.obligationType
    ) return ev;
    return Object.freeze({ ...ev, strategicIntent, obligationType });
  });
}

/**
 * Register an additional semantic context rule.
 * @param {function} ruleFn — (event) => { strategicIntent, obligationType } | null
 */
export function registerSemanticRule(ruleFn) {
  if (typeof ruleFn !== 'function') throw new Error('[SemanticEngine] Rule must be a function.');
  _rules.push(ruleFn);
}

/**
 * Explain the semantics of an event in human-readable form.
 * Used by future intelligence engines that need to communicate WHY
 * a recommendation exists.
 *
 * @param {PlatformEvent} event
 * @returns {string}
 */
export function explainSemantics(event) {
  const intent = {
    PROTECT:  'This event signals a risk to existing capital or inventory quality.',
    GROW:     'This event signals an opportunity to grow revenue or supplier relationships.',
    LEARN:    'This event provides data that improves operational knowledge.',
    OPERATE:  'This event is part of normal operational continuity.',
  }[event.strategicIntent] || 'No semantic explanation available.';

  const obligation = {
    MANDATORY:    'Action is required. Failure to act has operational or financial consequences.',
    ASPIRATIONAL: 'Action is recommended. Not acting is acceptable in the short term.',
    NONE:         'This event is informational. No action is implied.',
  }[event.obligationType] || '';

  return `${intent} ${obligation}`.trim();
}
