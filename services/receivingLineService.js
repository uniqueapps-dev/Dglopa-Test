/**
 * DGLOPA PLATFORM — RECEIVING LINE SERVICE
 * DT-004: Validates, matches, and manages individual invoice line items
 * within a receiving session.
 *
 * A ReceivingLine is an in-memory object during the session.
 * It is NOT persisted as its own table — lines become InventoryLots
 * on commit, and unresolved lines become ReviewQueue entries.
 *
 * Matching chain (same as IME matching engine, reused without duplication):
 *   1. Exact normalizedName composite (name + strength + form)
 *   2. Alias resolution via aliasService
 *   3. Fuzzy name-only match
 *   4. Unresolved → route to Review Queue
 */

import { db }           from '../db/database.js';
import { buildDedupKey, normalizeName } from '../utils/normalizer.js';
import { resolveAlias } from './aliasService.js';
import { splitQuantity, canonicalUnit } from '../utils/quantitySplitter.js';

// ================================================================
// MATCHING
// ================================================================

/**
 * Attempt to match a product name to an existing Product record.
 * Returns { productId, productName, confidence } or null if unresolved.
 *
 * @param {string} rawName
 * @param {string} [strength]
 * @param {string} [dosageForm]
 */
export async function matchProductForLine(rawName, strength = '', dosageForm = '') {
  if (!rawName?.trim()) return null;

  // 1. Exact composite
  const key   = buildDedupKey(rawName, strength, dosageForm);
  const exact = await db.Products.where('normalizedName').equals(key).first();
  if (exact && exact.lifecycleStatus !== 'Merged') {
    return { productId: exact.id, productName: exact.productName, confidence: 'exact' };
  }
  if (exact?.lifecycleStatus === 'Merged' && exact.mergedIntoId) {
    const s = await db.Products.get(exact.mergedIntoId);
    if (s) return { productId: s.id, productName: s.productName, confidence: 'exact' };
  }

  // 2. Alias resolution
  const aliasId = await resolveAlias(rawName);
  if (aliasId) {
    const ap = await db.Products.get(aliasId);
    if (ap && ap.lifecycleStatus !== 'Merged') {
      return { productId: ap.id, productName: ap.productName, confidence: 'alias' };
    }
  }

  // 3. Fuzzy name-only
  const nameKey = normalizeName(rawName);
  const all     = await db.Products.where('lifecycleStatus').noneOf(['Merged', 'Archived']).toArray();
  const fuzzy   = all.find((p) => {
    const pk = normalizeName(p.productName);
    return pk === nameKey || pk.includes(nameKey) || nameKey.includes(pk);
  });
  if (fuzzy) {
    return { productId: fuzzy.id, productName: fuzzy.productName, confidence: 'fuzzy' };
  }

  return null; // Unresolved → will route to Review Queue
}

/**
 * Match a supplier name to an existing Supplier record.
 * Returns { supplierId, supplierName, confidence } or null.
 */
export async function matchSupplierForLine(rawName) {
  if (!rawName?.trim()) return null;
  const key = rawName.trim().toLowerCase();
  const all = await db.Suppliers.where('status').equals('Active').toArray();
  const exact = all.find((s) => s.supplierName?.trim().toLowerCase() === key);
  if (exact) return { supplierId: exact.id, supplierName: exact.supplierName, confidence: 'exact' };
  const fuzzy = all.find((s) => {
    const sk = s.supplierName?.trim().toLowerCase() || '';
    return sk !== '' && (sk.includes(key) || key.includes(sk));
  });
  if (fuzzy) return { supplierId: fuzzy.id, supplierName: fuzzy.supplierName, confidence: 'fuzzy' };
  return null;
}

// ================================================================
// VALIDATION
// ================================================================

/**
 * Validate a single receiving line and populate reviewReasons.
 * Does NOT block — routes issues to reviewReasons array.
 *
 * @param {object} lineData — raw form values
 * @returns {ReceivingLine}
 */
export async function validateLine(lineData, sessionId, lineNumber) {
  const { quantity: parsedQty, unitHint } = splitQuantity(lineData.quantity);
  const reviewReasons = [];

  // Product
  let productMatch = null;
  if (lineData.productName?.trim()) {
    productMatch = await matchProductForLine(
      lineData.productName, lineData.strength, lineData.dosageForm
    );
    if (!productMatch) reviewReasons.push('Unknown product — not found in Product Master');
  } else {
    reviewReasons.push('Product name is required');
  }

  // Quantity
  const quantity = parsedQty ?? lineData.quantity;
  if (quantity == null || quantity <= 0) {
    reviewReasons.push('Invalid or missing quantity');
  }

  // Cost
  if (lineData.unitCost == null || isNaN(lineData.unitCost)) {
    reviewReasons.push('Missing cost price');
  }

  // Expiry
  if (!lineData.expiryDate) {
    reviewReasons.push('Missing expiry date');
  }

  // Duplicate batch detection within session
  if (lineData.batchNumber?.trim() && lineData.productName?.trim()) {
    const existing = await db.InventoryLots
      .where('productId').equals(productMatch?.productId || '')
      .and((l) => l.batchNumber?.trim().toLowerCase() === lineData.batchNumber.trim().toLowerCase())
      .first();
    if (existing) {
      reviewReasons.push(`Duplicate batch number "${lineData.batchNumber}" — already exists for this product`);
    }
  }

  return {
    sessionId,
    lineNumber,
    productId:     productMatch?.productId   || null,
    productName:   lineData.productName?.trim()  || '',
    matchedName:   productMatch?.productName || null,
    confidence:    productMatch?.confidence  || 'none',
    supplierId:    lineData.supplierId       || null,
    batchNumber:   lineData.batchNumber?.trim() || '',
    expiryDate:    lineData.expiryDate       || null,
    quantity:      quantity                  || 0,
    unit:          canonicalUnit(lineData.unit || '') || unitHint || '',
    unitCost:      lineData.unitCost != null ? Number(lineData.unitCost)   : null,
    sellingPrice:  lineData.sellingPrice != null ? Number(lineData.sellingPrice) : null,
    shelfLocation: lineData.shelfLocation?.trim() || '',
    ownerType:     lineData.ownerType        || 'Owner',
    notes:         lineData.notes?.trim()    || '',
    reviewReasons,
  };
}

// ================================================================
// FEFO SORT
// ================================================================

/**
 * Sort an array of InventoryLots in FEFO order (earliest expiry first).
 * Lots with no expiry date sort to the end.
 */
export function sortFEFO(lots) {
  return [...lots].sort((a, b) => {
    if (a.expiryDate == null && b.expiryDate == null) return 0;
    if (a.expiryDate == null) return 1;
    if (b.expiryDate == null) return -1;
    return a.expiryDate - b.expiryDate;
  });
}

/**
 * Get all active InventoryLots for a product, FEFO-sorted.
 */
export async function getLotsForProduct(productId) {
  const lots = await db.InventoryLots
    .where('productId').equals(productId)
    .and((l) => l.quantityAvailable > 0 && l.status !== 'Expired')
    .toArray();
  return sortFEFO(lots);
}
