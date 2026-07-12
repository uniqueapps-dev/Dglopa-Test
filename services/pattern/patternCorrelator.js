/**
 * DGLOPA PLATFORM — PATTERN INTELLIGENCE FRAMEWORK
 * patternCorrelator.js — DT-008C
 *
 * The primary entry point. Correlates ContextGraph[] into a PatternGraph.
 *
 * PatternGraph becomes the primary input for Commercial Intelligence.
 *
 * ALGORITHM:
 *   1. Flatten all Context objects from all ContextGraphs
 *   2. Build a PatternWindow for the requested window type
 *   3. Run the Pattern Engine's discoverPatterns() — single pass
 *   4. Discover pattern relationships (REPEATS, AMPLIFIES, etc.)
 *   5. Build and return a PatternGraph
 *
 * No scoring. No recommendations. No AI.
 * The correlator discovers and packages. Commercial Intelligence consumes.
 */

import { discoverPatterns }                            from './patternEngine.js';
import { buildPatternWindow, filterContextsToWindow }  from './patternWindowEngine.js';
import { createPatternRelationship, createPatternGraph } from './patternFactory.js';
import { PATTERN_WINDOW, PATTERN_RELATIONSHIP, PATTERN_STRENGTH, PATTERN_TYPE } from './patternConstants.js';

// ================================================================
// PUBLIC ENTRY POINT
// ================================================================

/**
 * Correlate ContextGraph objects into a PatternGraph.
 *
 * @param {object[]} contextGraphs  — ContextGraph[] from DT-008B correlate()
 * @param {object}   options
 *   windowType:  PATTERN_WINDOW value (default: ROLLING_30)
 *   now:         number (default: Date.now())
 * @returns {PatternGraph}
 */
export function correlatePatterns(contextGraphs, {
  windowType = PATTERN_WINDOW.ROLLING_30,
  now        = Date.now(),
} = {}) {
  // ---- Flatten all contexts from all graphs ----
  const allContexts = contextGraphs.flatMap((g) => g.contexts || []);

  // ---- Build the analysis window ----
  let window;
  try {
    window = buildPatternWindow(windowType, now);
  } catch {
    // Custom window fallback — use full span of context data
    const timestamps = allContexts.map((c) => c.generatedAt).filter(Boolean);
    const from = timestamps.length ? Math.min(...timestamps) : now - 30 * 86400000;
    window = { windowType: PATTERN_WINDOW.CUSTOM, fromTs: from, toTs: now, durationMs: now - from, label: 'Custom window' };
  }

  // ---- Filter contexts to window ----
  const windowContexts = filterContextsToWindow(allContexts, window);

  // ---- Discover patterns (single analysis pass) ----
  const patterns = discoverPatterns(windowContexts, window, now);

  // ---- Discover pattern relationships ----
  const relationships = _discoverPatternRelationships(patterns);

  // ---- Build PatternGraph ----
  return createPatternGraph(patterns, relationships, allContexts.length, now);
}

// ================================================================
// PATTERN RELATIONSHIP DISCOVERY
// ================================================================

/**
 * Discover relationships between discovered patterns.
 * Returns PatternRelationship[] based on well-known pattern interaction rules.
 */
function _discoverPatternRelationships(patterns) {
  const relationships = [];
  const byType = new Map();
  for (const p of patterns) {
    byType.set(p.patternType, p);
  }

  // REPEATED_STOCKOUT + REPEATED_DEMAND → AMPLIFIES
  const stockout = byType.get(PATTERN_TYPE.REPEATED_STOCKOUT);
  const demand   = byType.get(PATTERN_TYPE.REPEATED_DEMAND);
  if (stockout && demand) {
    relationships.push(createPatternRelationship({
      fromPatternId:   stockout.patternId,
      toPatternId:     demand.patternId,
      relationshipType: PATTERN_RELATIONSHIP.AMPLIFIES,
      label:           'Repeated stockouts amplify repeated unmet demand.',
    }));
  }

  // SUPPLIER_DELAY + REPEATED_STOCKOUT → PRECEDES
  const delay = byType.get(PATTERN_TYPE.SUPPLIER_DELAY);
  if (delay && stockout) {
    relationships.push(createPatternRelationship({
      fromPatternId:   delay.patternId,
      toPatternId:     stockout.patternId,
      relationshipType: PATTERN_RELATIONSHIP.PRECEDES,
      label:           'Supplier delays typically precede repeated stock-outs.',
    }));
  }

  // EXPIRY_LOSS + DEAD_STOCK → COEXISTS_WITH
  const expiry   = byType.get(PATTERN_TYPE.EXPIRY_LOSS);
  const deadStock = byType.get(PATTERN_TYPE.DEAD_STOCK);
  if (expiry && deadStock) {
    relationships.push(createPatternRelationship({
      fromPatternId:   expiry.patternId,
      toPatternId:     deadStock.patternId,
      relationshipType: PATTERN_RELATIONSHIP.COEXISTS_WITH,
      label:           'Expiry loss and dead stock frequently coexist as capital waste signals.',
    }));
  }

  // PURCHASE_GROWTH + SUPPLIER_RELIABILITY → REINFORCES
  const growth      = byType.get(PATTERN_TYPE.PURCHASE_GROWTH);
  const reliability = byType.get(PATTERN_TYPE.SUPPLIER_RELIABILITY);
  if (growth && reliability) {
    relationships.push(createPatternRelationship({
      fromPatternId:   reliability.patternId,
      toPatternId:     growth.patternId,
      relationshipType: PATTERN_RELATIONSHIP.REINFORCES,
      label:           'Supplier reliability reinforces purchase growth.',
    }));
  }

  // REVIEW_QUEUE_CONGESTION + SUPPLIER_DELAY → FOLLOWS
  const congestion = byType.get(PATTERN_TYPE.REVIEW_QUEUE_CONGESTION);
  if (congestion && delay) {
    relationships.push(createPatternRelationship({
      fromPatternId:   congestion.patternId,
      toPatternId:     delay.patternId,
      relationshipType: PATTERN_RELATIONSHIP.FOLLOWS,
      label:           'Review queue congestion often follows supplier or operational disruptions.',
    }));
  }

  // VERY_HIGH strength patterns → ESCALATES against lower strength peers
  for (const p of patterns) {
    if (p.patternStrength === PATTERN_STRENGTH.VERY_HIGH) {
      for (const peer of patterns) {
        if (peer.patternId !== p.patternId &&
            peer.patternType === p.patternType &&
            [PATTERN_STRENGTH.LOW, PATTERN_STRENGTH.MEDIUM].includes(peer.patternStrength)) {
          relationships.push(createPatternRelationship({
            fromPatternId:    p.patternId,
            toPatternId:      peer.patternId,
            relationshipType: PATTERN_RELATIONSHIP.ESCALATES,
            label:            `${p.patternType} is escalating.`,
          }));
        }
      }
    }
  }

  return relationships;
}
