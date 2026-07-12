/**
 * DGLOPA PLATFORM — CONTEXT INTELLIGENCE FRAMEWORK
 * contextWindowEngine.js — DT-008B
 *
 * Groups semantic PlatformEvents into configurable business windows.
 *
 * DESIGN PRINCIPLE: Windows are configuration, not code.
 * A window definition specifies how to scope events by entity and/or
 * time. The engine applies the definition; it makes no interpretive decisions.
 *
 * WINDOW TYPES:
 *   Entity-scoped (filter by entityId or relatedEntity):
 *     Invoice, ReceivingSession, Supplier, Product, Inventory, Demand
 *   Time-scoped (filter by timestamp bucket):
 *     Daily, Weekly, Monthly
 *
 * Future modules can registerWindowType() to add new window types without
 * modifying this file.
 */

import { WINDOW_TYPE } from './contextConstants.js';
import { createWindow } from './contextFactory.js';

// ================================================================
// WINDOW CONFIGURATION
// ================================================================

const WINDOW_CONFIG = {

  [WINDOW_TYPE.INVOICE]: {
    label: 'Invoice Window',
    scope: (events, entityId) =>
      events.filter((e) =>
        e.metadata?.invoiceNumber === entityId ||
        e.relatedEntities?.some((r) => r.id === entityId)
      ),
  },

  [WINDOW_TYPE.RECEIVING_SESSION]: {
    label: 'Receiving Session Window',
    scope: (events, entityId) =>
      events.filter((e) =>
        (e.entityType === 'ReceivingSession' && e.entityId === entityId) ||
        e.relatedEntities?.some((r) => r.type === 'ReceivingSession' && r.id === entityId) ||
        e.metadata?.sessionId === entityId
      ),
  },

  [WINDOW_TYPE.SUPPLIER]: {
    label: 'Supplier Window',
    scope: (events, entityId) =>
      events.filter((e) =>
        (e.entityType === 'Supplier' && e.entityId === entityId) ||
        e.relatedEntities?.some((r) => r.type === 'Supplier' && r.id === entityId) ||
        e.metadata?.supplierId === entityId
      ),
  },

  [WINDOW_TYPE.PRODUCT]: {
    label: 'Product Window',
    scope: (events, entityId) =>
      events.filter((e) =>
        (e.entityType === 'Product' && e.entityId === entityId) ||
        e.relatedEntities?.some((r) => r.type === 'Product' && r.id === entityId) ||
        e.metadata?.productId === entityId
      ),
  },

  [WINDOW_TYPE.INVENTORY]: {
    label: 'Inventory Window',
    scope: (events) =>
      events.filter((e) =>
        e.category === 'Inventory' ||
        e.entityType === 'InventoryLot'
      ),
  },

  [WINDOW_TYPE.DEMAND]: {
    label: 'Demand Window',
    scope: (events, entityId) => {
      const base = events.filter((e) => e.category === 'Demand');
      return entityId
        ? base.filter((e) => e.entityId === entityId || e.metadata?.productId === entityId)
        : base;
    },
  },

  [WINDOW_TYPE.DAILY]: {
    label: 'Daily Window',
    timeBucket: (now) => {
      const d = new Date(now); d.setHours(0, 0, 0, 0);
      return { from: d.getTime(), to: d.getTime() + 86400000 - 1 };
    },
  },

  [WINDOW_TYPE.WEEKLY]: {
    label: 'Weekly Window',
    timeBucket: (now) => {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      const from = d.getTime() - (d.getDay() * 86400000);
      return { from, to: from + 7 * 86400000 - 1 };
    },
  },

  [WINDOW_TYPE.MONTHLY]: {
    label: 'Monthly Window',
    timeBucket: (now) => {
      const d = new Date(now);
      d.setDate(1); d.setHours(0, 0, 0, 0);
      const from = d.getTime();
      const nextMonth = new Date(d); nextMonth.setMonth(nextMonth.getMonth() + 1);
      return { from, to: nextMonth.getTime() - 1 };
    },
  },

};

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Build a ContextWindow from an event array.
 *
 * @param {string}          windowType  — WINDOW_TYPE value
 * @param {PlatformEvent[]} allEvents
 * @param {string|null}     entityId    — for entity-scoped windows
 * @param {number}          [now]
 * @returns {ContextWindow}
 */
export function buildWindow(windowType, allEvents, entityId = null, now = Date.now()) {
  const config = WINDOW_CONFIG[windowType];
  if (!config) throw new Error(`[ContextWindowEngine] Unknown window type: "${windowType}".`);

  let filteredEvents;
  let fromTs, toTs;

  if (config.timeBucket) {
    const bucket = config.timeBucket(now);
    fromTs = bucket.from;
    toTs   = bucket.to;
    filteredEvents = allEvents.filter((e) => e.timestamp >= fromTs && e.timestamp <= toTs);
  } else {
    filteredEvents = config.scope(allEvents, entityId);
    const timestamps = filteredEvents.map((e) => e.timestamp);
    fromTs = timestamps.length ? Math.min(...timestamps) : now;
    toTs   = timestamps.length ? Math.max(...timestamps) : now;
  }

  return createWindow(windowType, fromTs, toTs, filteredEvents, entityId);
}

/**
 * Build multiple windows simultaneously for an entity.
 * Returns a Map<windowType, ContextWindow>.
 *
 * @param {string[]}        windowTypes
 * @param {PlatformEvent[]} allEvents
 * @param {string|null}     entityId
 * @param {number}          [now]
 * @returns {Map<string, ContextWindow>}
 */
export function buildWindows(windowTypes, allEvents, entityId = null, now = Date.now()) {
  const result = new Map();
  for (const wt of windowTypes) {
    result.set(wt, buildWindow(wt, allEvents, entityId, now));
  }
  return result;
}

/**
 * Register a new window type from a future module.
 */
export function registerWindowType(windowType, config) {
  if (WINDOW_CONFIG[windowType]) throw new Error(`[ContextWindowEngine] Window type "${windowType}" already registered.`);
  WINDOW_CONFIG[windowType] = config;
}
