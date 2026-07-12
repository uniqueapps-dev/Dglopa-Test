/**
 * DGLOPA PLATFORM — COCKPIT FOUNDATION
 * cockpitTypes.js — DT-009
 *
 * JSDoc type definitions. Runtime no-op — documentation only.
 *
 * Traceability chain (ADR-059):
 *   InsightCard → Pattern → Context → PlatformEvent → OperationalRecord
 *
 * Every InsightCard traces back through this chain.
 * The Cockpit never fabricates explanations.
 */

/**
 * @typedef {object} AttentionItem
 * @property {string}   attentionId
 * @property {string}   category        — ATTENTION_CATEGORY value
 * @property {string}   title
 * @property {string}   body            — one sentence explaining why
 * @property {number}   count           — number of items in this attention group
 * @property {string}   screen          — target screen for navigation (or null)
 * @property {string}   importance      — IMPORTANCE value from semantic layer
 * @property {string}   strategicIntent — STRATEGIC_INTENT value
 * @property {string}   [patternId]     — source Pattern ID for traceability
 * @property {string}   [contextId]     — source Context ID for traceability
 */

/**
 * @typedef {object} InsightCard
 * @property {string}   cardId
 * @property {string}   cardType        — CARD_TYPE value
 * @property {string}   title
 * @property {string}   summary         — 1-2 sentence operational insight
 * @property {string}   whyItMatters    — plain-language explanation of business significance
 * @property {string[]} supportingEvidence — evidence strings from the originating Pattern
 * @property {string}   patternType     — PATTERN_TYPE value
 * @property {string}   patternStrength — PATTERN_STRENGTH value
 * @property {string}   evolution       — PATTERN_EVOLUTION value
 * @property {string}   confidence      — CONFIDENCE value
 * @property {string}   patternId       — source Pattern ID (traceability)
 * @property {string}   contextId       — source Context ID (traceability)
 * @property {string[]} eventIds        — source Event IDs (traceability)
 */

/**
 * @typedef {object} FeedEvent
 * @property {string}   feedId
 * @property {string}   eventId
 * @property {string}   eventType
 * @property {string}   title
 * @property {string}   description
 * @property {number}   timestamp
 * @property {string}   importance
 * @property {string}   strategicIntent
 * @property {string}   sourceModule
 * @property {boolean}  synthetic
 */

/**
 * @typedef {object} FeedGroup
 * @property {string}      label   — FEED_GROUP value
 * @property {FeedEvent[]} events
 */

/**
 * @typedef {object} QuickAction
 * @property {string}   actionId
 * @property {string}   label
 * @property {string}   screen       — target screen ID
 * @property {string}   icon         — SVG path string
 * @property {string}   badge        — optional badge text (count)
 */

/**
 * @typedef {object} BusinessSnapshot
 * @property {number} totalOpen        — open review items
 * @property {number} critical         — critical importance events (recent)
 * @property {number} highPatterns     — HIGH+ strength patterns
 * @property {number} emergingPatterns — EMERGING evolution patterns
 * @property {number} activityToday    — events generated today
 */

/**
 * @typedef {object} CockpitPayload
 * @property {object}          welcome
 * @property {BusinessSnapshot} snapshot
 * @property {AttentionItem[]} attention
 * @property {InsightCard[]}   insights
 * @property {FeedGroup[]}     feedGroups
 * @property {QuickAction[]}   quickActions
 * @property {number}          generatedAt
 */

export const _TYPES_ONLY = true;
