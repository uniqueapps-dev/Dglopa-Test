/**
 * DGLOPA PLATFORM — IMPORTANCE ENGINE
 * DT-008A: Determines the business importance of an event from its
 * context — not just its event type. The registry provides a default;
 * the engine can override it based on event metadata.
 *
 * DESIGN PRINCIPLE: The framework decides importance; the UI decides colours.
 *
 * Examples of context-driven overrides:
 *   - A LOT_NEAR_EXPIRY event for a lot expiring TODAY is CRITICAL, not WARNING
 *   - A DEMAND_CAPTURED for a product with zero stock is WARNING, not INFO
 *   - A PURCHASE_RECORDED that is the first from a supplier is SUCCESS, not INFO
 *
 * The engine operates on assembled events (after enrichment) and
 * may upgrade or downgrade the registry default based on metadata.
 */

import { IMPORTANCE } from './eventModel.js';
import { getEventDefinition } from './eventRegistry.js';

// ================================================================
// CONTEXT RULES
// ================================================================

const NEAR_EXPIRY_CRITICAL_DAYS = 30; // within 30 days = CRITICAL override

// Rule function signature: (event, context) => IMPORTANCE level | null (null = keep default)
const CONTEXT_RULES = [

  // Near-expiry lots expiring within 30 days → CRITICAL
  (ev, ctx) => {
    if (ev.eventType !== 'LOT_NEAR_EXPIRY') return null;
    const daysToExpiry = ev.metadata?.daysToExpiry;
    if (daysToExpiry != null && daysToExpiry <= NEAR_EXPIRY_CRITICAL_DAYS) {
      return IMPORTANCE.CRITICAL;
    }
    return null;
  },

  // First purchase from a supplier → SUCCESS upgrade from INFO
  (ev) => {
    if (ev.eventType === 'PURCHASE_RECORDED' && ev.metadata?.isFirstPurchase === true) {
      return IMPORTANCE.SUCCESS;
    }
    return null;
  },

  // Demand captured for a product with zero stock → CRITICAL
  (ev) => {
    if (ev.eventType === 'DEMAND_CAPTURED' && ev.metadata?.productCurrentStock === 0) {
      return IMPORTANCE.CRITICAL;
    }
    return null;
  },

  // Review item raised as an error → CRITICAL
  (ev) => {
    if (ev.eventType === 'REVIEW_ITEM_RAISED' && ev.metadata?.severity === 'error') {
      return IMPORTANCE.CRITICAL;
    }
    return null;
  },

  // Synthetic milestone events always stay SUCCESS
  (ev) => {
    if (ev.synthetic && ev.eventType.startsWith('MILESTONE_')) {
      return IMPORTANCE.SUCCESS;
    }
    return null;
  },
];

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Determine the final importance of an event, considering both the
 * registry default and context-driven overrides.
 *
 * @param {BusinessEvent} event
 * @param {object}        context — additional run-time context (optional)
 * @returns {string} IMPORTANCE level
 */
export function classify(event, context = {}) {
  const definition = getEventDefinition(event.eventType);
  const base       = definition?.importance ?? IMPORTANCE.INFO;

  for (const rule of CONTEXT_RULES) {
    const override = rule(event, context);
    if (override !== null) return override;
  }

  return base;
}

/**
 * Reclassify a set of already-assembled events based on context.
 * Applied as a post-processing pass after assembly.
 *
 * @param {BusinessEvent[]} events
 * @returns {BusinessEvent[]} — new array with importance fields updated
 */
export function reclassifyAll(events) {
  return events.map((ev) => {
    const importance = classify(ev);
    if (importance === ev.importance) return ev;
    // Return a new frozen object with the updated importance
    return Object.freeze({ ...ev, importance });
  });
}

/**
 * Register an additional context rule from an external module.
 * Rule must be a function (event, context) => IMPORTANCE | null.
 */
export function registerContextRule(ruleFn) {
  if (typeof ruleFn !== 'function') throw new Error('[ImportanceEngine] Rule must be a function.');
  CONTEXT_RULES.push(ruleFn);
}
