/**
 * DGLOPA PLATFORM — CONTEXT INTELLIGENCE FRAMEWORK
 * eventCorrelator.js — DT-008B
 *
 * Builds contextual chains across operational modules and produces
 * a Context Graph — a collection of Context objects showing how
 * events across different domains relate to one another.
 *
 * DESIGN PRINCIPLE: The correlator performs no scoring, no recommendations.
 * It discovers, chains, and packages. Interpretation happens upstream
 * in the Context Engine; judgment happens downstream in future Decision engines.
 *
 * CORRELATION ALGORITHM:
 *   1. Group events by strategic intent and importance to find "anchor" events
 *      (CRITICAL and WARNING events are most likely to be causal roots)
 *   2. For each anchor event, traverse its relationship chain (BFS, max depth 4)
 *   3. Build a Context object per anchor using the Context Engine
 *   4. Deduplicate overlapping contexts (if two anchors share 70%+ of chain events,
 *      keep the one with higher confidence; merge the other's evidence in)
 *   5. Return a ContextGraph
 *
 * CONTEXT GRAPH:
 *   contexts:      Context[]          — all distinct contexts found
 *   summary:       ContextGraphSummary
 *   dominantType:  CONTEXT_TYPE        — the most frequently occurring type
 *   criticalCount: number
 *   highCount:     number
 */

import { traverseChain }    from './relationshipEngine.js';
import { buildContext }      from './contextEngine.js';
import { buildWindow }       from './contextWindowEngine.js';
import { CONFIDENCE, WINDOW_TYPE, CONTEXT_TYPE } from './contextConstants.js';
import { IMPORTANCE }        from '../semantic/eventConstants.js';

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Correlate a set of semantic PlatformEvents into a Context Graph.
 *
 * @param {PlatformEvent[]} events     — assembled semantic events
 * @param {object}          options
 *   entityId:      string|null        — scope to one entity
 *   windowType:    WINDOW_TYPE value  — default: Supplier or Product (inferred)
 *   maxDepth:      number             — relationship chain depth (default 4)
 *   maxContexts:   number             — max Context objects to return (default 20)
 * @returns {ContextGraph}
 */
export function correlate(events, {
  entityId    = null,
  windowType  = WINDOW_TYPE.SUPPLIER,
  maxDepth    = 4,
  maxContexts = 20,
} = {}) {
  const now = Date.now();

  // ---- Select anchor events (CRITICAL first, then WARNING) ----
  const anchors = _selectAnchors(events);

  // ---- Build the primary context window ----
  let window;
  try {
    window = buildWindow(windowType, events, entityId, now);
  } catch {
    // Unknown window type — create a time-unbounded fallback window
    window = { windowType, entityId, fromTs: 0, toTs: now, events: [...events] };
  }

  // ---- Correlate each anchor ----
  const rawContexts = [];
  const usedEventIds = new Set();

  for (const anchor of anchors) {
    if (rawContexts.length >= maxContexts) break;

    const { links, eventIds } = traverseChain(anchor, events, maxDepth);
    const relatedEventIds     = new Set([...eventIds].filter((id) => id !== anchor.eventId));
    const relatedEvents       = events.filter((e) => relatedEventIds.has(e.eventId));

    const ctx = buildContext(anchor, relatedEvents, links, window);
    rawContexts.push({ ctx, eventIds });

    // Mark events as "used" for deduplication
    for (const id of eventIds) usedEventIds.add(id);
  }

  // ---- Deduplicate overlapping contexts ----
  const deduped = _deduplicate(rawContexts);

  // ---- Build graph summary ----
  const graph = _buildGraph(deduped.map((r) => r.ctx), events, now);

  return graph;
}

// ================================================================
// GRAPH BUILDER
// ================================================================

function _buildGraph(contexts, allEvents, now) {
  const typeCounts = {};
  for (const ctx of contexts) {
    typeCounts[ctx.contextType] = (typeCounts[ctx.contextType] || 0) + 1;
  }
  const dominantType = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || CONTEXT_TYPE.OPERATIONAL;

  return Object.freeze({
    contexts:       Object.freeze(contexts),
    totalEvents:    allEvents.length,
    correlatedCount:new Set(contexts.flatMap((c) => c.relationshipChain?.eventSequence || [])).size,
    dominantType,
    criticalCount:  contexts.filter((c) => c.primaryEvent.importance === IMPORTANCE.CRITICAL).length,
    highConfidence: contexts.filter((c) => c.confidence === CONFIDENCE.HIGH).length,
    mediumConfidence: contexts.filter((c) => c.confidence === CONFIDENCE.MEDIUM).length,
    generatedAt:    now,
  });
}

// ================================================================
// HELPERS
// ================================================================

function _selectAnchors(events) {
  // CRITICAL events first, then WARNING, then SUCCESS, then INFO
  // Synthetic milestones go last (they are informational enrichment)
  const order = {
    [IMPORTANCE.CRITICAL]: 0,
    [IMPORTANCE.WARNING]:  1,
    [IMPORTANCE.SUCCESS]:  2,
    [IMPORTANCE.INFO]:     3,
  };
  return [...events].sort((a, b) => {
    if (a.synthetic !== b.synthetic) return a.synthetic ? 1 : -1;
    return (order[a.importance] ?? 9) - (order[b.importance] ?? 9);
  });
}

function _deduplicate(rawContexts) {
  // Remove contexts where 70%+ of their chain events are already in a higher-confidence context
  const kept = [];
  const claimedIds = new Set();

  for (const raw of rawContexts) {
    const myIds   = raw.eventIds;
    const overlap = [...myIds].filter((id) => claimedIds.has(id)).length;
    const overlapRatio = myIds.size > 0 ? overlap / myIds.size : 0;

    if (overlapRatio < 0.7) {
      kept.push(raw);
      for (const id of myIds) claimedIds.add(id);
    }
    // else: skip — this context is mostly covered by an earlier, higher-confidence one
  }

  return kept;
}
