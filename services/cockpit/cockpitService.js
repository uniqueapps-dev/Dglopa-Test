/**
 * DGLOPA PLATFORM — COCKPIT FOUNDATION
 * cockpitService.js — DT-009
 *
 * The single source of presentation data for the Cockpit.
 *
 * ADR-059: Consumes PlatformEvent[], ContextGraph[], PatternGraph[].
 * NEVER queries operational database tables directly.
 * NEVER recreates business logic.
 *
 * buildCockpitPayload() is the entry point.
 * It orchestrates assembly of all Cockpit sections and returns
 * an immutable CockpitPayload for the screen components to render.
 *
 * FAST PATH: For the first load, this function is called with
 * only the semantic event assembly result. Context and Pattern
 * objects are built progressively if provided.
 */

import {
  ATTENTION_CATEGORY, CARD_TYPE, COCKPIT_VERSION,
  FEED_GROUP,
} from './cockpitConstants.js';
import {
  IMPORTANCE, STRATEGIC_INTENT,
} from '../semantic/eventConstants.js';
import {
  PATTERN_STRENGTH, PATTERN_EVOLUTION,
} from '../pattern/patternConstants.js';
import { CONFIDENCE } from '../context/contextConstants.js';

let _seq = 0;
const _id = (prefix) => `${prefix}-${Date.now()}-${++_seq}`;

// ================================================================
// PRIMARY ENTRY POINT
// ================================================================

/**
 * Build the full CockpitPayload.
 *
 * @param {object} input
 *   events:        PlatformEvent[]   — from assembleSemanticEvents()
 *   contextGraphs: ContextGraph[]    — from correlate() (may be empty)
 *   patternGraphs: PatternGraph[]    — from correlatePatterns() (may be empty)
 *   pharmacyName:  string            — optional pharmacy name for welcome header
 * @param {number}  [now]
 * @returns {CockpitPayload} — frozen
 */
export function buildCockpitPayload({
  events        = [],
  contextGraphs = [],
  patternGraphs = [],
  pharmacyName  = 'D-Glopa Pharm',
}, now = Date.now()) {

  const welcome    = _buildWelcome(pharmacyName, now);
  const snapshot   = _buildSnapshot(events, patternGraphs, now);
  const attention  = _buildAttention(events, contextGraphs, patternGraphs, now);
  const insights   = _buildInsights(patternGraphs, contextGraphs);
  const feedGroups = _buildFeedGroups(events, now);
  const quickActions = _buildQuickActions(snapshot);

  return Object.freeze({
    welcome,
    snapshot,
    attention,
    insights,
    feedGroups,
    quickActions,
    generatedAt: now,
    cockpitVersion: COCKPIT_VERSION,
  });
}

// ================================================================
// WELCOME HEADER
// ================================================================

function _buildWelcome(pharmacyName, now) {
  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dayLabel = new Date(now).toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return Object.freeze({
    greeting,
    pharmacyName,
    dayLabel,
    subtitle: 'Your operational overview is ready.',
  });
}

// ================================================================
// BUSINESS SNAPSHOT
// ================================================================

function _buildSnapshot(events, patternGraphs, now) {
  const todayStart = _startOfDay(now);
  const recent     = events.filter((e) => !e.synthetic);

  const allPatterns = patternGraphs.flatMap((g) => g.patterns || []);

  return Object.freeze({
    totalOpen:        events.filter((e) => e.importance === IMPORTANCE.CRITICAL && !e.synthetic).length,
    critical:         events.filter((e) => e.importance === IMPORTANCE.CRITICAL && !e.synthetic).length,
    highPatterns:     allPatterns.filter((p) => ['HIGH', 'VERY_HIGH'].includes(p.patternStrength)).length,
    emergingPatterns: allPatterns.filter((p) => p.evolution === PATTERN_EVOLUTION.EMERGING).length,
    activityToday:    recent.filter((e) => e.timestamp >= todayStart).length,
    patternCount:     allPatterns.length,
  });
}

// ================================================================
// ATTENTION CENTER (ADR-060: attention precedes information)
// ================================================================

function _buildAttention(events, contextGraphs, patternGraphs, now) {
  const items = [];
  const allPatterns   = patternGraphs.flatMap((g) => g.patterns || []);
  const allContexts   = contextGraphs.flatMap((g) => g.contexts || []);

  // ---- Critical importance events (MANDATORY obligation) ----
  const criticalEvents = events.filter(
    (e) => e.importance === IMPORTANCE.CRITICAL && !e.synthetic
  );
  if (criticalEvents.length > 0) {
    items.push(_attentionItem({
      category:       ATTENTION_CATEGORY.CRITICAL,
      title:          `${criticalEvents.length} Critical Item${criticalEvents.length !== 1 ? 's' : ''} Require Attention`,
      body:           'Critical operational events that require immediate response.',
      count:          criticalEvents.length,
      screen:         'review',
      importance:     IMPORTANCE.CRITICAL,
      strategicIntent: criticalEvents[0]?.strategicIntent || STRATEGIC_INTENT.PROTECT,
    }));
  }

  // ---- VERY_HIGH strength patterns ----
  const veryHighPatterns = allPatterns.filter((p) => p.patternStrength === PATTERN_STRENGTH.VERY_HIGH);
  if (veryHighPatterns.length > 0) {
    items.push(_attentionItem({
      category:       ATTENTION_CATEGORY.CRITICAL,
      title:          `${veryHighPatterns.length} Very High Strength Pattern${veryHighPatterns.length !== 1 ? 's' : ''}`,
      body:           veryHighPatterns[0]?.patternSummary?.split('.')[0] || 'Patterns of very high operational magnitude detected.',
      count:          veryHighPatterns.length,
      screen:         null,
      importance:     IMPORTANCE.WARNING,
      strategicIntent: STRATEGIC_INTENT.PROTECT,
      patternId:      veryHighPatterns[0]?.patternId,
    }));
  }

  // ---- PROTECT intent events (capital at risk) ----
  const protectEvents = events.filter(
    (e) => e.strategicIntent === STRATEGIC_INTENT.PROTECT &&
           e.importance === IMPORTANCE.WARNING && !e.synthetic
  );
  if (protectEvents.length > 0) {
    items.push(_attentionItem({
      category:       ATTENTION_CATEGORY.OPERATIONAL,
      title:          `${protectEvents.length} Capital Protection Signal${protectEvents.length !== 1 ? 's' : ''}`,
      body:           'Inventory expiry or stock quality issues require attention.',
      count:          protectEvents.length,
      screen:         'inventory',
      importance:     IMPORTANCE.WARNING,
      strategicIntent: STRATEGIC_INTENT.PROTECT,
    }));
  }

  // ---- GROW intent patterns (revenue opportunity) ----
  const growPatterns = allPatterns.filter(
    (p) => p.primaryContext?.primaryEvent?.strategicIntent === STRATEGIC_INTENT.GROW &&
           ['HIGH', 'VERY_HIGH', 'MEDIUM'].includes(p.patternStrength)
  );
  if (growPatterns.length > 0) {
    items.push(_attentionItem({
      category:       ATTENTION_CATEGORY.GROWTH,
      title:          `${growPatterns.length} Revenue Opportunity Signal${growPatterns.length !== 1 ? 's' : ''}`,
      body:           'Demand or supplier patterns signal revenue opportunities.',
      count:          growPatterns.length,
      screen:         'demand',
      importance:     IMPORTANCE.SUCCESS,
      strategicIntent: STRATEGIC_INTENT.GROW,
      patternId:      growPatterns[0]?.patternId,
    }));
  }

  // ---- Strengthening patterns ----
  const strengtheningPatterns = allPatterns.filter(
    (p) => p.evolution === PATTERN_EVOLUTION.STRENGTHENING
  );
  if (strengtheningPatterns.length > 0) {
    items.push(_attentionItem({
      category:       ATTENTION_CATEGORY.OPERATIONAL,
      title:          `${strengtheningPatterns.length} Strengthening Pattern${strengtheningPatterns.length !== 1 ? 's' : ''}`,
      body:           'Recurring operational patterns are becoming more significant.',
      count:          strengtheningPatterns.length,
      screen:         null,
      importance:     IMPORTANCE.WARNING,
      strategicIntent: STRATEGIC_INTENT.LEARN,
    }));
  }

  // ---- LEARN intent signals (data quality) ----
  const learnEvents = events.filter(
    (e) => e.strategicIntent === STRATEGIC_INTENT.LEARN && !e.synthetic
  );
  if (learnEvents.length > 0) {
    items.push(_attentionItem({
      category:       ATTENTION_CATEGORY.LEARNING,
      title:          `${learnEvents.length} Data Quality Signal${learnEvents.length !== 1 ? 's' : ''}`,
      body:           'Operational records that could improve platform knowledge.',
      count:          learnEvents.length,
      screen:         'review',
      importance:     IMPORTANCE.INFO,
      strategicIntent: STRATEGIC_INTENT.LEARN,
    }));
  }

  // Sort: Critical first, then Operational, Growth, Learning
  const orderMap = {
    [ATTENTION_CATEGORY.CRITICAL]:    0,
    [ATTENTION_CATEGORY.OPERATIONAL]: 1,
    [ATTENTION_CATEGORY.GROWTH]:      2,
    [ATTENTION_CATEGORY.LEARNING]:    3,
  };
  items.sort((a, b) => (orderMap[a.category] ?? 9) - (orderMap[b.category] ?? 9));

  return Object.freeze(items);
}

// ================================================================
// INSIGHT CARDS
// ================================================================

function _buildInsights(patternGraphs, contextGraphs) {
  const allPatterns = patternGraphs.flatMap((g) => g.patterns || []);
  const allContexts = contextGraphs.flatMap((g) => g.contexts || []);

  // Sort: VERY_HIGH first, then by evolution (STRENGTHENING > EMERGING > STABLE)
  const strengthOrder = { VERY_HIGH: 0, HIGH: 1, MEDIUM: 2, LOW: 3, VERY_LOW: 4 };
  const evolutionOrder = { STRENGTHENING: 0, EMERGING: 1, STABLE: 2, WEAKENING: 3, DISAPPEARING: 4 };

  const sorted = [...allPatterns].sort((a, b) => {
    const sa = strengthOrder[a.patternStrength] ?? 9;
    const sb = strengthOrder[b.patternStrength] ?? 9;
    if (sa !== sb) return sa - sb;
    return (evolutionOrder[a.evolution] ?? 9) - (evolutionOrder[b.evolution] ?? 9);
  });

  return Object.freeze(
    sorted.slice(0, 8).map((pattern) => _patternToInsightCard(pattern, allContexts))
  );
}

function _patternToInsightCard(pattern, allContexts) {
  const ctx    = pattern.primaryContext;
  const evIds  = ctx?.relationshipChain?.eventSequence || [];

  const whyItMatters = _buildWhyItMatters(pattern);

  return Object.freeze({
    cardId:             _id('CRD'),
    cardType:           pattern.synthetic ? CARD_TYPE.MILESTONE : CARD_TYPE.PATTERN_ALERT,
    title:              pattern.metadata?.patternLabel || pattern.patternType,
    summary:            pattern.patternSummary?.split('.')[0] + '.' || 'Pattern detected.',
    whyItMatters,
    supportingEvidence: [...(pattern.supportingEvidence || [])].slice(0, 4),
    patternType:        pattern.patternType,
    patternStrength:    pattern.patternStrength,
    evolution:          pattern.evolution,
    confidence:         pattern.confidence,
    patternId:          pattern.patternId,
    contextId:          ctx?.contextId || null,
    eventIds:           Object.freeze([...evIds].slice(0, 5)),
    metadata:           Object.freeze({ ...pattern.metadata }),
  });
}

function _buildWhyItMatters(pattern) {
  const whyMap = {
    RepeatedStockout:       'Products are regularly out of stock, causing customers to leave without being served. Revenue is being lost on each occurrence.',
    RepeatedDemand:         'Customers are repeatedly requesting products the pharmacy cannot supply. Each unmet request represents a lost sale and a potential customer leaving.',
    ExpiryLoss:             'Inventory is expiring before it can be sold. This represents direct capital loss — money paid for stock that generates no revenue.',
    PurchaseGrowth:         'Purchasing volume from suppliers is growing, indicating expanding operations or increased product demand.',
    SupplierReliability:    'Consistent delivery performance from this supplier reduces operational risk and supports inventory planning.',
    ReviewQueueCongestion:  'Review items are accumulating, indicating operational data quality issues that need attention before they compound.',
    DeadStock:              'Inventory that has been on the shelf for over 90 days without demand is tying up capital that could be deployed more effectively.',
    SupplierDelay:          'Recurring supply chain disruptions are creating gaps between what is ordered and what arrives — leading to stockouts downstream.',
    MarginCompression:      'Costs are rising faster than selling prices, reducing the margin on every sale.',
    Seasonal:               'A seasonal demand pattern is visible — stock levels should be adjusted in advance.',
  };
  return whyMap[pattern.patternType] || pattern.patternSummary || 'Pattern identified from operational data.';
}

// ================================================================
// ACTIVITY FEED
// ================================================================

function _buildFeedGroups(events, now) {
  const todayStart     = _startOfDay(now);
  const yesterdayStart = todayStart - 86400000;
  const weekStart      = todayStart - (new Date(now).getDay() * 86400000);
  const monthStart     = _startOfMonth(now);

  // Only include non-synthetic events in the feed (synthetic milestones go to Insights)
  const feedEvents = events
    .filter((e) => !e.synthetic)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100)
    .map(_eventToFeedEvent);

  const groups = [
    { label: FEED_GROUP.TODAY,      from: todayStart,     to: Infinity           },
    { label: FEED_GROUP.YESTERDAY,  from: yesterdayStart, to: todayStart - 1     },
    { label: FEED_GROUP.THIS_WEEK,  from: weekStart,      to: yesterdayStart - 1 },
    { label: FEED_GROUP.THIS_MONTH, from: monthStart,     to: weekStart - 1      },
    { label: FEED_GROUP.OLDER,      from: 0,              to: monthStart - 1     },
  ];

  const result = groups
    .map((g) => ({
      label:  g.label,
      events: feedEvents.filter((e) => e.timestamp >= g.from && e.timestamp <= g.to),
    }))
    .filter((g) => g.events.length > 0);

  return Object.freeze(result);
}

function _eventToFeedEvent(ev) {
  return Object.freeze({
    feedId:          _id('FD'),
    eventId:         ev.eventId,
    eventType:       ev.eventType,
    title:           ev.title,
    description:     ev.description,
    timestamp:       ev.timestamp,
    importance:      ev.importance,
    strategicIntent: ev.strategicIntent,
    sourceModule:    ev.sourceModule,
    synthetic:       ev.synthetic,
  });
}

// ================================================================
// QUICK ACTIONS
// ================================================================

function _buildQuickActions(snapshot) {
  const actions = [
    { label: 'Receive Stock',      screen: 'receive',    icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3' },
    { label: 'Review Queue',       screen: 'review',     icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
      badge: snapshot.critical > 0 ? String(snapshot.critical) : null },
    { label: 'Demand Log',         screen: 'demand',     icon: 'M22 12h-18M5 12l7-7 7 7' },
    { label: 'Inventory',          screen: 'inventory',  icon: 'M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z' },
    { label: 'Suppliers',          screen: 'suppliers',  icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { label: 'Product Master',     screen: 'products',   icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
  ];

  return Object.freeze(
    actions.map((a) => Object.freeze({
      actionId: _id('ACT'),
      ...a,
      badge: a.badge || null,
    }))
  );
}

// ================================================================
// HELPERS
// ================================================================

function _attentionItem(parts) {
  return Object.freeze({ attentionId: _id('ATT'), ...parts });
}

function _startOfDay(ts)   { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime(); }
function _startOfMonth(ts) { const d = new Date(ts); d.setDate(1); d.setHours(0,0,0,0); return d.getTime(); }
