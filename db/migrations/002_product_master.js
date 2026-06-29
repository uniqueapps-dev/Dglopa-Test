/**
 * MIGRATION 002 — product_master
 * DT-002: Upgrade schemas for Products, Suppliers, InventoryLots,
 *         StockMovements, PurchaseHistory, ReviewQueue.
 * Drop unique barcode constraint from Products.
 * Switch to prefixed immutable IDs (managed by application layer).
 * Never modify this file.
 */

export const migration = {
  id:           '002_product_master',
  dexieVersion:  2,
  description:  'Full schema upgrade: Products, Suppliers, Lots, Movements, PurchaseHistory, ReviewQueue. Immutable ID strategy.',
  appliedAt:    null,
};
