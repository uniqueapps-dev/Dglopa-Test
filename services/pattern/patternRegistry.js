/**
 * DGLOPA PLATFORM — PATTERN INTELLIGENCE FRAMEWORK
 * patternRegistry.js — DT-008C
 *
 * Registry of every supported business pattern.
 * All pattern detection logic is in the detect() function within each
 * definition — no logic exists in the Pattern Engine itself beyond
 * calling the registry and collecting results.
 *
 * DESIGN PRINCIPLE (ADR-056): Patterns consume Context objects.
 * detect() receives Context[] (from DT-008B's ContextGraph.contexts)
 * and returns a DetectionResult or null.
 *
 * detect(contexts, window, now) => DetectionResult | null
 *   contexts — Context[] scoped to the detection window
 *   window   — { fromTs, toTs }
 *   now      — current epoch ms
 *
 * OPEN/CLOSED: registerPattern() extends the registry.
 * Existing definitions never modified.
 */

import { CONTEXT_TYPE } from '../context/contextConstants.js';
import { CONFIDENCE, PATTERN_TYPE } from './patternConstants.js';

const _registry = new Map();

function reg(patternType, def) {
  _registry.set(patternType, Object.freeze({
    patternType,
    requiredContextTypes: [],
    ...def,
  }));
}

// ================================================================
// HELPER PREDICATES (operate on Context objects from DT-008B)
// ================================================================

const _byType = (type) => (ctx) => ctx.contextType === type;
const _byTypes = (...types) => (ctx) => types.includes(ctx.contextType);

// ================================================================
// BUILT-IN PATTERN DEFINITIONS
// ================================================================

// ---- Repeated Stockout ----
reg(PATTERN_TYPE.REPEATED_STOCKOUT, {
  label:       'Repeated Stockout Pattern',
  description: 'A product has been out of stock more than once in the analysis window.',
  requiredContextTypes: [CONTEXT_TYPE.STOCK_HEALTH, CONTEXT_TYPE.REVENUE_IMPACT],
  detect(contexts, window, now) {
    const stockContexts = contexts.filter(_byTypes(CONTEXT_TYPE.STOCK_HEALTH, CONTEXT_TYPE.REVENUE_IMPACT));
    const stockOutEvents = stockContexts.flatMap((ctx) =>
      [ctx.primaryEvent, ...ctx.relatedEvents].filter((e) => e.eventType === 'INVENTORY_STOCK_OUT')
    );
    const uniqueStockOuts = new Set(stockOutEvents.map((e) => e.entityId)).size;

    if (uniqueStockOuts < 1) return null;

    const evidence = [
      `${uniqueStockOuts} distinct stock-out event${uniqueStockOuts !== 1 ? 's' : ''} detected in ${window.label || 'analysis window'}.`,
    ];
    if (stockContexts.length > 1) evidence.push(`${stockContexts.length} stock-health contexts corroborate the pattern.`);

    return {
      rawStrength:  Math.min(1, uniqueStockOuts / 5),
      occurrences:  uniqueStockOuts,
      evidence,
      contextIds:   stockContexts.map((c) => c.contextId),
    };
  },
});

// ---- Repeated Demand ----
reg(PATTERN_TYPE.REPEATED_DEMAND, {
  label:       'Repeated Demand Pattern',
  description: 'The same products are repeatedly requested but not supplied.',
  requiredContextTypes: [CONTEXT_TYPE.DEMAND_SIGNAL],
  detect(contexts) {
    const demandContexts = contexts.filter(_byType(CONTEXT_TYPE.DEMAND_SIGNAL));
    const demandCounts   = new Map();

    for (const ctx of demandContexts) {
      const events = [ctx.primaryEvent, ...ctx.relatedEvents]
        .filter((e) => e.eventType === 'DEMAND_CAPTURED' || e.eventType === 'DEMAND_REPEAT_DETECTED');
      for (const ev of events) {
        const key = ev.metadata?.productName || ev.entityId || 'unknown';
        demandCounts.set(key, (demandCounts.get(key) || 0) + 1);
      }
    }

    const repeated = [...demandCounts.entries()].filter(([, count]) => count > 1);
    if (repeated.length === 0) return null;

    const totalRepetitions = repeated.reduce((s, [, c]) => s + c, 0);
    const evidence = [
      `${repeated.length} product${repeated.length !== 1 ? 's' : ''} with repeated unmet demand.`,
      ...repeated.slice(0, 3).map(([name, count]) => `"${name}": ${count} requests.`),
    ];

    return {
      rawStrength:  Math.min(1, totalRepetitions / 20),
      occurrences:  totalRepetitions,
      evidence,
      contextIds:   demandContexts.map((c) => c.contextId),
    };
  },
});

// ---- Expiry Loss ----
reg(PATTERN_TYPE.EXPIRY_LOSS, {
  label:       'Expiry Loss Pattern',
  description: 'Inventory is regularly expiring before being sold.',
  requiredContextTypes: [CONTEXT_TYPE.STOCK_HEALTH],
  detect(contexts) {
    const stockContexts  = contexts.filter(_byType(CONTEXT_TYPE.STOCK_HEALTH));
    const expiryEvents   = stockContexts.flatMap((ctx) =>
      [ctx.primaryEvent, ...ctx.relatedEvents]
        .filter((e) => e.eventType === 'INVENTORY_LOT_EXPIRED' || e.eventType === 'INVENTORY_LOT_NEAR_EXPIRY')
    );

    if (expiryEvents.length === 0) return null;

    const expired   = expiryEvents.filter((e) => e.eventType === 'INVENTORY_LOT_EXPIRED').length;
    const nearExpiry = expiryEvents.filter((e) => e.eventType === 'INVENTORY_LOT_NEAR_EXPIRY').length;
    const evidence  = [
      `${expired} expired lot${expired !== 1 ? 's' : ''} detected.`,
      ...(nearExpiry > 0 ? [`${nearExpiry} lot${nearExpiry !== 1 ? 's' : ''} near expiry.`] : []),
    ];

    return {
      rawStrength:  Math.min(1, (expired + nearExpiry * 0.5) / 10),
      occurrences:  expired + nearExpiry,
      evidence,
      contextIds:   stockContexts.map((c) => c.contextId),
    };
  },
});

// ---- Purchase Growth ----
reg(PATTERN_TYPE.PURCHASE_GROWTH, {
  label:       'Purchase Growth Pattern',
  description: 'Total purchase volume from suppliers is growing over the analysis window.',
  requiredContextTypes: [CONTEXT_TYPE.SUPPLIER_BEHAVIOUR],
  detect(contexts) {
    const supplierContexts = contexts.filter(_byType(CONTEXT_TYPE.SUPPLIER_BEHAVIOUR));
    const milestones = supplierContexts.flatMap((ctx) =>
      [ctx.primaryEvent, ...ctx.relatedEvents]
        .filter((e) => e.eventType === 'MILESTONE_PURCHASE_VALUE')
    );

    const purchaseEvents = supplierContexts.flatMap((ctx) =>
      [ctx.primaryEvent, ...ctx.relatedEvents]
        .filter((e) => e.eventType === 'SUPPLIER_PURCHASE_RECORDED' || e.eventType === 'SUPPLIER_FIRST_PURCHASE')
    );

    if (purchaseEvents.length === 0 && milestones.length === 0) return null;

    const evidence = [
      `${purchaseEvents.length} purchase event${purchaseEvents.length !== 1 ? 's' : ''} recorded in analysis window.`,
      ...(milestones.length > 0 ? [`${milestones.length} purchase value milestone${milestones.length !== 1 ? 's' : ''} reached.`] : []),
    ];

    return {
      rawStrength:  Math.min(1, (purchaseEvents.length * 0.05) + (milestones.length * 0.2)),
      occurrences:  purchaseEvents.length,
      evidence,
      contextIds:   supplierContexts.map((c) => c.contextId),
    };
  },
});

// ---- Supplier Reliability ----
reg(PATTERN_TYPE.SUPPLIER_RELIABILITY, {
  label:       'Supplier Reliability Pattern',
  description: 'A supplier consistently delivers on time and without issues.',
  requiredContextTypes: [CONTEXT_TYPE.SUPPLIER_BEHAVIOUR, CONTEXT_TYPE.SUPPLY_CHAIN],
  detect(contexts) {
    const supplierContexts = contexts.filter(_byTypes(CONTEXT_TYPE.SUPPLIER_BEHAVIOUR, CONTEXT_TYPE.SUPPLY_CHAIN));
    if (supplierContexts.length === 0) return null;

    const completedSessions = supplierContexts.flatMap((ctx) =>
      [ctx.primaryEvent, ...ctx.relatedEvents]
        .filter((e) => e.eventType === 'RECEIVING_SESSION_COMPLETED')
    ).length;

    const cancelledSessions = supplierContexts.flatMap((ctx) =>
      [ctx.primaryEvent, ...ctx.relatedEvents]
        .filter((e) => e.eventType === 'RECEIVING_SESSION_CANCELLED')
    ).length;

    if (completedSessions === 0) return null;

    const reliabilityRate = completedSessions / (completedSessions + cancelledSessions || 1);
    const evidence = [
      `${completedSessions} completed receiving session${completedSessions !== 1 ? 's' : ''}.`,
      ...(cancelledSessions > 0 ? [`${cancelledSessions} cancelled session${cancelledSessions !== 1 ? 's' : ''}.`] : []),
      `Delivery reliability rate: ${(reliabilityRate * 100).toFixed(0)}%.`,
    ];

    return {
      rawStrength:  reliabilityRate * Math.min(1, completedSessions / 10),
      occurrences:  completedSessions,
      evidence,
      contextIds:   supplierContexts.map((c) => c.contextId),
    };
  },
});

// ---- Review Queue Congestion ----
reg(PATTERN_TYPE.REVIEW_QUEUE_CONGESTION, {
  label:       'Review Queue Congestion Pattern',
  description: 'Review items are accumulating faster than they are being resolved.',
  requiredContextTypes: [CONTEXT_TYPE.DATA_QUALITY],
  detect(contexts) {
    const reviewContexts = contexts.filter(_byType(CONTEXT_TYPE.DATA_QUALITY));
    if (reviewContexts.length === 0) return null;

    const raised   = reviewContexts.flatMap((ctx) =>
      [ctx.primaryEvent, ...ctx.relatedEvents]
        .filter((e) => e.eventType === 'REVIEW_ITEM_RAISED')
    ).length;

    const resolved = reviewContexts.flatMap((ctx) =>
      [ctx.primaryEvent, ...ctx.relatedEvents]
        .filter((e) => e.eventType === 'REVIEW_ITEM_RESOLVED')
    ).length;

    const net = raised - resolved;
    if (net <= 0 && raised === 0) return null;

    const evidence = [
      `${raised} review item${raised !== 1 ? 's' : ''} raised.`,
      `${resolved} item${resolved !== 1 ? 's' : ''} resolved.`,
      net > 0
        ? `Net accumulation: ${net} unresolved item${net !== 1 ? 's' : ''}.`
        : 'Review queue is being kept clear.',
    ];

    return {
      rawStrength:  net > 0 ? Math.min(1, net / 20) : 0.1,
      occurrences:  raised,
      evidence,
      contextIds:   reviewContexts.map((c) => c.contextId),
    };
  },
});

// ---- Dead Stock ----
reg(PATTERN_TYPE.DEAD_STOCK, {
  label:       'Dead Stock Pattern',
  description: 'Inventory lots are aging without generating demand or receiving activity.',
  requiredContextTypes: [CONTEXT_TYPE.STOCK_HEALTH],
  detect(contexts, window, now) {
    const stockContexts = contexts.filter(_byType(CONTEXT_TYPE.STOCK_HEALTH));
    const oldLots = stockContexts.flatMap((ctx) =>
      [ctx.primaryEvent, ...ctx.relatedEvents]
        .filter((e) =>
          e.eventType === 'INVENTORY_LOT_CREATED' &&
          e.metadata?.quantityAvailable > 0 &&
          (now - e.timestamp) > 90 * 86400000  // older than 90 days
        )
    );

    if (oldLots.length === 0) return null;

    const evidence = [
      `${oldLots.length} lot${oldLots.length !== 1 ? 's' : ''} older than 90 days with remaining stock.`,
    ];

    return {
      rawStrength:  Math.min(1, oldLots.length / 10),
      occurrences:  oldLots.length,
      evidence,
      contextIds:   stockContexts.map((c) => c.contextId),
    };
  },
});

// ---- Supply Chain (general) ----
reg(PATTERN_TYPE.SUPPLIER_DELAY, {
  label:       'Supplier Delay Pattern',
  description: 'Supply chain disruptions are recurring across supplier relationships.',
  requiredContextTypes: [CONTEXT_TYPE.SUPPLY_CHAIN],
  detect(contexts) {
    const chainContexts = contexts.filter(_byType(CONTEXT_TYPE.SUPPLY_CHAIN));
    if (chainContexts.length < 2) return null;

    const evidence = [
      `${chainContexts.length} supply chain disruption context${chainContexts.length !== 1 ? 's' : ''} detected.`,
    ];

    return {
      rawStrength:  Math.min(1, chainContexts.length / 5),
      occurrences:  chainContexts.length,
      evidence,
      contextIds:   chainContexts.map((c) => c.contextId),
    };
  },
});

// ================================================================
// PUBLIC API
// ================================================================

export function getAllPatternDefinitions() {
  return [..._registry.values()];
}

export function getPatternDefinition(patternType) {
  return _registry.get(patternType) ?? null;
}

/**
 * Register a new pattern from a future module.
 * Throws if the patternType is already registered.
 */
export function registerPattern(patternType, definition) {
  if (_registry.has(patternType)) {
    throw new Error(`[PatternRegistry] Pattern type "${patternType}" is already registered.`);
  }
  _registry.set(patternType, Object.freeze({
    patternType,
    requiredContextTypes: [],
    ...definition,
  }));
}
