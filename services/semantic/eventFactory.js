/**
 * DGLOPA PLATFORM — SEMANTIC INTELLIGENCE FRAMEWORK
 * eventFactory.js — DT-008A (Semantic)
 *
 * Creates immutable PlatformEvents. Every field is explicit.
 * No defaults that collapse semantic meaning.
 *
 * PLATFORM EVENT RULES (from spec):
 *   - Events are immutable (Object.freeze)
 *   - Consumers may enrich events (via enrichEvent)
 *   - Consumers must NEVER mutate events
 *
 * The factory enforces the three-dimensional semantic model:
 *   importance       — how urgent
 *   strategicIntent  — why it matters
 *   obligationType   — nature of commitment
 *
 * These are orthogonal. Setting one never implies the others.
 */

import {
  IMPORTANCE, STRATEGIC_INTENT, OBLIGATION_TYPE,
  FRAMEWORK_VERSION, EVENT_VERSION,
} from './eventConstants.js';

let _seq = 0;

/**
 * Create an immutable PlatformEvent.
 *
 * All three semantic dimensions must be provided explicitly.
 * The factory throws on missing required fields to prevent silent
 * semantic degradation.
 *
 * @param {object} parts
 * @returns {PlatformEvent} — frozen object
 */
export function createPlatformEvent({
  eventType,
  category,
  timestamp,
  entityType,
  entityId        = null,
  title,
  description,
  sourceModule,
  importance,
  strategicIntent,
  obligationType,
  relatedEntities = [],
  metadata        = {},
  evidence        = null,
  synthetic       = false,
  generatedFrom   = null,  // explainability chain for synthetic events
}) {
  // ---- Required field enforcement ----
  if (!eventType)       throw new Error('[EventFactory] eventType is required.');
  if (!category)        throw new Error('[EventFactory] category is required.');
  if (!title)           throw new Error('[EventFactory] title is required.');
  if (!description)     throw new Error('[EventFactory] description is required.');
  if (!sourceModule)    throw new Error('[EventFactory] sourceModule is required.');

  // ---- Semantic dimension enforcement ----
  if (!importance || !Object.values(IMPORTANCE).includes(importance)) {
    throw new Error(`[EventFactory] importance must be one of: ${Object.values(IMPORTANCE).join(', ')}. Got: ${importance}`);
  }
  if (!strategicIntent || !Object.values(STRATEGIC_INTENT).includes(strategicIntent)) {
    throw new Error(`[EventFactory] strategicIntent must be one of: ${Object.values(STRATEGIC_INTENT).join(', ')}. Got: ${strategicIntent}`);
  }
  if (!obligationType || !Object.values(OBLIGATION_TYPE).includes(obligationType)) {
    throw new Error(`[EventFactory] obligationType must be one of: ${Object.values(OBLIGATION_TYPE).join(', ')}. Got: ${obligationType}`);
  }

  return Object.freeze({
    // Identity
    eventId:         `EVT2-${Date.now()}-${(++_seq).toString().padStart(6, '0')}`,
    eventVersion:    EVENT_VERSION,
    eventType,
    // Temporal
    timestamp:       timestamp ?? Date.now(),
    // Domain
    category,
    entityType,
    entityId,
    // Narrative
    title,
    description,
    sourceModule,
    // Three orthogonal semantic dimensions
    importance,
    strategicIntent,
    obligationType,
    // Relationships
    relatedEntities: Object.freeze([...relatedEntities]),
    // Payload
    metadata:        Object.freeze({ ...metadata }),
    evidence,
    // Provenance
    synthetic,
    generatedFrom:   generatedFrom ? Object.freeze(generatedFrom) : null,
    // Framework
    _frameworkVersion: FRAMEWORK_VERSION,
  });
}

/**
 * Create an enriched copy of an event without mutating the original.
 * Used by consumers that need to add presentation-layer fields
 * (e.g. a computed colour, a formatted date string) without touching
 * the semantic payload.
 *
 * @param {PlatformEvent} event
 * @param {object}        enrichment — fields to add/override
 * @returns {PlatformEvent} — new frozen object
 */
export function enrichEvent(event, enrichment) {
  return Object.freeze({ ...event, ...enrichment });
}

/**
 * Assert that an object is a valid PlatformEvent (duck-type check).
 * Useful for testing and gateway validation.
 */
export function isPlatformEvent(obj) {
  return (
    obj &&
    typeof obj.eventId       === 'string' &&
    typeof obj.eventType     === 'string' &&
    typeof obj.importance    === 'string' &&
    typeof obj.strategicIntent === 'string' &&
    typeof obj.obligationType  === 'string' &&
    typeof obj.timestamp     === 'number' &&
    typeof obj.synthetic     === 'boolean'
  );
}

/**
 * Reset the sequence counter (use in tests only).
 */
export function _resetSeq() { _seq = 0; }
