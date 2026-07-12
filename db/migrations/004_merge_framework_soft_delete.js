/**
 * MIGRATION 004 — merge_framework_soft_delete
 * DT-002B: Product merge infrastructure, platform-wide soft delete policy.
 *
 * Schema changes:
 *   Products: mergedIntoId index added
 *   AuditLog: action index added
 *
 * New services:
 *   softDelete.js        — archiveRecord, restoreRecord, deactivateRecord, markMerged, cancelRecord
 *   productMergeService.js — mergeProducts, dryRunMerge, getMergeHistory, resolveProductId
 *
 * Never modify this file.
 */

export const migration = {
  id:           '004_merge_framework_soft_delete',
  dexieVersion:  4,
  description:  'Product merge framework, soft delete utility, mergedIntoId index on Products.',
  appliedAt:    null,
};
