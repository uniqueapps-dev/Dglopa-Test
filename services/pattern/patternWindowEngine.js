/**
 * DGLOPA PLATFORM — PATTERN INTELLIGENCE FRAMEWORK
 * patternWindowEngine.js — DT-008C
 *
 * Scopes Context objects into configurable time windows for pattern analysis.
 * Windows are configuration-driven; the engine applies them.
 *
 * Operates on Context[] arrays. Zero DB reads.
 */

import { PATTERN_WINDOW } from './patternConstants.js';
import { createPatternWindow } from './patternFactory.js';

// ================================================================
// WINDOW CONFIGURATION
// Each window definition has a bounds() function: (now) => { from, to }
// ================================================================

const WINDOW_DEFINITIONS = {

  [PATTERN_WINDOW.DAILY]: {
    label:  'Daily',
    bounds: (now) => {
      const d = new Date(now); d.setHours(0, 0, 0, 0);
      return { from: d.getTime(), to: d.getTime() + 86400000 - 1 };
    },
  },

  [PATTERN_WINDOW.WEEKLY]: {
    label:  'Weekly',
    bounds: (now) => {
      const d = new Date(now); d.setHours(0, 0, 0, 0);
      const from = d.getTime() - (d.getDay() * 86400000);
      return { from, to: from + 7 * 86400000 - 1 };
    },
  },

  [PATTERN_WINDOW.MONTHLY]: {
    label:  'Monthly',
    bounds: (now) => {
      const d = new Date(now); d.setDate(1); d.setHours(0, 0, 0, 0);
      const from = d.getTime();
      const next = new Date(d); next.setMonth(next.getMonth() + 1);
      return { from, to: next.getTime() - 1 };
    },
  },

  [PATTERN_WINDOW.QUARTERLY]: {
    label:  'Quarterly',
    bounds: (now) => {
      const d = new Date(now);
      const q = Math.floor(d.getMonth() / 3);
      const from = new Date(d.getFullYear(), q * 3, 1).getTime();
      const to   = new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999).getTime();
      return { from, to };
    },
  },

  [PATTERN_WINDOW.YEARLY]: {
    label:  'Yearly',
    bounds: (now) => {
      const y = new Date(now).getFullYear();
      return { from: new Date(y, 0, 1).getTime(), to: new Date(y, 11, 31, 23, 59, 59, 999).getTime() };
    },
  },

  [PATTERN_WINDOW.ROLLING_7]: {
    label:  'Rolling 7 Days',
    bounds: (now) => ({ from: now - 7 * 86400000, to: now }),
  },

  [PATTERN_WINDOW.ROLLING_30]: {
    label:  'Rolling 30 Days',
    bounds: (now) => ({ from: now - 30 * 86400000, to: now }),
  },

  [PATTERN_WINDOW.ROLLING_90]: {
    label:  'Rolling 90 Days',
    bounds: (now) => ({ from: now - 90 * 86400000, to: now }),
  },
};

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Build a PatternWindow for a given window type.
 * @param {string} windowType — PATTERN_WINDOW value
 * @param {number} [now]
 * @returns {PatternWindow}
 */
export function buildPatternWindow(windowType, now = Date.now()) {
  const def = WINDOW_DEFINITIONS[windowType];
  if (!def) throw new Error(`[PatternWindowEngine] Unknown window type: "${windowType}".`);
  const { from, to } = def.bounds(now);
  return createPatternWindow(windowType, from, to);
}

/**
 * Filter Context objects to those falling within a window.
 * A Context is "within" the window if its generatedAt timestamp is inside,
 * or if any of its events falls inside the window.
 *
 * @param {object[]}   contexts — Context[] from DT-008B
 * @param {PatternWindow} window
 * @returns {object[]}
 */
export function filterContextsToWindow(contexts, window) {
  return contexts.filter((ctx) => {
    // Check generatedAt
    if (ctx.generatedAt >= window.fromTs && ctx.generatedAt <= window.toTs) return true;
    // Check primary event
    if (ctx.primaryEvent?.timestamp >= window.fromTs && ctx.primaryEvent?.timestamp <= window.toTs) return true;
    // Check any related event
    return (ctx.relatedEvents || []).some(
      (e) => e.timestamp >= window.fromTs && e.timestamp <= window.toTs
    );
  });
}

/**
 * Build multiple windows simultaneously.
 * Returns a Map<windowType, PatternWindow>.
 */
export function buildPatternWindows(windowTypes, now = Date.now()) {
  const result = new Map();
  for (const wt of windowTypes) {
    result.set(wt, buildPatternWindow(wt, now));
  }
  return result;
}

/**
 * Register a new custom window type.
 */
export function registerPatternWindow(windowType, definition) {
  if (WINDOW_DEFINITIONS[windowType]) {
    throw new Error(`[PatternWindowEngine] Window type "${windowType}" already registered.`);
  }
  WINDOW_DEFINITIONS[windowType] = definition;
}
