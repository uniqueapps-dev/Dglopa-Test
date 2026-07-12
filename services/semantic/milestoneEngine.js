/**
 * DGLOPA PLATFORM — SEMANTIC INTELLIGENCE FRAMEWORK
 * milestoneEngine.js — DT-008A (Semantic)
 *
 * Detects when running aggregates cross configured threshold boundaries
 * and generates synthetic milestone PlatformEvents with full explainability.
 *
 * DESIGN PRINCIPLES:
 *   - All thresholds live in MILESTONE_CONFIG — change a threshold,
 *     touch only this configuration object, never the detection logic.
 *   - All crossed thresholds fire, not just the highest.
 *     A supplier jumping from ₦0 to ₦1.5M in one delivery crosses
 *     three milestones: ₦100K, ₦500K, ₦1M — all three become events.
 *   - Every synthetic event includes a generatedFrom explainability block
 *     describing the rule applied and the threshold crossed.
 *   - Milestones are NEVER persisted. They are always reproducible.
 *   - registerMilestoneGroup() allows future modules to add groups
 *     without modifying this file.
 */

import { IMPORTANCE, STRATEGIC_INTENT, OBLIGATION_TYPE, CATEGORY, ENTITY_TYPE, SOURCE_MODULE } from './eventConstants.js';
import * as ET      from './eventTypes.js';
import { createPlatformEvent } from './eventFactory.js';

// ================================================================
// MILESTONE CONFIGURATION
// (all thresholds are data — no hardcoding in detection logic)
// ================================================================

export const MILESTONE_CONFIG = {

  purchaseValue: {
    eventType:       ET.MILESTONE_PURCHASE_VALUE,
    category:        CATEGORY.COMMERCIAL,
    entityType:      ENTITY_TYPE.SUPPLIER,
    strategicIntent: STRATEGIC_INTENT.GROW,
    obligationType:  OBLIGATION_TYPE.NONE,
    thresholds: [
      { value:    100_000, label: '₦100K',  title: '₦100,000 Purchase Milestone'   },
      { value:    500_000, label: '₦500K',  title: '₦500,000 Purchase Milestone'   },
      { value:  1_000_000, label: '₦1M',    title: '₦1 Million Purchase Milestone' },
      { value:  5_000_000, label: '₦5M',    title: '₦5 Million Purchase Milestone' },
      { value: 10_000_000, label: '₦10M',   title: '₦10 Million Purchase Milestone'},
      { value: 50_000_000, label: '₦50M',   title: '₦50 Million Purchase Milestone'},
    ],
  },

  sessionCount: {
    eventType:       ET.MILESTONE_SESSION_COUNT,
    category:        CATEGORY.OPERATIONAL,
    entityType:      ENTITY_TYPE.SUPPLIER,
    strategicIntent: STRATEGIC_INTENT.GROW,
    obligationType:  OBLIGATION_TYPE.NONE,
    thresholds: [
      { value:  10, label: '10',  title: '10th Receiving Session'  },
      { value:  25, label: '25',  title: '25th Receiving Session'  },
      { value:  50, label: '50',  title: '50 Receiving Sessions'   },
      { value: 100, label: '100', title: '100 Receiving Sessions'  },
    ],
  },

  productCount: {
    eventType:       ET.MILESTONE_PRODUCT_COUNT,
    category:        CATEGORY.INVENTORY,
    entityType:      ENTITY_TYPE.SUPPLIER,
    strategicIntent: STRATEGIC_INTENT.GROW,
    obligationType:  OBLIGATION_TYPE.NONE,
    thresholds: [
      { value:  10, label: '10 products',  title: '10 Products Supplied'  },
      { value:  25, label: '25 products',  title: '25 Products Supplied'  },
      { value:  50, label: '50 products',  title: '50 Products Supplied'  },
      { value: 100, label: '100 products', title: '100 Products Supplied' },
    ],
  },

  partnershipDays: {
    eventType:       ET.MILESTONE_RELATIONSHIP,
    category:        CATEGORY.SUPPLIER,
    entityType:      ENTITY_TYPE.SUPPLIER,
    strategicIntent: STRATEGIC_INTENT.GROW,
    obligationType:  OBLIGATION_TYPE.NONE,
    thresholds: [
      { value:  30, label: '1 Month',  title: '1-Month Partnership'  },
      { value:  90, label: '3 Months', title: '3-Month Partnership'  },
      { value: 180, label: '6 Months', title: '6-Month Partnership'  },
      { value: 365, label: '1 Year',   title: 'One-Year Partnership' },
      { value: 730, label: '2 Years',  title: 'Two-Year Partnership' },
    ],
  },

  demandRepeat: {
    eventType:       ET.MILESTONE_DEMAND_THRESHOLD,
    category:        CATEGORY.DEMAND,
    entityType:      ENTITY_TYPE.PRODUCT,
    strategicIntent: STRATEGIC_INTENT.GROW,
    obligationType:  OBLIGATION_TYPE.ASPIRATIONAL,
    thresholds: [
      { value:  5, label: '5 requests',  title: 'Product Requested 5 Times'  },
      { value: 10, label: '10 requests', title: 'Product Requested 10 Times' },
      { value: 25, label: '25 requests', title: 'Product Requested 25 Times' },
    ],
  },

};

// ================================================================
// DETECTION
// ================================================================

/**
 * Detect supplier milestones from aggregate data.
 *
 * @param {object} agg — { supplierId, supplierName, totalPurchaseValue,
 *                         sessionCount, productCount, firstPurchaseDate }
 * @param {number} now
 * @returns {PlatformEvent[]}
 */
export function detectSupplierMilestones(agg, now) {
  const events = [];
  const { supplierId, supplierName, totalPurchaseValue = 0,
          sessionCount = 0, productCount = 0, firstPurchaseDate = null } = agg;

  // Purchase value milestones
  for (const t of MILESTONE_CONFIG.purchaseValue.thresholds) {
    if (totalPurchaseValue >= t.value) {
      events.push(_syntheticMilestone(
        MILESTONE_CONFIG.purchaseValue, supplierId, t, now,
        `${supplierName || 'Supplier'} has reached ${t.label} in total purchases.`,
        { supplierId, supplierName, threshold: t.value, currentValue: totalPurchaseValue },
        { rule: 'totalPurchaseValue >= threshold', aggregateUsed: 'totalPurchaseValue' }
      ));
    }
  }

  // Session count milestones
  for (const t of MILESTONE_CONFIG.sessionCount.thresholds) {
    if (sessionCount >= t.value) {
      events.push(_syntheticMilestone(
        MILESTONE_CONFIG.sessionCount, supplierId, t, now,
        `${supplierName || 'Supplier'} has completed ${t.label} receiving sessions.`,
        { supplierId, supplierName, threshold: t.value, currentValue: sessionCount },
        { rule: 'sessionCount >= threshold', aggregateUsed: 'sessionCount' }
      ));
    }
  }

  // Product count milestones
  for (const t of MILESTONE_CONFIG.productCount.thresholds) {
    if (productCount >= t.value) {
      events.push(_syntheticMilestone(
        MILESTONE_CONFIG.productCount, supplierId, t, now,
        `${supplierName || 'Supplier'} has supplied ${t.label}.`,
        { supplierId, supplierName, threshold: t.value, currentValue: productCount },
        { rule: 'productCount >= threshold', aggregateUsed: 'productCount' }
      ));
    }
  }

  // Partnership age milestones
  if (firstPurchaseDate != null) {
    const partnershipDays = Math.floor((now - firstPurchaseDate) / 86400000);
    for (const t of MILESTONE_CONFIG.partnershipDays.thresholds) {
      if (partnershipDays >= t.value) {
        events.push(_syntheticMilestone(
          MILESTONE_CONFIG.partnershipDays, supplierId, t,
          firstPurchaseDate + t.value * 86400000, // milestone occurred on this date
          `${supplierName || 'Supplier'} — ${t.label} partnership milestone.`,
          { supplierId, supplierName, threshold: t.value, partnershipDays },
          { rule: 'partnershipDays >= threshold', aggregateUsed: 'firstPurchaseDate' }
        ));
      }
    }
  }

  return events;
}

/**
 * Detect demand repeat milestones.
 *
 * @param {{ productId, productName, count }[]} demandFrequencies
 * @param {number} now
 * @returns {PlatformEvent[]}
 */
export function detectDemandMilestones(demandFrequencies, now) {
  const events = [];
  for (const { productId, productName, count } of demandFrequencies) {
    for (const t of MILESTONE_CONFIG.demandRepeat.thresholds) {
      if (count >= t.value) {
        events.push(_syntheticMilestone(
          MILESTONE_CONFIG.demandRepeat, productId || productName, t, now,
          `${productName || 'Product'} — ${t.label}.`,
          { productId, productName, threshold: t.value, currentCount: count },
          { rule: 'demandCount >= threshold', aggregateUsed: 'demandRepeatCount' }
        ));
      }
    }
  }
  return events;
}

/**
 * Register a new milestone group from a future module.
 */
export function registerMilestoneGroup(key, config) {
  if (MILESTONE_CONFIG[key]) throw new Error(`[MilestoneEngine] Group "${key}" already registered.`);
  MILESTONE_CONFIG[key] = config;
}

// ================================================================
// INTERNAL BUILDER
// ================================================================

function _syntheticMilestone(groupConfig, entityId, threshold, timestamp, description, metadata, rule) {
  return createPlatformEvent({
    eventType:       groupConfig.eventType,
    category:        groupConfig.category,
    importance:      IMPORTANCE.SUCCESS,
    strategicIntent: groupConfig.strategicIntent,
    obligationType:  groupConfig.obligationType,
    timestamp,
    entityType:      groupConfig.entityType,
    entityId,
    title:           threshold.title,
    description,
    sourceModule:    SOURCE_MODULE.SYSTEM,
    metadata,
    synthetic:       true,
    generatedFrom: {
      ruleApplied:      rule.rule,
      aggregateUsed:    rule.aggregateUsed,
      thresholdCrossed: threshold.value,
      thresholdLabel:   threshold.label,
    },
  });
}
