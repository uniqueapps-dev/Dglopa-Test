/**
 * DGLOPA PLATFORM — CONTEXT INTELLIGENCE FRAMEWORK
 * confidenceEngine.js — DT-008B
 *
 * Measures evidence quality for a Context object.
 *
 * DESIGN PRINCIPLE: Confidence measures evidence quality, not probability.
 * HIGH does not mean "90% chance this is correct."
 * HIGH means "multiple independent evidence sources corroborate this context."
 *
 * Confidence is determined by:
 *   1. Number of corroborating related events
 *   2. Diversity of relationship types (multiple different relationships = stronger)
 *   3. Consistency of strategic intent across the evidence chain
 *   4. Presence of high-importance events in the chain
 *   5. Freshness of the most recent corroborating event
 *
 * RULES (in order of priority; first matching rule determines confidence):
 *   HIGH   → 3+ corroborating related events with 2+ different relationship types
 *            AND at least one CRITICAL or multiple WARNING importance events
 *   HIGH   → 5+ corroborating related events of any type
 *   MEDIUM → 2+ corroborating related events
 *   MEDIUM → 1 related event with CRITICAL importance
 *   LOW    → single isolated evidence source
 *   LOW    → no related events
 */

import { CONFIDENCE } from './contextConstants.js';
import { IMPORTANCE } from '../semantic/eventConstants.js';

// ================================================================
// CONFIDENCE SCORING
// ================================================================

/**
 * Classify the confidence of a context given its evidence.
 *
 * @param {object} evidence
 *   relatedEvents:     PlatformEvent[]         — events corroborating the context
 *   relationships:     DiscoveredRelationship[] — discovered relationships
 *   primaryEvent:      PlatformEvent
 * @returns {{ confidence: string, explanation: string, score: number }}
 */
export function classifyConfidence({ relatedEvents = [], relationships = [], primaryEvent }) {
  const relCount         = relatedEvents.length;
  const relTypes         = new Set(relationships.map((r) => r.relationshipType));
  const importanceLevels = [primaryEvent, ...relatedEvents].map((e) => e.importance);
  const hasCritical      = importanceLevels.includes(IMPORTANCE.CRITICAL);
  const warningCount     = importanceLevels.filter((i) => i === IMPORTANCE.WARNING).length;

  // Compute a numeric score 0..1 for ranking purposes (not exposed as confidence)
  const score = Math.min(1,
    (relCount * 0.15) +
    (relTypes.size * 0.1) +
    (hasCritical ? 0.3 : 0) +
    (warningCount * 0.05)
  );

  // ---- Rule evaluation ----
  if (relCount >= 3 && relTypes.size >= 2 && (hasCritical || warningCount >= 2)) {
    return { confidence: CONFIDENCE.HIGH, explanation: 'Multiple independent corroborating evidence sources with diverse relationship types and significant importance signals.', score };
  }
  if (relCount >= 5) {
    return { confidence: CONFIDENCE.HIGH, explanation: 'Five or more corroborating related events.', score };
  }
  if (relCount >= 2) {
    return { confidence: CONFIDENCE.MEDIUM, explanation: 'Multiple corroborating related events.', score };
  }
  if (relCount === 1 && hasCritical) {
    return { confidence: CONFIDENCE.MEDIUM, explanation: 'Single corroborating event with critical importance.', score };
  }
  return { confidence: CONFIDENCE.LOW, explanation: relCount === 0 ? 'No corroborating evidence — isolated signal.' : 'Single corroborating event with low or medium importance.', score };
}

/**
 * Assess confidence for a relationship chain (multi-hop evidence).
 * A longer chain with consistent strategic intent is stronger evidence.
 *
 * @param {PlatformEvent[]} chainEvents — events in the chain, ordered
 * @returns {{ confidence: string, explanation: string }}
 */
export function assessChainConfidence(chainEvents) {
  if (chainEvents.length === 0) {
    return { confidence: CONFIDENCE.LOW, explanation: 'Empty event chain.' };
  }
  if (chainEvents.length === 1) {
    return { confidence: CONFIDENCE.LOW, explanation: 'Single-event chain — no causal path.' };
  }

  const intents = chainEvents.map((e) => e.strategicIntent);
  const uniqueIntents = new Set(intents);

  // Consistent strategic intent across the chain strengthens confidence
  const intentConsistency = uniqueIntents.size === 1 ? 1.0 : (1 / uniqueIntents.size);
  const lengthBonus       = Math.min(0.4, chainEvents.length * 0.1);
  const hasCritical       = chainEvents.some((e) => e.importance === IMPORTANCE.CRITICAL);

  const score = intentConsistency * 0.4 + lengthBonus + (hasCritical ? 0.3 : 0);

  if (score >= 0.7) return { confidence: CONFIDENCE.HIGH,   explanation: `Strong causal chain: ${chainEvents.length} events with consistent intent and critical signals.` };
  if (score >= 0.4) return { confidence: CONFIDENCE.MEDIUM, explanation: `Moderate causal chain: ${chainEvents.length} events with mixed signals.` };
  return             { confidence: CONFIDENCE.LOW,    explanation: `Weak causal chain: ${chainEvents.length} events with inconsistent signals.` };
}
