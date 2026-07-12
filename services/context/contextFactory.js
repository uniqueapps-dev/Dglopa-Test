/**
 * DGLOPA PLATFORM — CONTEXT INTELLIGENCE FRAMEWORK
 * contextFactory.js — DT-008B
 *
 * Creates immutable Context objects.
 *
 * PLATFORM RULES (mirroring DT-008A EventFactory):
 *   - Context objects are immutable (Object.freeze)
 *   - Consumers may not mutate Context objects
 *   - enrichContext() creates a new frozen copy with additional fields
 *
 * Every Context object carries a complete provenance record:
 *   - The primary event it was derived from
 *   - All related events discovered by the Relationship Engine
 *   - The complete relationship chain
 *   - The context window it was computed within
 *   - The supporting evidence that determined confidence
 *   - The generatedAt timestamp for auditability
 */

import { CONTEXT_VERSION, FRAMEWORK_VERSION } from './contextConstants.js';

let _seq = 0;

/**
 * Create an immutable Context object.
 *
 * @param {object} parts
 * @returns {Context} — frozen
 */
export function createContext({
  contextType,
  confidence,
  primaryEvent,
  relatedEvents       = [],
  relationshipChain,
  contextWindow,
  contextSummary,
  supportingEvidence  = [],
  metadata            = {},
}) {
  if (!contextType)     throw new Error('[ContextFactory] contextType is required.');
  if (!confidence)      throw new Error('[ContextFactory] confidence is required.');
  if (!primaryEvent)    throw new Error('[ContextFactory] primaryEvent is required.');
  if (!contextSummary)  throw new Error('[ContextFactory] contextSummary is required.');

  return Object.freeze({
    contextId:          `CTX-${Date.now()}-${(++_seq).toString().padStart(5, '0')}`,
    contextVersion:     CONTEXT_VERSION,
    contextType,
    confidence,
    primaryEvent:       Object.freeze(primaryEvent),
    relatedEvents:      Object.freeze([...relatedEvents]),
    relationshipChain:  relationshipChain ? Object.freeze(relationshipChain) : null,
    contextWindow:      contextWindow     ? Object.freeze(contextWindow)     : null,
    contextSummary,
    supportingEvidence: Object.freeze([...supportingEvidence]),
    generatedAt:        Date.now(),
    metadata:           Object.freeze({ ...metadata }),
    _frameworkVersion:  FRAMEWORK_VERSION,
  });
}

/**
 * Create an enriched copy of a Context without mutating the original.
 * Used by consumers that need to add presentation fields.
 */
export function enrichContext(context, enrichment) {
  return Object.freeze({ ...context, ...enrichment });
}

/**
 * Create a DiscoveredRelationship object.
 */
export function createRelationship({
  fromEventId,
  toEventId,
  relationshipType,
  label,
  strength = 1.0,
}) {
  return Object.freeze({
    relationshipId:  `REL-${Date.now()}-${(++_seq).toString().padStart(5, '0')}`,
    fromEventId,
    toEventId,
    relationshipType,
    label,
    strength: Math.max(0, Math.min(1, strength)),
  });
}

/**
 * Create a RelationshipChain from an ordered list of discovered relationships.
 */
export function createChain(primaryEventId, links, narrative) {
  const allIds = new Set([primaryEventId]);
  for (const link of links) { allIds.add(link.fromEventId); allIds.add(link.toEventId); }
  return Object.freeze({
    chainId:       `CHN-${Date.now()}-${(++_seq).toString().padStart(5, '0')}`,
    primaryEventId,
    links:         Object.freeze([...links]),
    eventSequence: Object.freeze([...allIds]),
    narrative,
  });
}

/**
 * Create a ContextWindow.
 */
export function createWindow(windowType, fromTs, toTs, events = [], entityId = null) {
  return Object.freeze({
    windowType,
    entityId,
    fromTs,
    toTs,
    events: Object.freeze([...events]),
  });
}

/**
 * Create a SupportingEvidence entry.
 */
export function createEvidence(evidenceType, description, value = null, eventId = null) {
  return Object.freeze({ evidenceType, description, value, eventId });
}

/**
 * Reset sequence counter (tests only).
 */
export function _resetSeq() { _seq = 0; }
