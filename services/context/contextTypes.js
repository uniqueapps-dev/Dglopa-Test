/**
 * DGLOPA PLATFORM — CONTEXT INTELLIGENCE FRAMEWORK
 * contextTypes.js — DT-008B
 *
 * JSDoc type definitions for all Context Intelligence Framework objects.
 * Import these for IDE type-checking and documentation — they have no
 * runtime overhead (JSDoc only).
 *
 * @typedef {import('../semantic/eventConstants.js').PlatformEvent} PlatformEvent
 */

/**
 * @typedef {object} RelationshipDefinition
 * @property {string}   fromType        — the eventType of the source event
 * @property {string}   toType          — the eventType of the target event
 * @property {string}   relationshipType — RELATIONSHIP_TYPE value
 * @property {string}   label           — human-readable description of the relationship
 * @property {function} matchPredicate  — (fromEvent, toEvent) => boolean — additional match conditions
 * @property {number}   maxWindowMs     — max time gap between events for this relationship to apply (null = no limit)
 */

/**
 * @typedef {object} DiscoveredRelationship
 * @property {string} relationshipId
 * @property {string} fromEventId
 * @property {string} toEventId
 * @property {string} relationshipType
 * @property {string} label
 * @property {number} strength          — 0..1 — how closely the events match
 */

/**
 * @typedef {object} RelationshipChain
 * @property {string}                  chainId
 * @property {string}                  primaryEventId
 * @property {DiscoveredRelationship[]} links
 * @property {string[]}                eventSequence  — ordered event IDs from root to leaf
 * @property {string}                  narrative      — plain-language description of the chain
 */

/**
 * @typedef {object} ContextWindow
 * @property {string}         windowType
 * @property {string|null}    entityId       — entity this window is scoped to (supplierId, productId, etc.)
 * @property {number}         fromTs
 * @property {number}         toTs
 * @property {PlatformEvent[]} events        — events within this window
 */

/**
 * @typedef {object} SupportingEvidence
 * @property {string}         evidenceType   — 'event' | 'aggregate' | 'pattern'
 * @property {string}         description
 * @property {string|null}    eventId
 * @property {any}            value          — the raw evidence value (count, amount, etc.)
 */

/**
 * @typedef {object} Context
 * @property {string}                contextId
 * @property {string}                contextVersion
 * @property {string}                contextType    — CONTEXT_TYPE value
 * @property {string}                confidence     — CONFIDENCE value
 * @property {PlatformEvent}         primaryEvent
 * @property {PlatformEvent[]}       relatedEvents
 * @property {RelationshipChain}     relationshipChain
 * @property {ContextWindow}         contextWindow
 * @property {string}                contextSummary — human-readable business understanding
 * @property {SupportingEvidence[]}  supportingEvidence
 * @property {number}                generatedAt
 * @property {object}                metadata
 */

// No runtime exports — this file is type documentation only.
// Re-export the main types for any consumer that wants them as JSDoc.
export const _TYPES_ONLY = true;
