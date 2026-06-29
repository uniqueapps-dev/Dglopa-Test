/**
 * DGLOPA PLATFORM — PRODUCT SERVICE
 * All Product Master CRUD, search, and validation logic.
 * No UI here. Called by the Products screen.
 */

import { db }           from '../db/database.js';
import { nextId }       from '../utils/idGenerator.js';
import { normalizeName, buildDedupKey } from '../utils/normalizer.js';

// ================================================================
// VALIDATION
// ================================================================

/**
 * Validate a product payload before save.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateProduct(data) {
  const errors = [];
  if (!data.productName?.trim())  errors.push('Product Name is required.');
  if (!data.dosageForm?.trim())   errors.push('Dosage Form is required.');
  if (!data.baseUnit?.trim())     errors.push('Base Unit is required.');
  return { valid: errors.length === 0, errors };
}

// ================================================================
// DUPLICATE DETECTION
// ================================================================

/**
 * Check if a product with the same normalized composite key already exists.
 * Excludes the product being edited (by its own ID).
 * @returns {Promise<object|null>} existing product or null
 */
export async function findDuplicate(productName, strength, dosageForm, excludeId = null) {
  const key = buildDedupKey(productName, strength, dosageForm);
  const match = await db.Products
    .where('normalizedName')
    .equals(key)
    .first();
  if (!match) return null;
  if (excludeId && match.id === excludeId) return null;
  return match;
}

// ================================================================
// CREATE
// ================================================================

/**
 * Add a new product.
 * @param {object} data — raw form payload
 * @returns {Promise<string>} new product ID
 */
export async function createProduct(data) {
  const { valid, errors } = validateProduct(data);
  if (!valid) throw new Error(errors.join(' '));

  const dup = await findDuplicate(data.productName, data.strength, data.dosageForm);
  if (dup) throw new Error(`Duplicate detected: "${dup.productName}" (${dup.id}) has the same name, strength, and form.`);

  const id  = await nextId('Product');
  const now = Date.now();

  const record = {
    id,
    productName:         data.productName.trim(),
    normalizedName:      buildDedupKey(data.productName, data.strength, data.dosageForm),
    genericName:         data.genericName?.trim()  || '',
    brand:               data.brand?.trim()        || '',
    strength:            data.strength?.trim()     || '',
    dosageForm:          data.dosageForm.trim(),
    category:            data.category?.trim()     || '',
    baseUnit:            data.baseUnit.trim(),
    receivingUnits:      data.receivingUnits?.trim()  || '',
    sellingUnits:        data.sellingUnits?.trim()    || '',
    lifecycleStatus:     data.lifecycleStatus       || 'Active',
    healthScore:         null,   // reserved — no calculation
    preferredSupplierId: data.preferredSupplierId   || null,
    notes:               data.notes?.trim()         || '',
    createdAt:           now,
    updatedAt:           now,
  };

  await db.Products.add(record);
  return id;
}

// ================================================================
// UPDATE
// ================================================================

/**
 * Update an existing product.
 * @param {string} id — PRD-NNNNNN
 * @param {object} data — partial or full payload
 */
export async function updateProduct(id, data) {
  const existing = await db.Products.get(id);
  if (!existing) throw new Error(`Product not found: ${id}`);

  // Merge
  const merged = { ...existing, ...data };
  const { valid, errors } = validateProduct(merged);
  if (!valid) throw new Error(errors.join(' '));

  const dup = await findDuplicate(merged.productName, merged.strength, merged.dosageForm, id);
  if (dup) throw new Error(`Duplicate detected: "${dup.productName}" (${dup.id}) has the same name, strength, and form.`);

  const updated = {
    ...merged,
    productName:     merged.productName.trim(),
    normalizedName:  buildDedupKey(merged.productName, merged.strength, merged.dosageForm),
    updatedAt:       Date.now(),
  };

  await db.Products.put(updated);
}

// ================================================================
// ARCHIVE / RESTORE
// ================================================================

export async function archiveProduct(id) {
  const p = await db.Products.get(id);
  if (!p) throw new Error(`Product not found: ${id}`);
  await db.Products.update(id, { lifecycleStatus: 'Archived', updatedAt: Date.now() });
}

export async function restoreProduct(id) {
  const p = await db.Products.get(id);
  if (!p) throw new Error(`Product not found: ${id}`);
  await db.Products.update(id, { lifecycleStatus: 'Active', updatedAt: Date.now() });
}

// ================================================================
// READ
// ================================================================

/** Get one product by ID */
export async function getProduct(id) {
  return db.Products.get(id);
}

/** Get all products, sorted by productName */
export async function getAllProducts() {
  return db.Products.orderBy('productName').toArray();
}

// ================================================================
// SEARCH
// ================================================================

/**
 * Full-text search across productName, genericName, brand.
 * Filters by lifecycleStatus if provided.
 * Returns max 200 results.
 */
export async function searchProducts({ query = '', statusFilter = 'Active' } = {}) {
  const q = query.trim().toLowerCase();

  let collection = db.Products.toCollection();

  // Status filter
  if (statusFilter && statusFilter !== 'All') {
    collection = db.Products
      .where('lifecycleStatus')
      .equals(statusFilter);
  }

  let results = await collection.toArray();

  // Text filter (client-side — dataset fits in memory)
  if (q) {
    results = results.filter((p) =>
      p.productName?.toLowerCase().includes(q)  ||
      p.genericName?.toLowerCase().includes(q)  ||
      p.brand?.toLowerCase().includes(q)        ||
      p.strength?.toLowerCase().includes(q)     ||
      p.dosageForm?.toLowerCase().includes(q)   ||
      p.category?.toLowerCase().includes(q)
    );
  }

  // Sort by name
  results.sort((a, b) => a.productName.localeCompare(b.productName));

  return results.slice(0, 200);
}

// ================================================================
// STATS (placeholder — no calculations)
// ================================================================

export async function getProductCount() {
  return db.Products.where('lifecycleStatus').equals('Active').count();
}
