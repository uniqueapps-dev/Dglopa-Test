/**
 * DGLOPA PLATFORM — PRODUCT SERVICE
 * DT-002B: Lifecycle extended with 'Merged'; archive/restore delegate
 *          to softDelete utility for consistent audit trail.
 */

import { db }            from '../db/database.js';
import { createProfile }  from './commercialProfileService.js';
import { nextId }        from '../utils/idGenerator.js';
import { buildDedupKey } from '../utils/normalizer.js';
import { archiveRecord, restoreRecord } from './softDelete.js';

// Canonical lifecycle values — Products only (DT-002B adds Merged)
export const LIFECYCLE_STATUSES = [
  'Trial',
  'Active',
  'Slow Moving',
  'Sleeping',
  'Discontinued',
  'Archived',
  'Merged',      // DT-002B: set by ProductMergeService; not user-selectable in the form
];

// Values visible in the Product Master form (excludes Merged — system-only)
export const SELECTABLE_LIFECYCLE_STATUSES = LIFECYCLE_STATUSES.filter((s) => s !== 'Merged');

// ================================================================
// VALIDATION
// ================================================================

export function validateProduct(data) {
  const errors = [];
  if (!data.productName?.trim()) errors.push('Product Name is required.');
  if (!data.dosageForm?.trim())  errors.push('Dosage Form is required.');
  if (!data.baseUnit?.trim())    errors.push('Base Unit is required.');
  return { valid: errors.length === 0, errors };
}

// ================================================================
// DUPLICATE DETECTION
// ================================================================

export async function findDuplicate(productName, strength, dosageForm, excludeId = null) {
  const key = buildDedupKey(productName, strength, dosageForm);
  const match = await db.Products.where('normalizedName').equals(key).first();
  if (!match) return null;
  if (excludeId && match.id === excludeId) return null;
  return match;
}

// ================================================================
// CREATE
// ================================================================

export async function createProduct(data) {
  const { valid, errors } = validateProduct(data);
  if (!valid) throw new Error(errors.join(' '));

  const dup = await findDuplicate(data.productName, data.strength, data.dosageForm);
  if (dup) throw new Error(`Duplicate detected: "${dup.productName}" (${dup.id}) has the same name, strength, and form.`);

  const id  = await nextId('Product');
  const now = Date.now();

  await db.Products.add({
    id,
    productName:         data.productName.trim(),
    normalizedName:      buildDedupKey(data.productName, data.strength, data.dosageForm),
    genericName:         data.genericName?.trim()    || '',
    brand:               data.brand?.trim()          || '',
    strength:            data.strength?.trim()       || '',
    dosageForm:          data.dosageForm.trim(),
    category:            data.category?.trim()       || '',
    baseUnit:            data.baseUnit.trim(),
    receivingUnits:      data.receivingUnits?.trim() || '',
    sellingUnits:        data.sellingUnits?.trim()   || '',
    lifecycleStatus:     data.lifecycleStatus        || 'Active',
    healthScore:         null,
    preferredSupplierId: data.preferredSupplierId    || null,
    notes:               data.notes?.trim()          || '',
    imageURL:            data.imageURL?.trim()       || null,
    thumbnailURL:        data.thumbnailURL?.trim()   || null,
    // Merge fields — null until ProductMergeService sets them
    mergedIntoId:        null,
    mergedDate:          null,
    mergedReason:        null,
    createdAt:           now,
    updatedAt:           now,
  });

  // DT-004B: Auto-create CommercialProfile for every new product
  await createProfile(id).catch((err) =>
    console.warn('[ProductService] CommercialProfile creation failed (non-fatal):', err.message)
  );

  return id;
}

// ================================================================
// UPDATE
// ================================================================

export async function updateProduct(id, data) {
  const existing = await db.Products.get(id);
  if (!existing) throw new Error(`Product not found: ${id}`);

  // Prevent editing a merged product
  if (existing.lifecycleStatus === 'Merged') {
    throw new Error(`Product ${id} has been merged into ${existing.mergedIntoId} and cannot be edited.`);
  }

  const merged = { ...existing, ...data };
  const { valid, errors } = validateProduct(merged);
  if (!valid) throw new Error(errors.join(' '));

  const dup = await findDuplicate(merged.productName, merged.strength, merged.dosageForm, id);
  if (dup) throw new Error(`Duplicate detected: "${dup.productName}" (${dup.id}) has the same name, strength, and form.`);

  await db.Products.put({
    ...merged,
    productName:    merged.productName.trim(),
    normalizedName: buildDedupKey(merged.productName, merged.strength, merged.dosageForm),
    updatedAt:      Date.now(),
  });
}

// ================================================================
// ARCHIVE / RESTORE  (now delegate to softDelete for audit trail)
// ================================================================

export async function archiveProduct(id) {
  const p = await db.Products.get(id);
  if (!p) throw new Error(`Product not found: ${id}`);
  if (p.lifecycleStatus === 'Merged') throw new Error('Cannot archive a merged product.');
  await archiveRecord('Products', id);
}

export async function restoreProduct(id) {
  const p = await db.Products.get(id);
  if (!p) throw new Error(`Product not found: ${id}`);
  if (p.lifecycleStatus === 'Merged') throw new Error('Cannot restore a merged product.');
  await restoreRecord('Products', id);
}

// ================================================================
// READ
// ================================================================

export async function getProduct(id)  { return db.Products.get(id); }
export async function getAllProducts() { return db.Products.orderBy('productName').toArray(); }

// ================================================================
// SEARCH
// ================================================================

/**
 * Full-text search. Excludes 'Merged' products from all filters
 * unless statusFilter is explicitly 'Merged' or 'All'.
 */
export async function searchProducts({ query = '', statusFilter = 'Active' } = {}) {
  const q = query.trim().toLowerCase();

  let collection;
  if (statusFilter && statusFilter !== 'All') {
    collection = db.Products.where('lifecycleStatus').equals(statusFilter);
  } else {
    collection = db.Products.toCollection();
  }

  let results = await collection.toArray();

  // Suppress merged products from 'All' view — they're system records
  if (statusFilter === 'All') {
    results = results.filter((p) => p.lifecycleStatus !== 'Merged');
  }

  if (q) {
    results = results.filter((p) =>
      p.productName?.toLowerCase().includes(q) ||
      p.genericName?.toLowerCase().includes(q) ||
      p.brand?.toLowerCase().includes(q)       ||
      p.strength?.toLowerCase().includes(q)    ||
      p.dosageForm?.toLowerCase().includes(q)  ||
      p.category?.toLowerCase().includes(q)
    );
  }

  results.sort((a, b) => a.productName.localeCompare(b.productName));
  return results.slice(0, 200);
}

// ================================================================
// STATS
// ================================================================

export async function getProductCount() {
  return db.Products.where('lifecycleStatus').equals('Active').count();
}

export async function getProductCountByStatus() {
  const all = await db.Products.toArray();
  return all.reduce((acc, p) => {
    acc[p.lifecycleStatus] = (acc[p.lifecycleStatus] ?? 0) + 1;
    return acc;
  }, {});
}
