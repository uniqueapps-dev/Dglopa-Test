/**
 * MIGRATION 005 — import_audit
 * DT-003B: ImportAudit table — one record per completed import batch.
 * Fields: id (IMP-NNNNNN), workbookName, workbookType, importDate,
 *   duration, rowsRead, rowsImported, rowsUpdated, rowsSkipped,
 *   rowsReviewed, rowsFailed, overallResult, imeVersion,
 *   businessRulesVersion, user, notes.
 * Never modify this file.
 */

export const migration = {
  id:           '005_import_audit',
  dexieVersion:  5,
  description:  'ImportAudit table for tracking every import batch result.',
  appliedAt:    null,
};
