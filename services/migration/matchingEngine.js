/**
 * DGLOPA PLATFORM — IME — MATCHING ENGINE
 * Matches workbook rows against existing Products and Suppliers.
 * NEVER creates records — read-only matching against the live database.
 *
 * Product matching strategy (priority order):
 *   1. Exact normalized composite match (name + strength + dosageForm)
 *      against Products.normalizedName — same key used for duplicate
 *      detection in the Product Master (DT-002).
 *   2. Alias resolution — checks ProductAliases for an exact alias match
 *      on productName (handles "Panadol" -> PRD for "Paracetamol").
 *   3. Fuzzy fallback — normalized productName match alone (ignoring
 *      strength/form) when no exact composite or alias match is found.
 *      Returned as a lower-confidence match for manual review.
 *
 * Supplier matching strategy:
 *   1. Exact case-insensitive name match against Suppliers.supplierName.
 *   2. Fuzzy fallback — substring match, flagged lower-confidence.
 */

import { db } from '../../db/database.js';
import { buildDedupKey, normalizeName } from '../../utils/normalizer.js';
import { resolveAlias } from '../aliasService.js';

// ================================================================
// PRODUCT MATCHING
// ================================================================

/**
 * Match a single normalized row against the Products table.
 * @param {NormalizedRow} row
 * @returns {Promise<MatchResult>}
 */
export async function matchProduct(row) {
  if (!row.productName?.trim()) {
    return _noMatch(row._rowIndex);
  }

  // 1. Exact composite match (name + strength + dosageForm)
  const compositeKey = buildDedupKey(row.productName, row.strength, row.dosageForm);
  const exact = await db.Products.where('normalizedName').equals(compositeKey).first();
  if (exact && exact.lifecycleStatus !== 'Merged') {
    return _match(row._rowIndex, 'exact', exact);
  }
  if (exact && exact.lifecycleStatus === 'Merged' && exact.mergedIntoId) {
    const survivor = await db.Products.get(exact.mergedIntoId);
    if (survivor) return _match(row._rowIndex, 'exact', survivor);
  }

  // 2. Alias resolution
  const aliasProductId = await resolveAlias(row.productName);
  if (aliasProductId) {
    const aliasProduct = await db.Products.get(aliasProductId);
    if (aliasProduct && aliasProduct.lifecycleStatus !== 'Merged') {
      return _match(row._rowIndex, 'alias', aliasProduct);
    }
  }

  // 3. Fuzzy fallback — name only, ignoring strength/form/brand
  const nameOnlyKey = normalizeName(row.productName);
  const allProducts = await db.Products.where('lifecycleStatus').noneOf(['Merged']).toArray();

  const fuzzy = allProducts.find((p) => {
    const pNameKey = normalizeName(p.productName);
    return pNameKey === nameOnlyKey ||
           pNameKey.includes(nameOnlyKey) ||
           nameOnlyKey.includes(pNameKey);
  });
  if (fuzzy) return _match(row._rowIndex, 'fuzzy', fuzzy);

  // Brand as a secondary fuzzy signal
  if (row.brand?.trim()) {
    const brandKey = normalizeName(row.brand);
    const brandMatch = allProducts.find((p) => brandKey !== '' && normalizeName(p.brand || '') === brandKey);
    if (brandMatch) return _match(row._rowIndex, 'fuzzy', brandMatch);
  }

  return _noMatch(row._rowIndex);
}

/**
 * Match an array of normalized rows against Products in bulk.
 * @param {NormalizedRow[]} rows
 * @returns {Promise<MatchResult[]>}
 */
export async function matchProducts(rows) {
  const results = [];
  for (const row of rows) results.push(await matchProduct(row));
  return results;
}

function _match(rowIndex, confidence, product) {
  return { rowIndex, matched: true, confidence, productId: product.id, productName: product.productName };
}

function _noMatch(rowIndex) {
  return { rowIndex, matched: false, confidence: 'none', productId: null, productName: null };
}

// ================================================================
// SUPPLIER MATCHING
// ================================================================

export async function matchSupplier(row) {
  if (!row.supplierName?.trim()) {
    return { rowIndex: row._rowIndex, matched: false, confidence: 'none', supplierId: null, supplierName: null };
  }

  const inputKey = row.supplierName.trim().toLowerCase();
  const allSuppliers = await db.Suppliers.where('status').equals('Active').toArray();

  const exact = allSuppliers.find((s) => s.supplierName?.trim().toLowerCase() === inputKey);
  if (exact) {
    return { rowIndex: row._rowIndex, matched: true, confidence: 'exact', supplierId: exact.id, supplierName: exact.supplierName };
  }

  const fuzzy = allSuppliers.find((s) => {
    const sKey = s.supplierName?.trim().toLowerCase() || '';
    return sKey !== '' && (sKey.includes(inputKey) || inputKey.includes(sKey));
  });
  if (fuzzy) {
    return { rowIndex: row._rowIndex, matched: true, confidence: 'fuzzy', supplierId: fuzzy.id, supplierName: fuzzy.supplierName };
  }

  return { rowIndex: row._rowIndex, matched: false, confidence: 'none', supplierId: null, supplierName: null };
}

export async function matchSuppliers(rows) {
  const results = [];
  for (const row of rows) results.push(await matchSupplier(row));
  return results;
}
