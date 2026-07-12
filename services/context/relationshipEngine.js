/**
 * DGLOPA PLATFORM — CONTEXT INTELLIGENCE FRAMEWORK
 * relationshipEngine.js — DT-008B
 *
 * Discovers direct relationships between PlatformEvents using the
 * RelationshipRegistry. No analytics, no scoring, no recommendations.
 *
 * DESIGN PRINCIPLE: The engine discovers; it does not interpret.
 * Interpretation is the Context Engine's responsibility.
 *
 * Algorithm:
 *   For each primary event:
 *     Get all relationship definitions where fromType matches.
 *     For each definition:
 *       Scan the event array for candidates where toType matches.
 *       Apply the time-window constraint (maxWindowMs).
 *       Apply the matchPredicate.
 *       If match → create a DiscoveredRelationship.
 *
 * Time complexity: O(n × d × n) where n = event count, d = relationship
 * definitions per event type (typically 1–5). For the pharmacy's scale
 * (hundreds to low thousands of events per entity scope), this is fast.
 */

import { getRelationshipsFrom, getRelationshipsTo } from './relationshipRegistry.js';
import { createRelationship }                        from './contextFactory.js';

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Find all events that the given event causes or relates to.
 *
 * @param {PlatformEvent}   primaryEvent
 * @param {PlatformEvent[]} allEvents
 * @returns {DiscoveredRelationship[]}
 */
export function discoverChildren(primaryEvent, allEvents) {
  const defs = getRelationshipsFrom(primaryEvent.eventType);
  const results = [];

  for (const def of defs) {
    for (const candidate of allEvents) {
      if (candidate.eventId === primaryEvent.eventId) continue;
      if (candidate.eventType !== def.toType) continue;
      if (!_withinWindow(primaryEvent, candidate, def.maxWindowMs)) continue;
      if (!def.matchPredicate(primaryEvent, candidate)) continue;

      results.push(createRelationship({
        fromEventId:      primaryEvent.eventId,
        toEventId:        candidate.eventId,
        relationshipType: def.relationship,
        label:            def.label,
        strength:         def.strength,
      }));
    }
  }

  return results;
}

/**
 * Find all events that caused or relate to the given event.
 *
 * @param {PlatformEvent}   primaryEvent
 * @param {PlatformEvent[]} allEvents
 * @returns {DiscoveredRelationship[]}
 */
export function discoverParents(primaryEvent, allEvents) {
  const defs = getRelationshipsTo(primaryEvent.eventType);
  const results = [];

  for (const def of defs) {
    for (const candidate of allEvents) {
      if (candidate.eventId === primaryEvent.eventId) continue;
      if (candidate.eventType !== def.fromType) continue;
      if (!_withinWindow(candidate, primaryEvent, def.maxWindowMs)) continue;
      if (!def.matchPredicate(candidate, primaryEvent)) continue;

      results.push(createRelationship({
        fromEventId:      candidate.eventId,
        toEventId:        primaryEvent.eventId,
        relationshipType: def.relationship,
        label:            def.label,
        strength:         def.strength,
      }));
    }
  }

  return results;
}

/**
 * Build a full relationship chain starting from a primary event,
 * traversing child relationships up to maxDepth levels deep.
 *
 * @param {PlatformEvent}   rootEvent
 * @param {PlatformEvent[]} allEvents
 * @param {number}          maxDepth  — default 4
 * @returns {{ links: DiscoveredRelationship[], eventIds: Set<string> }}
 */
export function traverseChain(rootEvent, allEvents, maxDepth = 4) {
  const links    = [];
  const visited  = new Set([rootEvent.eventId]);
  const queue    = [{ event: rootEvent, depth: 0 }];

  while (queue.length > 0) {
    const { event, depth } = queue.shift();
    if (depth >= maxDepth) continue;

    const children = discoverChildren(event, allEvents);
    for (const rel of children) {
      if (visited.has(rel.toEventId)) continue;
      visited.add(rel.toEventId);
      links.push(rel);
      const childEvent = allEvents.find((e) => e.eventId === rel.toEventId);
      if (childEvent) queue.push({ event: childEvent, depth: depth + 1 });
    }
  }

  return { links, eventIds: visited };
}

/**
 * Find all events related (in any direction) to a given event.
 * Combines discoverParents and discoverChildren.
 *
 * @param {PlatformEvent}   primaryEvent
 * @param {PlatformEvent[]} allEvents
 * @returns {{ parents: DiscoveredRelationship[], children: DiscoveredRelationship[] }}
 */
export function discoverRelated(primaryEvent, allEvents) {
  return {
    parents:  discoverParents(primaryEvent, allEvents),
    children: discoverChildren(primaryEvent, allEvents),
  };
}

// ================================================================
// HELPERS
// ================================================================

function _withinWindow(from, to, maxWindowMs) {
  if (maxWindowMs == null) return true;
  // from must precede to (or be simultaneous); gap must be ≤ maxWindowMs
  const gap = to.timestamp - from.timestamp;
  return gap >= 0 && gap <= maxWindowMs;
}
