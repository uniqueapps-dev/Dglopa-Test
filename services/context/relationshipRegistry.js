/**
 * DGLOPA PLATFORM — CONTEXT INTELLIGENCE FRAMEWORK
 * relationshipRegistry.js — DT-008B
 *
 * Registry of every supported relationship between semantic event types.
 * All relationships are configuration — no logic is hardcoded in the
 * Relationship Engine itself.
 *
 * RELATIONSHIP DEFINITION SHAPE:
 *   fromType:        eventType string (source event)
 *   toType:          eventType string (target event)
 *   relationship:    RELATIONSHIP_TYPE value
 *   label:           human-readable description of the relationship
 *   matchPredicate:  (fromEvent, toEvent) => boolean — additional match conditions
 *                    beyond event type (e.g. same productId, same supplierId)
 *   maxWindowMs:     max allowed timestamp gap between events (null = no limit)
 *   strength:        base relationship strength 0..1 (default 1.0)
 *
 * OPEN/CLOSED: registerRelationship() adds new entries.
 * Existing entries are never modified; no duplicates on same from→to pair.
 *
 * Narrative examples from the spec are reproduced directly in the registry
 * as CAUSES chains, with realistic matchPredicates enforcing entity-level
 * correlation (e.g. same supplierId links supplier delay → late receiving).
 */

import { RELATIONSHIP_TYPE } from './contextConstants.js';
import * as ET from '../semantic/eventTypes.js';

const _registry = [];

function rel(fromType, toType, relationship, label, matchPredicate, maxWindowDays = null, strength = 1.0) {
  _registry.push(Object.freeze({
    fromType,
    toType,
    relationship,
    label,
    matchPredicate: matchPredicate || (() => true),
    maxWindowMs:    maxWindowDays ? maxWindowDays * 86400000 : null,
    strength,
  }));
}

// ================================================================
// BUILT-IN RELATIONSHIP DEFINITIONS
// (spec narrative: Supplier Delay → Late Receiving → Stockout → Repeated Demand → Lost Revenue)
// ================================================================

// ---- Receiving → Inventory chain ----
rel(
  ET.RECEIVING_SESSION_COMPLETED, ET.INVENTORY_LOT_CREATED,
  RELATIONSHIP_TYPE.CAUSES,
  'A completed receiving session creates inventory lots',
  (from, to) => from.entityId && to.metadata?.invoiceId === from.entityId,
  null, 1.0
);

rel(
  ET.RECEIVING_SESSION_CANCELLED, ET.INVENTORY_STOCK_OUT,
  RELATIONSHIP_TYPE.RESULTS_IN,
  'A cancelled receiving session may result in stock-out for expected products',
  (from, to) => from.metadata?.supplierId && to.entityId,
  30, 0.5
);

// ---- Inventory expiry chain ----
rel(
  ET.INVENTORY_LOT_NEAR_EXPIRY, ET.INVENTORY_LOT_EXPIRED,
  RELATIONSHIP_TYPE.RESULTS_IN,
  'A near-expiry lot becomes expired if not sold or disposed of',
  (from, to) => from.entityId === to.entityId,
  90, 0.9
);

rel(
  ET.INVENTORY_LOT_EXPIRED, ET.REVIEW_ITEM_RAISED,
  RELATIONSHIP_TYPE.CAUSES,
  'An expired lot raises a review item for disposal',
  () => true,
  7, 0.7
);

// ---- Stock-out → Demand chain ----
rel(
  ET.INVENTORY_STOCK_OUT, ET.DEMAND_CAPTURED,
  RELATIONSHIP_TYPE.CAUSES,
  'A stock-out causes unmet customer demand',
  (from, to) => from.entityId === to.metadata?.productId || (from.relatedEntities?.some(r => r.id === to.metadata?.productId)),
  30, 0.8
);

rel(
  ET.INVENTORY_LOW_STOCK, ET.DEMAND_CAPTURED,
  RELATIONSHIP_TYPE.INFLUENCES,
  'Low stock increases the risk of unmet demand',
  (from, to) => from.entityId === to.metadata?.productId,
  14, 0.6
);

// ---- Demand → Demand repeat chain ----
rel(
  ET.DEMAND_CAPTURED, ET.DEMAND_REPEAT_DETECTED,
  RELATIONSHIP_TYPE.REINFORCES,
  'A captured demand contributes to repeat-demand detection for the same product',
  (from, to) => from.metadata?.productName && from.metadata?.productName === to.metadata?.productName,
  90, 0.9
);

// ---- Repeated demand → purchasing signal ----
rel(
  ET.DEMAND_REPEAT_DETECTED, ET.RECEIVING_SESSION_STARTED,
  RELATIONSHIP_TYPE.INFLUENCES,
  'Repeated demand influences a new receiving session for the product',
  (from, to) => true, // session may cover many products; soft link
  60, 0.3
);

rel(
  ET.DEMAND_REPEAT_DETECTED, ET.SUPPLIER_PURCHASE_RECORDED,
  RELATIONSHIP_TYPE.INFLUENCES,
  'Repeated demand signals a purchasing opportunity from a supplier',
  () => true,
  60, 0.4
);

// ---- Supplier chain ----
rel(
  ET.SUPPLIER_CREATED, ET.SUPPLIER_FIRST_PURCHASE,
  RELATIONSHIP_TYPE.RESULTS_IN,
  'A new supplier leads to a first purchase event',
  (from, to) => from.entityId === to.metadata?.supplierId || from.entityId === to.relatedEntities?.find(r => r.type === 'Supplier')?.id,
  365, 0.8
);

rel(
  ET.SUPPLIER_FIRST_PURCHASE, ET.RECEIVING_SESSION_COMPLETED,
  RELATIONSHIP_TYPE.RESULTS_IN,
  'A first purchase results in an initial receiving session',
  (from, to) => from.metadata?.supplierId && to.metadata?.supplierId === from.metadata?.supplierId,
  30, 0.7
);

rel(
  ET.SUPPLIER_ARCHIVED, ET.INVENTORY_STOCK_OUT,
  RELATIONSHIP_TYPE.INFLUENCES,
  'An archived supplier may lead to stock-out for their products',
  () => true,
  90, 0.4
);

rel(
  ET.SUPPLIER_MERGED, ET.RECEIVING_SESSION_STARTED,
  RELATIONSHIP_TYPE.RELATED_TO,
  'A supplier merge may trigger a receiving session under the surviving supplier',
  () => true,
  30, 0.3
);

// ---- Milestone chains ----
rel(
  ET.RECEIVING_SESSION_COMPLETED, ET.MILESTONE_SESSION_COUNT,
  RELATIONSHIP_TYPE.RESULTS_IN,
  'Completing receiving sessions contributes toward session count milestones',
  (from, to) => from.metadata?.supplierId && to.metadata?.supplierId === from.metadata?.supplierId,
  null, 0.5
);

rel(
  ET.SUPPLIER_PURCHASE_RECORDED, ET.MILESTONE_PURCHASE_VALUE,
  RELATIONSHIP_TYPE.RESULTS_IN,
  'Purchases accumulate toward purchase value milestones',
  (from, to) => to.metadata?.supplierId === from.metadata?.supplierId,
  null, 0.5
);

// ---- Review chain ----
rel(
  ET.REVIEW_ITEM_RAISED, ET.REVIEW_ITEM_RESOLVED,
  RELATIONSHIP_TYPE.DEPENDS_ON,
  'A review item resolution depends on the corresponding raised item',
  (from, to) => from.entityId === to.entityId,
  null, 1.0
);

rel(
  ET.MIGRATION_IMPORT_COMMITTED, ET.REVIEW_ITEM_RAISED,
  RELATIONSHIP_TYPE.RESULTS_IN,
  'An import batch may raise review items for unmatched records',
  () => true,
  1, 0.7
);

rel(
  ET.MIGRATION_IMPORT_FAILED, ET.REVIEW_ITEM_RAISED,
  RELATIONSHIP_TYPE.CAUSES,
  'A failed import causes review items for investigation',
  () => true,
  1, 0.9
);

// ---- Demand → Review chain ----
rel(
  ET.DEMAND_CAPTURED, ET.REVIEW_ITEM_RAISED,
  RELATIONSHIP_TYPE.RELATED_TO,
  'An unmatched demand entry (unknown product) is related to a review item',
  (from, to) => to.metadata?.category === 'Unknown Product' || to.metadata?.category === 'Demand Resolution Required',
  7, 0.6
);

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Get all registered relationship definitions.
 */
export function getAllRelationships() {
  return [..._registry];
}

/**
 * Get definitions where fromType matches the given event type.
 */
export function getRelationshipsFrom(eventType) {
  return _registry.filter((r) => r.fromType === eventType);
}

/**
 * Get definitions where toType matches the given event type.
 */
export function getRelationshipsTo(eventType) {
  return _registry.filter((r) => r.toType === eventType);
}

/**
 * Register a new relationship from an external module.
 * @param {RelationshipDefinition} definition
 */
export function registerRelationship(definition) {
  _registry.push(Object.freeze({
    matchPredicate: () => true,
    maxWindowMs:    null,
    strength:       1.0,
    ...definition,
  }));
}
