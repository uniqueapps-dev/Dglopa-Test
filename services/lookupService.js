/**
 * DGLOPA PLATFORM — LOOKUP TABLE SERVICE
 * Read and manage Units, DosageForms, Categories.
 * These replace the hardcoded arrays from DT-002 productForm.js.
 *
 * All three tables share the same shape: { id, name, status }
 * Units additionally have { symbol }.
 * Status: 'Active' | 'Inactive'
 */

import { db } from '../db/database.js';

// ================================================================
// GENERIC HELPERS (shared by all three tables)
// ================================================================

async function _getActive(table) {
  return table.where('status').equals('Active').sortBy('name');
}

async function _getAll(table) {
  return table.orderBy('name').toArray();
}

async function _add(table, record) {
  // Guard against duplicate name
  const existing = await table.where('name').equals(record.name).first();
  if (existing) throw new Error(`"${record.name}" already exists.`);
  return table.add({ ...record, status: record.status ?? 'Active' });
}

async function _setStatus(table, id, status) {
  const row = await table.get(id);
  if (!row) throw new Error('Record not found.');
  await table.update(id, { status });
}

// ================================================================
// UNITS
// ================================================================

export async function getActiveUnits()  { return _getActive(db.Units); }
export async function getAllUnits()      { return _getAll(db.Units); }

/**
 * Add a new unit.
 * @param {{ name: string, symbol?: string }} data
 */
export async function addUnit({ name, symbol = '' }) {
  return _add(db.Units, { name: name.trim(), symbol: symbol.trim() });
}

export async function deactivateUnit(id) { return _setStatus(db.Units, id, 'Inactive'); }
export async function activateUnit(id)   { return _setStatus(db.Units, id, 'Active'); }

// ================================================================
// DOSAGE FORMS
// ================================================================

export async function getActiveDosageForms() { return _getActive(db.DosageForms); }
export async function getAllDosageForms()     { return _getAll(db.DosageForms); }

/**
 * @param {{ name: string }} data
 */
export async function addDosageForm({ name }) {
  return _add(db.DosageForms, { name: name.trim() });
}

export async function deactivateDosageForm(id) { return _setStatus(db.DosageForms, id, 'Inactive'); }
export async function activateDosageForm(id)   { return _setStatus(db.DosageForms, id, 'Active'); }

// ================================================================
// CATEGORIES
// ================================================================

export async function getActiveCategories() { return _getActive(db.Categories); }
export async function getAllCategories()     { return _getAll(db.Categories); }

/**
 * @param {{ name: string }} data
 */
export async function addCategory({ name }) {
  return _add(db.Categories, { name: name.trim() });
}

export async function deactivateCategory(id) { return _setStatus(db.Categories, id, 'Inactive'); }
export async function activateCategory(id)   { return _setStatus(db.Categories, id, 'Active'); }

// ================================================================
// BULK FETCH — used by Product Master form to load all three at once
// ================================================================

/**
 * Load all active lookup data in one call.
 * @returns {Promise<{ units, dosageForms, categories }>}
 */
export async function loadLookups() {
  const [units, dosageForms, categories] = await Promise.all([
    getActiveUnits(),
    getActiveDosageForms(),
    getActiveCategories(),
  ]);
  return { units, dosageForms, categories };
}
