/**
 * DGLOPA PLATFORM — SEMANTIC INTELLIGENCE FRAMEWORK
 * importanceEngine.js — DT-008A (Semantic)
 *
 * Answers one question only: "How urgent is this?"
 *
 * DESIGN PRINCIPLE: Importance must NEVER encode business strategy.
 * That is the SemanticEngine's responsibility.
 *
 * Two-layer model:
 *   1. Registry provides a default importance per event type.
 *   2. Context rules may override the default based on run-time metadata.
 *
 * Context rules are pure functions: (event) => IMPORTANCE | null
 * null means "keep the default."
 *
 * Rules are evaluated in order; the first non-null return wins.
 * This is intentional: rule precedence is explicit, not emergent.
 */

import { IMPORTANCE } from './eventConstants.js';
import * as ET        from './eventTypes.js';

const NEAR_EXPIRY_CRITICAL_DAYS = 30;

// ================================================================
// BUILT-IN CONTEXT RULES
// ================================================================

const _rules = [

  // Near-expiry lot expiring within 30 days → CRITICAL (not WARNING)
  (ev) => {
    if (ev.eventType !== ET.INVENTORY_LOT_NEAR_EXPIRY) return null;
    const d = ev.metadata?.daysToExpiry;
    return (d != null && d <= NEAR_EXPIRY_CRITICAL_DAYS) ? IMPORTANCE.CRITICAL : null;
  },

  // Demand for a zero-stock product → CRITICAL (not WARNING)
  (ev) => {
    if (ev.eventType !== ET.DEMAND_CAPTURED) return null;
    return ev.metadata?.productCurrentStock === 0 ? IMPORTANCE.CRITICAL : null;
  },

  // Error-severity review item → CRITICAL (not WARNING)
  (ev) => {
    if (ev.eventType !== ET.REVIEW_ITEM_RAISED) return null;
    return ev.metadata?.severity === 'error' ? IMPORTANCE.CRITICAL : null;
  },

  // Failed import → always CRITICAL
  (ev) => {
    return ev.eventType === ET.MIGRATION_IMPORT_FAILED ? IMPORTANCE.CRITICAL : null;
  },

  // Synthetic milestones → always SUCCESS
  (ev) => {
    return (ev.synthetic && ev.eventType.startsWith('MILESTONE_')) ? IMPORTANCE.SUCCESS : null;
  },

];

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Determine the final importance of an event.
 * Registry default → context rule override.
 *
 * @param {PlatformEvent} event
 * @returns {string} IMPORTANCE value
 */
export function classifyImportance(event) {
  for (const rule of _rules) {
    const override = rule(event);
    if (override !== null) return override;
  }
  return event.importance; // already set from registry default
}

/**
 * Apply importance classification to an assembled batch.
 * Returns new frozen events where importance may be upgraded.
 *
 * @param {PlatformEvent[]} events
 * @returns {PlatformEvent[]}
 */
export function reclassifyImportance(events) {
  return events.map((ev) => {
    const importance = classifyImportance(ev);
    return importance === ev.importance ? ev : Object.freeze({ ...ev, importance });
  });
}

/**
 * Register an additional context rule from an external module.
 * @param {function} ruleFn — (event) => IMPORTANCE | null
 */
export function registerImportanceRule(ruleFn) {
  if (typeof ruleFn !== 'function') throw new Error('[ImportanceEngine] Rule must be a function.');
  _rules.push(ruleFn);
}
