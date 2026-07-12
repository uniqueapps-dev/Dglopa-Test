/**
 * MIGRATION 007 — demand_log
 * DT-007: Demand table upgraded with full operational schema —
 *   status, reason, requestedQty, suppliedQty, missingQty,
 *   customerType, productName, estimatedPrice, evidenceData,
 *   evidenceType, evidenceNotes, notes, supplierId, sessionId, resolvedAt.
 * Never modify this file.
 */

export const migration = {
  id:           '007_demand_log',
  dexieVersion:  7,
  description:  'Demand Log full schema upgrade with evidence support.',
  appliedAt:    null,
};
