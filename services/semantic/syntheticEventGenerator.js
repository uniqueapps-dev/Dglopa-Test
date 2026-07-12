/**
 * DGLOPA PLATFORM — SEMANTIC INTELLIGENCE FRAMEWORK
 * syntheticEventGenerator.js — DT-008A (Semantic)
 *
 * Creates derived business events that have no direct row in any
 * operational table — they are computed from aggregates of other events.
 *
 * EXPLAINABILITY CONTRACT:
 *   Every synthetic event MUST include a generatedFrom block:
 *   {
 *     operationalEvents: string[],  — source event IDs that produced this
 *     ruleApplied:       string,    — human-readable rule name
 *     thresholdCrossed:  any,       — the value that triggered generation
 *     aggregateUsed:     string,    — which aggregate was measured
 *   }
 *
 *   Future intelligence engines MUST be able to answer "Why does this
 *   recommendation exist?" by traversing the generatedFrom chain.
 *
 * REPRODUCIBILITY CONTRACT:
 *   Given the same source events and aggregates, this generator always
 *   produces the same synthetic events. Nothing is stored; nothing drifts.
 *
 * Currently delegates milestone generation to milestoneEngine.js.
 * Platform-level synthetics (Review Queue Cleared, etc.) live here.
 */

import {
  IMPORTANCE, STRATEGIC_INTENT, OBLIGATION_TYPE,
  CATEGORY, ENTITY_TYPE, SOURCE_MODULE,
} from './eventConstants.js';
import * as ET from './eventTypes.js';
import { createPlatformEvent } from './eventFactory.js';
import { detectSupplierMilestones, detectDemandMilestones } from './milestoneEngine.js';

// ================================================================
// PLATFORM-LEVEL SYNTHETIC EVENTS
// ================================================================

/**
 * Generate a "Review Queue Cleared" synthetic event when all
 * review items have been resolved and the queue is empty.
 *
 * @param {object[]} reviewItems — all ReviewQueue records
 * @param {number}   now
 * @returns {PlatformEvent|null}
 */
export function generateReviewQueueClearedEvent(reviewItems, now) {
  const pending  = reviewItems.filter((r) => r.status === 'Pending');
  const resolved = reviewItems.filter((r) => r.status !== 'Pending');

  if (reviewItems.length === 0 || pending.length > 0) return null;

  const lastResolved = resolved
    .filter((r) => r.resolvedAt)
    .sort((a, b) => b.resolvedAt - a.resolvedAt)[0];

  if (!lastResolved) return null;

  return createPlatformEvent({
    eventType:       ET.MILESTONE_REVIEW_CLEARED,
    category:        CATEGORY.REVIEW,
    importance:      IMPORTANCE.SUCCESS,
    strategicIntent: STRATEGIC_INTENT.OPERATE,
    obligationType:  OBLIGATION_TYPE.NONE,
    timestamp:       lastResolved.resolvedAt,
    entityType:      ENTITY_TYPE.PLATFORM,
    entityId:        null,
    title:           'Review Queue Cleared',
    description:     `All ${resolved.length} review item${resolved.length !== 1 ? 's' : ''} have been resolved.`,
    sourceModule:    SOURCE_MODULE.SYSTEM,
    metadata: {
      totalResolved: resolved.length,
      lastResolvedAt: lastResolved.resolvedAt,
    },
    synthetic:       true,
    generatedFrom: {
      operationalEvents: resolved.map((r) => r.id),
      ruleApplied:       'All ReviewQueue items have status !== Pending',
      thresholdCrossed:  'pendingCount === 0',
      aggregateUsed:     'ReviewQueue.status',
    },
  });
}

/**
 * Generate all supplier milestone events from pre-computed aggregates.
 * Delegates to milestoneEngine.
 */
export function generateSupplierMilestones(supplierAggregates, now) {
  const events = [];
  for (const agg of supplierAggregates) {
    events.push(...detectSupplierMilestones(agg, now));
  }
  return events;
}

/**
 * Generate all demand repeat milestone events.
 * Delegates to milestoneEngine.
 */
export function generateDemandMilestones(demandFrequencies, now) {
  return detectDemandMilestones(demandFrequencies, now);
}

/**
 * Master synthetic generation function — called by the EventAssembler
 * after the normalisation pass. Receives pre-computed aggregates.
 *
 * @param {object} context — {
 *   supplierAggregates,   // from _computeSupplierAggregates()
 *   demandFrequencies,    // from demand pass
 *   reviewItems,          // raw ReviewQueue records
 *   sourceEventIds,       // map from entityId → [eventId, ...]
 *   now
 * }
 * @returns {PlatformEvent[]}
 */
export function generateSyntheticEvents(context) {
  const { supplierAggregates, demandFrequencies, reviewItems, now } = context;
  const events = [];

  // Supplier milestones
  events.push(...generateSupplierMilestones(supplierAggregates, now));

  // Demand milestones
  events.push(...generateDemandMilestones(demandFrequencies, now));

  // Platform milestone: review queue cleared
  const cleared = generateReviewQueueClearedEvent(reviewItems, now);
  if (cleared) events.push(cleared);

  return events;
}
