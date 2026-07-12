/**
 * DGLOPA PLATFORM — SUPPLIER SERVICE
 * DT-005: Supplier Relationship Management.
 *
 * No new schema version required — Supplier table exists since v2.
 * Additional fields (tradingName, contactPerson, email, address,
 * creditLimit, etc.) are written as plain fields on existing records.
 * Performance framework fields stored as null placeholders.
 *
 * Suppliers that have historical transactions are NEVER permanently deleted.
 * Archive/restore via softDelete utility (same pattern as Products).
 */

import { db }           from '../db/database.js';
import { nextId }       from '../utils/idGenerator.js';
import { archiveRecord, restoreRecord, markMerged } from './softDelete.js';

// ================================================================
// CONSTANTS
// ================================================================

export const PAYMENT_METHODS = Object.freeze([
  'Pay Before Supply',
  'Pay On Delivery',
  'Credit',
]);

export const ORDERING_METHODS = Object.freeze([
  'WhatsApp',
  'Phone',
  'Email',
  'Sales Representative',
  'Portal',
]);

// ================================================================
// VALIDATION
// ================================================================

export function validateSupplier(data) {
  const errors = [];
  if (!data.supplierName?.trim()) errors.push('Supplier Name is required.');
  return { valid: errors.length === 0, errors };
}

// ================================================================
// CREATE
// ================================================================

/**
 * Create a new supplier.
 * @param {object} data
 * @returns {Promise<string>} SUP-NNNNNN id
 */
export async function createSupplier(data) {
  const { valid, errors } = validateSupplier(data);
  if (!valid) throw new Error(errors.join(' '));

  // Duplicate name check
  const dup = await findSupplierByName(data.supplierName);
  if (dup) throw new Error(`A supplier named "${dup.supplierName}" (${dup.id}) already exists.`);

  const id  = await nextId('Supplier');
  const now = Date.now();

  await db.Suppliers.add({
    id,
    // Identity
    supplierName:   data.supplierName.trim(),
    tradingName:    data.tradingName?.trim()    || '',
    contactPerson:  data.contactPerson?.trim()  || '',
    phone:          data.phone?.trim()          || '',
    whatsApp:       data.whatsApp?.trim()       || '',
    email:          data.email?.trim()          || '',
    address:        data.address?.trim()        || '',
    city:           data.city?.trim()           || '',
    state:          data.state?.trim()          || '',
    country:        data.country?.trim()        || 'Nigeria',
    // Commercial
    paymentMethod:  data.paymentMethod          || 'Pay On Delivery',
    advancePaymentPercentage: data.advancePaymentPercentage ?? null,
    creditDays:     data.creditDays             ?? null,
    creditLimit:    data.creditLimit            ?? null,
    settlementDay:  data.settlementDay?.trim()  || '',
    preferredOrderingMethod: data.preferredOrderingMethod || 'WhatsApp',
    minimumOrderValue: data.minimumOrderValue   ?? null,
    leadTime:       data.leadTime               ?? null,
    preferredSupplier: data.preferredSupplier   ?? false,
    // Status
    status:         'Active',
    notes:          data.notes?.trim()          || '',
    // Performance framework placeholders (DT-005: structure only, no algorithm)
    deliveryReliability: null,
    priceStability:      null,
    invoiceAccuracy:     null,
    availability:        null,
    responseTime:        null,
    relationshipScore:   null,
    // Merge fields
    mergedIntoId:   null,
    mergedDate:     null,
    mergedReason:   null,
    createdAt:      now,
    updatedAt:      now,
  });

  return id;
}

// ================================================================
// UPDATE
// ================================================================

export async function updateSupplier(id, data) {
  const existing = await db.Suppliers.get(id);
  if (!existing) throw new Error(`Supplier not found: ${id}`);
  if (existing.status === 'Merged') throw new Error('Cannot edit a merged supplier.');

  const merged = { ...existing, ...data };
  const { valid, errors } = validateSupplier(merged);
  if (!valid) throw new Error(errors.join(' '));

  // Duplicate name check (exclude self)
  if (data.supplierName && data.supplierName.trim() !== existing.supplierName) {
    const dup = await findSupplierByName(data.supplierName);
    if (dup && dup.id !== id) throw new Error(`A supplier named "${dup.supplierName}" (${dup.id}) already exists.`);
  }

  await db.Suppliers.update(id, {
    ...data,
    supplierName: (data.supplierName || existing.supplierName).trim(),
    updatedAt:    Date.now(),
  });
}

// ================================================================
// ARCHIVE / RESTORE
// ================================================================

export async function archiveSupplier(id) {
  const s = await db.Suppliers.get(id);
  if (!s) throw new Error(`Supplier not found: ${id}`);
  if (s.status === 'Merged') throw new Error('Cannot archive a merged supplier.');
  await archiveRecord('Suppliers', id);
}

export async function restoreSupplier(id) {
  const s = await db.Suppliers.get(id);
  if (!s) throw new Error(`Supplier not found: ${id}`);
  await restoreRecord('Suppliers', id);
}

// ================================================================
// MERGE
// ================================================================

/**
 * Merge a dead supplier into a surviving supplier.
 * Transfers all PurchaseHistory, ReceivingSessions, and InventoryLots
 * from the dead supplier to the survivor.
 * Dead supplier is marked Merged — never deleted.
 *
 * @param {string} deadId
 * @param {string} survivorId
 * @param {string} [reason]
 */
export async function mergeSuppliers(deadId, survivorId, reason = '') {
  if (deadId === survivorId) throw new Error('Cannot merge a supplier into itself.');
  const [dead, survivor] = await Promise.all([
    db.Suppliers.get(deadId),
    db.Suppliers.get(survivorId),
  ]);
  if (!dead)     throw new Error(`Dead supplier not found: ${deadId}`);
  if (!survivor) throw new Error(`Survivor supplier not found: ${survivorId}`);
  if (dead.status === 'Merged') throw new Error(`Supplier ${deadId} is already merged.`);

  const now = Date.now();

  await db.transaction('rw', [
    db.Suppliers, db.PurchaseHistory, db.ReceivingSessions,
    db.InventoryLots, db.AuditLog,
  ], async () => {
    // Transfer PurchaseHistory
    const purchases = await db.PurchaseHistory.where('supplierId').equals(deadId).toArray();
    for (const p of purchases) {
      await db.PurchaseHistory.update(p.id, {
        supplierId:          survivorId,
        _originalSupplierId: p._originalSupplierId ?? deadId,
        _transferredAt:      now,
      });
    }

    // Transfer ReceivingSessions
    const sessions = await db.ReceivingSessions.where('supplierId').equals(deadId).toArray();
    for (const s of sessions) {
      await db.ReceivingSessions.update(s.id, {
        supplierId:          survivorId,
        _originalSupplierId: s._originalSupplierId ?? deadId,
        _transferredAt:      now,
      });
    }

    // Transfer InventoryLots
    const lots = await db.InventoryLots.where('supplierId').equals(deadId).toArray();
    for (const l of lots) {
      await db.InventoryLots.update(l.id, {
        supplierId:          survivorId,
        _originalSupplierId: l._originalSupplierId ?? deadId,
        _transferredAt:      now,
      });
    }

    // Mark dead supplier as Merged
    await db.Suppliers.update(deadId, {
      status:       'Merged',
      mergedIntoId: survivorId,
      mergedDate:   now,
      mergedReason: reason || '',
      updatedAt:    now,
    });

    // AuditLog
    await db.AuditLog.add({
      entity:      'Suppliers',
      entityId:    deadId,
      action:      'MERGE',
      detail:      { survivorId, reason, transferredPurchases: purchases.length, transferredLots: lots.length },
      performedBy: 'system',
      performedAt: now,
    });
  });
}

// ================================================================
// READ
// ================================================================

export async function getSupplier(id)   { return db.Suppliers.get(id); }
export async function getAllSuppliers()  { return db.Suppliers.orderBy('supplierName').toArray(); }

export async function searchSuppliers({ query = '', statusFilter = 'Active' } = {}) {
  const q = query.trim().toLowerCase();

  let results = statusFilter && statusFilter !== 'All'
    ? await db.Suppliers.where('status').equals(statusFilter).toArray()
    : await db.Suppliers.toArray();

  // Exclude merged from 'All' view
  if (statusFilter === 'All') results = results.filter((s) => s.status !== 'Merged');

  if (q) {
    results = results.filter((s) =>
      s.supplierName?.toLowerCase().includes(q)  ||
      s.tradingName?.toLowerCase().includes(q)   ||
      s.contactPerson?.toLowerCase().includes(q) ||
      s.phone?.toLowerCase().includes(q)         ||
      s.city?.toLowerCase().includes(q)
    );
  }

  results.sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  return results.slice(0, 200);
}

export async function findSupplierByName(name) {
  if (!name?.trim()) return null;
  const key = name.trim().toLowerCase();
  const all = await db.Suppliers.toArray();
  return all.find((s) => s.supplierName?.trim().toLowerCase() === key) || null;
}

export async function getPreferredSuppliers() {
  return db.Suppliers.where('status').equals('Active')
    .filter((s) => s.preferredSupplier === true)
    .toArray();
}

// ================================================================
// RELATIONSHIP SUMMARY (computed at read time, not stored)
// ================================================================

/**
 * Compute the commercial relationship summary for a supplier.
 * All values derived from existing tables — no denormalized store.
 *
 * @param {string} supplierId
 * @returns {Promise<RelationshipSummary>}
 */
export async function getRelationshipSummary(supplierId) {
  const [purchases, sessions, lots] = await Promise.all([
    db.PurchaseHistory.where('supplierId').equals(supplierId).toArray(),
    db.ReceivingSessions.where('supplierId').equals(supplierId).toArray(),
    db.InventoryLots.where('supplierId').equals(supplierId).toArray(),
  ]);

  const totalPurchaseValue = purchases.reduce((sum, p) => {
    return sum + ((p.quantity ?? 0) * (p.unitCost ?? 0));
  }, 0);

  const purchaseDates  = purchases.map((p) => p.purchaseDate).filter(Boolean);
  const firstPurchase  = purchaseDates.length ? Math.min(...purchaseDates) : null;
  const lastPurchase   = purchaseDates.length ? Math.max(...purchaseDates) : null;

  const sessionDates   = sessions.map((s) => s.receivedDate).filter(Boolean);
  const lastDelivery   = sessionDates.length ? Math.max(...sessionDates) : null;

  // Unique products supplied
  const productIds     = new Set(purchases.map((p) => p.productId).filter(Boolean));

  // Average invoice value (per session)
  const completedSessions = sessions.filter((s) => s.status === 'Completed');
  const avgInvoiceValue   = completedSessions.length > 0
    ? totalPurchaseValue / completedSessions.length
    : null;

  // Credit utilization (placeholder — payment tracking not yet implemented)
  const supplier = await db.Suppliers.get(supplierId);
  const creditLimit = supplier?.creditLimit ?? null;

  return {
    supplierId,
    purchaseCount:       purchases.length,
    sessionCount:        completedSessions.length,
    totalPurchaseValue,
    avgInvoiceValue,
    productCount:        productIds.size,
    firstPurchase,
    lastPurchase,
    lastDelivery,
    creditLimit,
    outstandingCredit:   null,  // DT-005: placeholder — payment tracking future ticket
    availableCredit:     creditLimit != null ? creditLimit : null,
    // Performance placeholders
    deliveryReliability: null,
    priceStability:      null,
    invoiceAccuracy:     null,
    availability:        null,
    responseTime:        null,
    relationshipScore:   null,
  };
}

// ================================================================
// PRODUCT RELATIONSHIPS
// ================================================================

/**
 * Get all products supplied by a given supplier (from PurchaseHistory).
 * Returns unique products with last cost and last purchase date.
 */
export async function getProductsForSupplier(supplierId) {
  const purchases = await db.PurchaseHistory
    .where('supplierId').equals(supplierId)
    .toArray();

  // Group by productId, keep most recent
  const byProduct = new Map();
  for (const p of purchases) {
    if (!p.productId) continue;
    const existing = byProduct.get(p.productId);
    if (!existing || p.purchaseDate > existing.purchaseDate) {
      byProduct.set(p.productId, p);
    }
  }

  const results = [];
  for (const [productId, purchase] of byProduct.entries()) {
    const product = await db.Products.get(productId);
    if (product) {
      results.push({
        productId,
        productName:   product.productName,
        lifecycleStatus: product.lifecycleStatus,
        lastCost:      purchase.unitCost,
        lastPurchased: purchase.purchaseDate,
      });
    }
  }

  results.sort((a, b) => a.productName.localeCompare(b.productName));
  return results;
}

/**
 * Get the supplier count summary for the dashboard card.
 */
export async function getSupplierCounts() {
  const all = await db.Suppliers.toArray();
  return {
    active:   all.filter((s) => s.status === 'Active').length,
    archived: all.filter((s) => s.status === 'Archived').length,
    merged:   all.filter((s) => s.status === 'Merged').length,
    total:    all.filter((s) => s.status !== 'Merged').length,
  };
}
