/**
 * DGLOPA PLATFORM — COCKPIT FOUNDATION
 * cockpitLayoutEngine.js — DT-009
 *
 * Determines presentation order for Cockpit sections and cards.
 * No business calculations. No semantic interpretation. Layout only.
 *
 * ADR-060: Attention precedes information.
 * Section order: Welcome → Snapshot → Attention → Insights → Feed → Actions
 */

import { SECTION_ORDER } from './cockpitConstants.js';
import { PATTERN_STRENGTH, PATTERN_EVOLUTION } from '../pattern/patternConstants.js';

// ================================================================
// SECTION ORDERING
// ================================================================

/**
 * Return the ordered list of sections to render.
 * Sections with no content are excluded.
 *
 * @param {CockpitPayload} payload
 * @returns {string[]} — ordered section names
 */
export function orderSections(payload) {
  return SECTION_ORDER.filter((section) => {
    switch (section) {
      case 'welcome':   return true; // always shown
      case 'snapshot':  return true; // always shown
      case 'attention': return payload.attention.length > 0;
      case 'insights':  return payload.insights.length > 0;
      case 'feed':      return payload.feedGroups.length > 0;
      case 'actions':   return payload.quickActions.length > 0;
      default:          return false;
    }
  });
}

/**
 * Determine the visual priority class for an attention item.
 * Returns a CSS class suffix.
 */
export function attentionItemClass(item) {
  if (item.category === 'Critical')         return 'critical';
  if (item.category === 'GrowthOpportunity') return 'growth';
  if (item.category === 'LearningSignal')   return 'learn';
  return 'operational';
}

/**
 * Determine the border colour variable for an insight card.
 */
export function insightCardBorderVar(card) {
  const strengthMap = {
    VERY_HIGH: 'var(--clr-red)',
    HIGH:      'var(--clr-amber)',
    MEDIUM:    'var(--clr-accent)',
    LOW:       'var(--clr-border-2)',
    VERY_LOW:  'var(--clr-border)',
  };
  return strengthMap[card.patternStrength] || 'var(--clr-border-2)';
}

/**
 * Determine the evolution indicator symbol for a card.
 */
export function evolutionIndicator(evolution) {
  const map = {
    [PATTERN_EVOLUTION.EMERGING]:       '↑ Emerging',
    [PATTERN_EVOLUTION.STABLE]:         '→ Stable',
    [PATTERN_EVOLUTION.STRENGTHENING]:  '↑↑ Strengthening',
    [PATTERN_EVOLUTION.WEAKENING]:      '↓ Weakening',
    [PATTERN_EVOLUTION.DISAPPEARING]:   '↓↓ Disappearing',
  };
  return map[evolution] || evolution;
}

/**
 * Determine the strength badge class for a card.
 */
export function strengthBadgeClass(strength) {
  const map = {
    VERY_HIGH: 'badge-red',
    HIGH:      'badge-amber',
    MEDIUM:    'badge-accent',
    LOW:       'badge-accent',
    VERY_LOW:  'badge-accent',
  };
  return map[strength] || 'badge-accent';
}

/**
 * Determine feed event dot colour class.
 */
export function feedEventClass(event) {
  if (event.importance === 'CRITICAL') return 'tl-dot-red';
  if (event.importance === 'WARNING')  return 'tl-dot-amber';
  if (event.importance === 'SUCCESS')  return 'tl-dot-green';
  return 'tl-dot-accent';
}
