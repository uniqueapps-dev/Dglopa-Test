/**
 * MIGRATION 009 — receiving_lines_persistence (DT-004-v9)
 *
 * Adds the ReceivingLines table.
 *
 * WHY THIS MIGRATION EXISTS:
 *   Prior to v9, invoice lines entered during a receiving session were
 *   stored only in a module-level JavaScript array (_lines) in
 *   receivingSession.js. This array was reset to [] on every call to
 *   renderSessionScreen(), which meant that navigating Back then
 *   reopening a session always showed "No lines yet" regardless of
 *   how many lines had been entered. (BLOCKER-003 / BLOCKER-004)
 *
 * WHAT THIS MIGRATION DOES:
 *   Creates ReceivingLines table: '&id, sessionId, lineNumber, createdAt'
 *   No data migration is needed — in-memory lines from prior sessions
 *   were never persisted; any open session without persisted lines will
 *   show as empty and the pharmacist must re-enter the lines.
 *
 * BACKWARD COMPATIBILITY:
 *   Existing completed sessions are unaffected (their lines became
 *   InventoryLots at commit time). Only open/draft sessions lose their
 *   in-progress lines, which is an acceptable consequence of the prior
 *   non-persistence design.
 *
 * NEVER MODIFY THIS FILE AFTER DEPLOYMENT.
 */

export const MIGRATION_009 = {
  id:           '009_receiving_lines_persistence',
  dexieVersion:  9,
  description:  'ReceivingLines table — persists invoice lines across navigation events.',
};
