/**
 * MIGRATION 003 — product_master_enhancements
 * DT-002A: ProductAliases table, Units/DosageForms/Categories lookup tables,
 *          imageURL/thumbnailURL on Products, extended LifecycleStatus values.
 * Lookup tables seeded via runMigration003() in database.js (idempotent).
 * Never modify this file.
 */

export const migration = {
  id:           '003_product_master_enhancements',
  dexieVersion:  3,
  description:  'ProductAliases, lookup tables (Units/DosageForms/Categories), image fields, extended lifecycle.',
  appliedAt:    null,
};
