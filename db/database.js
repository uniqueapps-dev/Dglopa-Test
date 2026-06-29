/**
 * DGLOPA PLATFORM — DATABASE ENGINE
 * Dexie.js IndexedDB wrapper
 * Version-controlled schema — add new versions below, never modify past ones.
 *
 * ID STRATEGY (DT-002):
 *   All primary keys are application-generated immutable strings (PRD-000001 etc).
 *   Stored in the `id` field. Dexie indexes `id` as the primary key with `&id`
 *   (unique, non-auto-increment). The application always sets `id` before put().
 */

import Dexie from 'https://cdn.jsdelivr.net/npm/dexie@3.2.7/dist/dexie.mjs';

class DglopaDB extends Dexie {
  constructor() {
    super('DglopaDB');

    // ============================================================
    // VERSION 1 — Foundation (DT-001)
    // Kept verbatim — never edit released versions.
    // ============================================================
    this.version(1).stores({
      Products:
        '++id, &barcode, name, genericName, category, supplierId, isActive, createdAt, updatedAt',
      InventoryLots:
        '++id, productId, batchNumber, expiryDate, supplierId, invoiceId, createdAt',
      Suppliers:
        '++id, &code, name, phone, isActive, createdAt, updatedAt',
      SupplierInvoices:
        '++id, supplierId, invoiceNumber, invoiceDate, status, createdAt',
      Sales:
        '++id, receiptNumber, saleDate, staffId, paymentMethod, status, createdAt',
      SaleLines:
        '++id, saleId, productId, lotId, createdAt',
      StockMovements:
        '++id, productId, lotId, type, referenceId, referenceType, createdAt',
      Demand:
        '++id, productId, loggedAt, source, createdAt',
      Payments:
        '++id, referenceId, referenceType, method, status, createdAt',
      PurchaseHistory:
        '++id, productId, supplierId, invoiceId, purchaseDate',
      PriceHistory:
        '++id, productId, effectiveDate, changedBy',
      ReviewQueue:
        '++id, productId, reason, priority, status, createdAt, resolvedAt',
      Settings:
        '&key, updatedAt',
      AuditLog:
        '++id, entity, entityId, action, performedBy, performedAt',
    });

    // ============================================================
    // VERSION 2 — Product Master (DT-002)
    //
    // Key changes:
    //   • Products: drop &barcode unique constraint; switch to &id
    //     (app-generated PRD-NNNNNN). Add full product master fields.
    //     normalizedName added for duplicate detection.
    //   • Suppliers: switch to &id (SUP-NNNNNN). Full supplier schema.
    //   • InventoryLots: switch to &id (LOT-NNNNNN). Full lot schema.
    //   • StockMovements: switch to &id (MOV-NNNNNN). Full movement schema.
    //   • PurchaseHistory: switch to &id (PUR-NNNNNN). Full schema.
    //   • ReviewQueue: switch to &id (REV-NNNNNN). Full schema.
    //   • Sales / SaleLines / Demand / Payments: ids become app-generated
    //     (implementation in their respective milestone tickets).
    //   • Barcodes table created (empty) — future multi-barcode per product.
    // ============================================================
    this.version(2).stores({
      // App-managed immutable ID. normalizedName supports dedup search.
      Products: [
        '&id',
        'normalizedName',
        'productName',
        'genericName',
        'brand',
        'dosageForm',
        'category',
        'lifecycleStatus',
        'preferredSupplierId',
        'createdAt',
        'updatedAt',
      ].join(', '),

      // No unique barcode constraint — future Barcodes table handles this.
      Barcodes:
        '++_rowid, &barcode, productId',

      InventoryLots: [
        '&id',
        'productId',
        'supplierId',
        'invoiceId',
        'expiryDate',
        'status',
        'ownerType',
        'createdAt',
      ].join(', '),

      Suppliers: [
        '&id',
        'supplierName',
        'status',
        'paymentMethod',
        'createdAt',
        'updatedAt',
      ].join(', '),

      SupplierInvoices:
        '&id, supplierId, invoiceNumber, invoiceDate, status, createdAt',

      Sales:
        '&id, receiptNumber, saleDate, staffId, paymentMethod, status, createdAt',

      SaleLines:
        '++_rowid, saleId, productId, lotId, createdAt',

      StockMovements: [
        '&id',
        'productId',
        'lotId',
        'movementType',
        'timestamp',
      ].join(', '),

      Demand:
        '&id, productId, loggedAt, source, createdAt',

      Payments:
        '&id, referenceId, referenceType, method, status, createdAt',

      PurchaseHistory: [
        '&id',
        'productId',
        'supplierId',
        'invoiceNumber',
        'purchaseDate',
      ].join(', '),

      PriceHistory:
        '++_rowid, productId, effectiveDate, changedBy',

      ReviewQueue: [
        '&id',
        'category',
        'severity',
        'status',
        'dueDate',
        'assignedTo',
        'createdAt',
      ].join(', '),

      Settings:
        '&key, updatedAt',

      AuditLog:
        '++_rowid, entity, entityId, action, performedBy, performedAt',
    });
  }
}

// ---- Singleton ----
const db = new DglopaDB();

// ---- Lifecycle ----
export async function openDB() {
  try {
    await db.open();
    await _recordMigrations();
    console.info('[DB] DglopaDB opened — version', db.verno);
    return db;
  } catch (err) {
    console.error('[DB] Failed to open:', err);
    throw err;
  }
}

/**
 * Record which migrations have been applied (informational audit trail).
 */
async function _recordMigrations() {
  const migrations = [
    { id: '001_initial',        dexieVersion: 1 },
    { id: '002_product_master', dexieVersion: 2 },
  ];
  for (const m of migrations) {
    if (db.verno >= m.dexieVersion) {
      const existing = await db.Settings.get(`migration_${m.id}`);
      if (!existing) {
        await db.Settings.put({
          key:       `migration_${m.id}`,
          value:     m.id,
          appliedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  }
}

export async function getDBVersion()     { return db.verno; }
export async function exportDBSnapshot() { throw new Error('Export not yet implemented'); }
export async function importDBSnapshot() { throw new Error('Import not yet implemented'); }

export { db };
