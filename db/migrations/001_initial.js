/**
 * MIGRATION 001 — initial
 * Baseline marker for the DT-001 foundation schema (Dexie version 1).
 * This migration is informational only; the schema was applied by Dexie versioning.
 * Never modify this file.
 */

export const migration = {
  id:          '001_initial',
  dexieVersion: 1,
  description: 'Foundation schema — 14 empty tables, auto-increment IDs.',
  appliedAt:   null,  // set at runtime
};
