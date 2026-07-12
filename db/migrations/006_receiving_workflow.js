/**
 * MIGRATION 006 — receiving_workflow
 * DT-004: ReceivingSessions table. Products schema extended with
 *   weightedAvgCost, lastCost, lastReceivedDate, currentStock fields.
 * Never modify this file.
 */

export const migration = {
  id:           '006_receiving_workflow',
  dexieVersion:  6,
  description:  'ReceivingSessions table, Products inventory aggregate fields.',
  appliedAt:    null,
};
