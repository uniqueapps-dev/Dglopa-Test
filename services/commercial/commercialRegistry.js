/**
 * DGLOPA PLATFORM — COMMERCIAL INTELLIGENCE CORE (CIA Core)
 * commercialRegistry.js — EPIC-001A
 *
 * Configuration-driven registries for all CIA Core type vocabularies.
 * No switch statements. No hardcoded logic.
 *
 * Registries describe:
 *   - Assessment Types    — what commercial situations can be identified
 *   - Signal Types        — what commercial dimensions can be signalled
 *   - Driver Types        — what commercial forces can be detected
 *
 * Future modules extend registries via register*() functions
 * without modifying any engine code (Open/Closed Principle).
 *
 * Registries are read-only after initial population.
 * registerX() throws if a type key is already registered.
 */

import {
  DRIVER_TYPE, ASSESSMENT_TYPE, SIGNAL_TYPE,
  DRIVER_DIRECTION, SIGNAL_URGENCY, ASSESSMENT_SEVERITY,
} from './commercialConstants.js';

// ================================================================
// DRIVER REGISTRY
// ================================================================

const _driverRegistry = new Map([
  [DRIVER_TYPE.DEMAND_PRESSURE,        { label: 'Demand Pressure',        defaultDirection: DRIVER_DIRECTION.NEGATIVE, description: 'Repeated unmet customer demand creating a revenue gap.' }],
  [DRIVER_TYPE.STOCKOUT_FREQUENCY,     { label: 'Stockout Frequency',     defaultDirection: DRIVER_DIRECTION.NEGATIVE, description: 'How often products run out of stock, interrupting sales.' }],
  [DRIVER_TYPE.DEAD_STOCK_ACCUMULATION,{ label: 'Dead Stock Accumulation',defaultDirection: DRIVER_DIRECTION.NEGATIVE, description: 'Capital tied up in non-moving inventory.' }],
  [DRIVER_TYPE.EXPIRY_WASTE,           { label: 'Expiry Waste',           defaultDirection: DRIVER_DIRECTION.NEGATIVE, description: 'Inventory lost to expiry — direct capital loss.' }],
  [DRIVER_TYPE.PURCHASE_COST_TREND,    { label: 'Purchase Cost Trend',    defaultDirection: DRIVER_DIRECTION.NEUTRAL,  description: 'Direction and magnitude of purchase cost changes.' }],
  [DRIVER_TYPE.SUPPLIER_RELIABILITY,   { label: 'Supplier Reliability',   defaultDirection: DRIVER_DIRECTION.NEUTRAL,  description: 'Consistency of supplier delivery performance.' }],
  [DRIVER_TYPE.SUPPLY_CHAIN_RISK,      { label: 'Supply Chain Risk',      defaultDirection: DRIVER_DIRECTION.NEGATIVE, description: 'Probability and impact of supply disruption.' }],
  [DRIVER_TYPE.DATA_QUALITY,           { label: 'Data Quality Drag',      defaultDirection: DRIVER_DIRECTION.NEGATIVE, description: 'Operational drag from accumulating data quality issues.' }],
  [DRIVER_TYPE.PURCHASE_MOMENTUM,      { label: 'Purchase Momentum',      defaultDirection: DRIVER_DIRECTION.POSITIVE, description: 'Direction and rate of purchasing activity.' }],
]);

// ================================================================
// ASSESSMENT REGISTRY
// ================================================================

const _assessmentRegistry = new Map([
  [ASSESSMENT_TYPE.REVENUE_GAP,         { label: 'Revenue Gap',          defaultSeverity: ASSESSMENT_SEVERITY.MODERATE,   description: 'Revenue being lost due to unmet demand or stockouts.' }],
  [ASSESSMENT_TYPE.CAPITAL_AT_RISK,     { label: 'Capital At Risk',      defaultSeverity: ASSESSMENT_SEVERITY.SIGNIFICANT, description: 'Capital exposed to loss via expiry or dead stock.' }],
  [ASSESSMENT_TYPE.SUPPLY_VULNERABILITY,{ label: 'Supply Vulnerability', defaultSeverity: ASSESSMENT_SEVERITY.MODERATE,   description: 'Commercial exposure from supply chain instability.' }],
  [ASSESSMENT_TYPE.GROWTH_OPPORTUNITY,  { label: 'Growth Opportunity',   defaultSeverity: ASSESSMENT_SEVERITY.MODERATE,   description: 'Commercial opportunity from demand signals or relationships.' }],
  [ASSESSMENT_TYPE.OPERATIONAL_DRAG,    { label: 'Operational Drag',     defaultSeverity: ASSESSMENT_SEVERITY.MODERATE,   description: 'Indirect commercial cost of operational inefficiency.' }],
  [ASSESSMENT_TYPE.MARGIN_EXPOSURE,     { label: 'Margin Exposure',      defaultSeverity: ASSESSMENT_SEVERITY.SIGNIFICANT, description: 'Risk to commercial margin from cost trends and inventory losses.' }],
]);

// ================================================================
// SIGNAL REGISTRY
// ================================================================

const _signalRegistry = new Map([
  [SIGNAL_TYPE.REVENUE_LOSS_SIGNAL, { label: 'Revenue Loss Signal',  defaultUrgency: SIGNAL_URGENCY.URGENT,    description: 'Identifiable lost revenue from unmet demand.' }],
  [SIGNAL_TYPE.GROWTH_SIGNAL,       { label: 'Growth Signal',        defaultUrgency: SIGNAL_URGENCY.ATTENTION, description: 'Identifiable revenue opportunity from demand or relationships.' }],
  [SIGNAL_TYPE.CAPITAL_LOSS_SIGNAL, { label: 'Capital Loss Signal',  defaultUrgency: SIGNAL_URGENCY.URGENT,    description: 'Identifiable capital loss from expiry or dead stock.' }],
  [SIGNAL_TYPE.COST_PRESSURE_SIGNAL,{ label: 'Cost Pressure Signal', defaultUrgency: SIGNAL_URGENCY.ATTENTION, description: 'Rising costs threatening commercial margin.' }],
  [SIGNAL_TYPE.SUPPLY_RISK_SIGNAL,  { label: 'Supply Risk Signal',   defaultUrgency: SIGNAL_URGENCY.URGENT,    description: 'Supply chain vulnerability creating commercial exposure.' }],
  [SIGNAL_TYPE.EFFICIENCY_SIGNAL,   { label: 'Efficiency Signal',    defaultUrgency: SIGNAL_URGENCY.MONITOR,   description: 'Operational drag with commercial consequence.' }],
]);

// ================================================================
// PUBLIC READ API
// ================================================================

export function getDriverDefinition(driverType)     { return _driverRegistry.get(driverType)     ?? null; }
export function getAssessmentDefinition(type)       { return _assessmentRegistry.get(type)        ?? null; }
export function getSignalDefinition(signalType)     { return _signalRegistry.get(signalType)      ?? null; }

export function getAllDriverDefinitions()            { return [..._driverRegistry.values()]; }
export function getAllAssessmentDefinitions()        { return [..._assessmentRegistry.values()]; }
export function getAllSignalDefinitions()            { return [..._signalRegistry.values()]; }

// ================================================================
// EXTENSION API (Open/Closed)
// ================================================================

export function registerDriverType(driverType, definition) {
  if (_driverRegistry.has(driverType)) throw new Error(`[CommercialRegistry] Driver type "${driverType}" already registered.`);
  _driverRegistry.set(driverType, Object.freeze(definition));
}

export function registerAssessmentType(assessmentType, definition) {
  if (_assessmentRegistry.has(assessmentType)) throw new Error(`[CommercialRegistry] Assessment type "${assessmentType}" already registered.`);
  _assessmentRegistry.set(assessmentType, Object.freeze(definition));
}

export function registerSignalType(signalType, definition) {
  if (_signalRegistry.has(signalType)) throw new Error(`[CommercialRegistry] Signal type "${signalType}" already registered.`);
  _signalRegistry.set(signalType, Object.freeze(definition));
}
