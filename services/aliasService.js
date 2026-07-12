/**
 * DGLOPA PLATFORM — PRODUCT ALIAS SERVICE
 * CRUD and lookup for ProductAliases.
 * No UI. Called by future modules (import, search, barcode scan).
 *
 * Use cases:
 *   - "Panadol", "Paracetamol", "PCM", "Acetaminophen" → same ProductID
 *   - Importers write source: 'import' | 'drug_db' | 'manual'
 *   - Search module queries aliases to resolve product IDs
 */

import { db }    from '../db/database.js';
import { nextId } from '../utils/idGenerator.js';

// ================================================================
// CREATE
// ================================================================

/**
 * Add a single alias for a product.
 * Silently deduplicates: if the exact alias already exists for this
 * productId, returns the existing record's id instead of inserting.
 *
 * @param {string} productId  — PRD-NNNNNN
 * @param {string} alias      — the alias text
 * @param {string} source     — 'manual' | 'import' | 'drug_db' | etc.
 * @returns {Promise<string>} aliasId
 */
export async function addAlias(productId, alias, source = 'manual') {
  if (!productId) throw new Error('[AliasService] productId is required.');
  const text = alias?.trim();
  if (!text)    throw new Error('[AliasService] alias text is required.');

  // Check for existing exact match on this product
  const existing = await db.ProductAliases
    .where('productId').equals(productId)
    .and((r) => r.alias.toLowerCase() === text.toLowerCase())
    .first();

  if (existing) return existing.id;

  const id  = await nextId('ProductAlias');
  const now = Date.now();

  await db.ProductAliases.add({
    id,
    productId,
    alias:     text,
    source:    source || 'manual',
    createdAt: now,
  });

  return id;
}

/**
 * Bulk add aliases for one product.
 * Each entry: { alias, source? }
 * Skips duplicates silently.
 *
 * @param {string}  productId
 * @param {Array<{alias: string, source?: string}>} entries
 * @returns {Promise<string[]>} array of aliasIds
 */
export async function bulkAddAliases(productId, entries = []) {
  const ids = [];
  for (const entry of entries) {
    const id = await addAlias(productId, entry.alias, entry.source);
    ids.push(id);
  }
  return ids;
}

// ================================================================
// READ
// ================================================================

/**
 * Get all aliases for a product, sorted alphabetically.
 * @returns {Promise<Array>}
 */
export async function getAliasesForProduct(productId) {
  const rows = await db.ProductAliases
    .where('productId')
    .equals(productId)
    .toArray();
  rows.sort((a, b) => a.alias.localeCompare(b.alias));
  return rows;
}

/**
 * Find which product ID an alias text resolves to.
 * Case-insensitive. Returns first match or null.
 *
 * @param {string} aliasText
 * @returns {Promise<string|null>} productId or null
 */
export async function resolveAlias(aliasText) {
  const text = aliasText?.trim().toLowerCase();
  if (!text) return null;

  // Index on 'alias' allows exact match — use it first
  const exact = await db.ProductAliases
    .where('alias')
    .equalsIgnoreCase(text)
    .first();

  return exact?.productId ?? null;
}

/**
 * Search aliases by partial text (client-side).
 * Returns array of { id, productId, alias, source, createdAt }.
 * Useful for future global search across aliases.
 *
 * @param {string} query
 * @returns {Promise<Array>}
 */
export async function searchAliases(query = '') {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const all = await db.ProductAliases.toArray();
  return all
    .filter((r) => r.alias.toLowerCase().includes(q))
    .sort((a, b) => a.alias.localeCompare(b.alias))
    .slice(0, 100);
}

// ================================================================
// DELETE
// ================================================================

/**
 * Remove a single alias by its ID.
 */
export async function removeAlias(aliasId) {
  await db.ProductAliases.delete(aliasId);
}

/**
 * Remove all aliases for a product.
 * Called when a product is hard-deleted (future).
 */
export async function removeAllAliasesForProduct(productId) {
  await db.ProductAliases
    .where('productId')
    .equals(productId)
    .delete();
}
