/**
 * DGLOPA PLATFORM — COCKPIT FOUNDATION
 * cockpitConstants.js — DT-009
 *
 * Controlled vocabularies for the Cockpit presentation layer.
 * These describe PRESENTATION concerns — not business semantics.
 *
 * ADR-059: The Cockpit consumes understanding, never recreates it.
 * ADR-060: Attention precedes information.
 */

// ================================================================
// ATTENTION CATEGORIES
// "What kind of attention does this require?"
// ================================================================
export const ATTENTION_CATEGORY = Object.freeze({
  CRITICAL:    'Critical',      // requires immediate action — MANDATORY obligation
  OPERATIONAL: 'Operational',   // standard operational work requiring attention
  GROWTH:      'GrowthOpportunity',  // revenue or relationship opportunity (GROW intent)
  LEARNING:    'LearningSignal',     // data quality or knowledge enrichment (LEARN intent)
});

// ================================================================
// INSIGHT CARD TYPES
// "What kind of insight does this card represent?"
// ================================================================
export const CARD_TYPE = Object.freeze({
  PATTERN_ALERT:   'PatternAlert',    // a detected pattern requiring attention
  CONTEXT_SUMMARY: 'ContextSummary',  // a contextual business situation summary
  ACTIVITY_DIGEST: 'ActivityDigest',  // a grouped activity summary
  MILESTONE:       'Milestone',       // a synthetic milestone achievement
});

// ================================================================
// FEED GROUP LABELS
// ================================================================
export const FEED_GROUP = Object.freeze({
  TODAY:         'Today',
  YESTERDAY:     'Yesterday',
  THIS_WEEK:     'Earlier This Week',
  THIS_MONTH:    'Earlier This Month',
  OLDER:         'Older',
});

// ================================================================
// QUICK ACTION TYPES
// ================================================================
export const ACTION_TYPE = Object.freeze({
  NAVIGATE:   'Navigate',  // navigates to a platform screen
});

// ================================================================
// PRESENTATION LAYOUT
// ================================================================
export const SECTION_ORDER = Object.freeze([
  'welcome',
  'snapshot',
  'attention',
  'insights',
  'feed',
  'actions',
]);

export const COCKPIT_VERSION = '1.0';
