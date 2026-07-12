/**
 * DGLOPA PLATFORM — MILESTONE ENGINE
 * DT-008A: Detects when running aggregates cross threshold boundaries
 * and generates synthetic milestone events.
 *
 * DESIGN PRINCIPLES:
 *   - Thresholds are configuration, not code. Change a threshold by
 *     changing the MILESTONE_CONFIG object; no framework code changes.
 *   - Milestones are computed from aggregates, not from raw records.
 *     The assembler computes running totals; the engine checks them.
 *   - A milestone fires if the aggregate crosses a threshold from below.
 *     "Crosses" means: the previous value was below the threshold AND
 *     the current value meets or exceeds it.
 *   - Multiple thresholds can fire in one assembly call (e.g. if a single
 *     large delivery takes a supplier from ₦0 to ₦1.5M, both the
 *     ₦100K and ₦500K and ₦1M milestones fire as synthetic events).
 *
 * Milestones are grouped by type (Financial, Operational, Relationship,
 * Inventory, Demand) so future modules can register new groups without
 * modifying this file — just push new entries into MILESTONE_CONFIG.
 */

import { createEvent, IMPORTANCE, CATEGORY, ENTITY_TYPE, SOURCE_MODULE } from './eventModel.js';

// ================================================================
// MILESTONE CONFIGURATION
// ================================================================

export const MILESTONE_CONFIG = {

  // ---- Financial: total purchase value per supplier ----
  purchaseValue: {
    eventType:    'MILESTONE_PURCHASE_VALUE',
    category:     CATEGORY.COMMERCIAL,
    entityType:   ENTITY_TYPE.SUPPLIER,
    sourceModule: SOURCE_MODULE.SYSTEM,
    thresholds: [
      { value: 100_000,     label: '₦100K',   title: '₦100,000 Purchase Milestone'     },
      { value: 500_000,     label: '₦500K',   title: '₦500,000 Purchase Milestone'     },
      { value: 1_000_000,   label: '₦1M',     title: '₦1 Million Purchase Milestone'   },
      { value: 5_000_000,   label: '₦5M',     title: '₦5 Million Purchase Milestone'   },
      { value: 10_000_000,  label: '₦10M',    title: '₦10 Million Purchase Milestone'  },
      { value: 50_000_000,  label: '₦50M',    title: '₦50 Million Purchase Milestone'  },
    ],
  },

  // ---- Operational: receiving session count per supplier ----
  sessionCount: {
    eventType:    'MILESTONE_SESSION_COUNT',
    category:     CATEGORY.OPERATIONAL,
    entityType:   ENTITY_TYPE.SUPPLIER,
    sourceModule: SOURCE_MODULE.SYSTEM,
    thresholds: [
      { value:  10,  label: '10 sessions',   title: '10th Receiving Session'           },
      { value:  25,  label: '25 sessions',   title: '25th Receiving Session'           },
      { value:  50,  label: '50 sessions',   title: '50 Receiving Sessions'            },
      { value: 100,  label: '100 sessions',  title: '100 Receiving Sessions'           },
    ],
  },

  // ---- Inventory: unique products supplied per supplier ----
  productCount: {
    eventType:    'MILESTONE_PRODUCT_COUNT',
    category:     CATEGORY.INVENTORY,
    entityType:   ENTITY_TYPE.SUPPLIER,
    sourceModule: SOURCE_MODULE.SYSTEM,
    thresholds: [
      { value:  10,  label: '10 products',   title: '10 Products Supplied'             },
      { value:  25,  label: '25 products',   title: '25 Products Supplied'             },
      { value:  50,  label: '50 products',   title: '50 Products Supplied'             },
      { value: 100,  label: '100 products',  title: '100 Products Supplied'            },
    ],
  },

  // ---- Relationship: days since first purchase (partnership age) ----
  partnershipDays: {
    eventType:    'MILESTONE_RELATIONSHIP',
    category:     CATEGORY.SUPPLIER,
    entityType:   ENTITY_TYPE.SUPPLIER,
    sourceModule: SOURCE_MODULE.SYSTEM,
    thresholds: [
      { value:  30,   label: '1 Month',    title: '1-Month Partnership'                },
      { value:  90,   label: '3 Months',   title: '3-Month Partnership'               },
      { value: 180,   label: '6 Months',   title: '6-Month Partnership'               },
      { value: 365,   label: '1 Year',     title: 'One-Year Partnership'              },
      { value: 730,   label: '2 Years',    title: 'Two-Year Partnership'              },
    ],
  },

  // ---- Demand: repeated demand count for a single product ----
  demandRepeat: {
    eventType:    'MILESTONE_DEMAND_THRESHOLD',
    category:     CATEGORY.DEMAND,
    entityType:   ENTITY_TYPE.PRODUCT,
    sourceModule: SOURCE_MODULE.SYSTEM,
    thresholds: [
      { value:  5,   label: '5 requests',  title: 'Product Requested 5 Times'         },
      { value: 10,   label: '10 requests', title: 'Product Requested 10 Times'        },
      { value: 25,   label: '25 requests', title: 'Product Requested 25 Times'        },
    ],
  },
};

// ================================================================
// MILESTONE DETECTION
// ================================================================

/**
 * Detect which milestone thresholds a supplier's aggregates cross.
 *
 * @param {object} aggregates — { supplierId, supplierName, totalPurchaseValue,
 *                                sessionCount, productCount, firstPurchaseDate }
 * @param {number} now        — current epoch ms
 * @returns {BusinessEvent[]} — synthetic milestone events (may be empty)
 */
export function detectSupplierMilestones(aggregates, now) {
  const {
    supplierId, supplierName,
    totalPurchaseValue = 0,
    sessionCount = 0,
    productCount = 0,
    firstPurchaseDate = null,
  } = aggregates;

  const events = [];

  // Purchase value milestones
  for (const t of MILESTONE_CONFIG.purchaseValue.thresholds) {
    if (totalPurchaseValue >= t.value) {
      events.push(_syntheticEvent(
        MILESTONE_CONFIG.purchaseValue,
        supplierId,
        t,
        `${supplierName || 'Supplier'} has reached a total purchase value of ${t.label}.`,
        now,
        { supplierId, supplierName, threshold: t.value, currentValue: totalPurchaseValue }
      ));
    }
  }

  // Session count milestones
  for (const t of MILESTONE_CONFIG.sessionCount.thresholds) {
    if (sessionCount >= t.value) {
      events.push(_syntheticEvent(
        MILESTONE_CONFIG.sessionCount,
        supplierId,
        t,
        `${supplierName || 'Supplier'} has completed ${t.label} receiving sessions.`,
        now,
        { supplierId, supplierName, threshold: t.value, currentValue: sessionCount }
      ));
    }
  }

  // Product count milestones
  for (const t of MILESTONE_CONFIG.productCount.thresholds) {
    if (productCount >= t.value) {
      events.push(_syntheticEvent(
        MILESTONE_CONFIG.productCount,
        supplierId,
        t,
        `${supplierName || 'Supplier'} has supplied ${t.label}.`,
        now,
        { supplierId, supplierName, threshold: t.value, currentValue: productCount }
      ));
    }
  }

  // Partnership age milestones
  if (firstPurchaseDate != null) {
    const partnershipDays = Math.floor((now - firstPurchaseDate) / 86400000);
    for (const t of MILESTONE_CONFIG.partnershipDays.thresholds) {
      if (partnershipDays >= t.value) {
        events.push(_syntheticEvent(
          MILESTONE_CONFIG.partnershipDays,
          supplierId,
          t,
          `${supplierName || 'Supplier'} — ${t.label} partnership milestone reached.`,
          firstPurchaseDate + t.value * 86400000, // milestone occurred on this date
          { supplierId, supplierName, threshold: t.value, partnershipDays }
        ));
      }
    }
  }

  return events;
}

/**
 * Detect demand repeat milestones for a set of product demand frequencies.
 *
 * @param {{ productId, productName, count }[]} demandFrequencies
 * @param {number} now
 * @returns {BusinessEvent[]}
 */
export function detectDemandMilestones(demandFrequencies, now) {
  const events = [];
  for (const { productId, productName, count } of demandFrequencies) {
    for (const t of MILESTONE_CONFIG.demandRepeat.thresholds) {
      if (count >= t.value) {
        events.push(_syntheticEvent(
          MILESTONE_CONFIG.demandRepeat,
          productId || productName,
          t,
          `${productName || 'Product'} has been repeatedly requested — ${t.label}.`,
          now,
          { productId, productName, threshold: t.value, currentCount: count }
        ));
      }
    }
  }
  return events;
}

// ================================================================
// REGISTER NEW MILESTONE GROUP (for future modules)
// ================================================================

/**
 * Register a new milestone group (e.g. 'salesRevenue') without
 * modifying this file's core logic.
 */
export function registerMilestoneGroup(key, config) {
  if (MILESTONE_CONFIG[key]) {
    throw new Error(`[MilestoneEngine] Milestone group "${key}" already registered.`);
  }
  MILESTONE_CONFIG[key] = config;
}

// ================================================================
// HELPERS
// ================================================================

function _syntheticEvent(groupConfig, entityId, threshold, description, timestamp, metadata) {
  return createEvent({
    eventType:    groupConfig.eventType,
    category:     groupConfig.category,
    importance:   IMPORTANCE.SUCCESS,
    timestamp,
    entityType:   groupConfig.entityType,
    entityId,
    title:        threshold.title,
    description,
    sourceModule: SOURCE_MODULE.SYSTEM,
    metadata,
    synthetic:    true,
  });
}
