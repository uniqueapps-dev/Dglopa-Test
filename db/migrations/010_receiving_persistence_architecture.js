/**
 * MIGRATION 010 — receiving_persistence_architecture (RPA-001)
 *
 * WHAT THIS MIGRATION DOES:
 *   Upgrades ReceivingLines (v9) to include status and updatedAt indexes.
 *   Creates ReceivingAttachments table.
 *
 * WHY:
 *   ReceivingLines is now the SINGLE SOURCE OF TRUTH for invoice lines.
 *   status enables soft archival (lines are never physically deleted).
 *   updatedAt enables sync and analytics.
 *   ReceivingAttachments is prepared for OCR invoice capture and supplier
 *   dispute documentation — no UI yet, architecture only.
 *
 * BACKWARD COMPATIBILITY:
 *   Existing ReceivingLines rows from v9 (if any exist) receive status: null.
 *   The getLinesForSession() function filters by status; passing null status
 *   filter returns all rows. Existing rows will render correctly.
 *   No data is deleted or modified.
 *
 * NEVER MODIFY AFTER DEPLOYMENT.
 */

export const MIGRATION_010 = {
  id:           '010_receiving_persistence_architecture',
  dexieVersion:  10,
  description:  'ReceivingLines upgraded with status + updatedAt; ReceivingAttachments created.',
};
