/**
 * DGLOPA PLATFORM — DATABASE ENGINE
 * Dexie.js IndexedDB wrapper
 * Version-controlled schema — add new versions below, never modify past ones
 */

import Dexie from 'https://cdn.jsdelivr.net/npm/dexie@3.2.7/dist/dexie.mjs';

class DglopaDB extends Dexie {
  constructor() {
    super('DglopaDB');

    // --------------------------------------------------------
    // VERSION 1 — Foundation schema
    // All tables created empty. No business logic.
    // Future tickets add columns and indexes via new versions.
    // --------------------------------------------------------
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
  }
}

// Singleton instance
const db = new DglopaDB();

// --------------------------------------------------------
// DB Lifecycle helpers
// --------------------------------------------------------

export async function openDB() {
  try {
    await db.open();
    console.info('[DB] DglopaDB opened — version', db.verno);
    return db;
  } catch (err) {
    console.error('[DB] Failed to open:', err);
    throw err;
  }
}

export async function getDBVersion() {
  return db.verno;
}

export async function exportDBSnapshot() {
  // Placeholder — implemented in a future ticket
  throw new Error('Export not yet implemented');
}

export async function importDBSnapshot() {
  // Placeholder — implemented in a future ticket
  throw new Error('Import not yet implemented');
}

export { db };
