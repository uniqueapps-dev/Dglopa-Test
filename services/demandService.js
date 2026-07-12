/**
 * DGLOPA PLATFORM — DEMAND SERVICE
 * DT-007: Capture, manage, and analyse unmet demand.
 *
 * Demand Log records ONLY what customers requested but the pharmacy
 * could not fully supply. It does not record sales, inventory movements,
 * or pricing. No inventory modification occurs anywhere in this service.
 *
 * Product matching reuses normalizeName(), buildDedupKey(), resolveAlias()
 * exactly as the IME and Receiving workflow do. No new matching logic.
 * Unknown products (nothing in the Product Master) are stored by name only
 * and flagged for future product creation via the Review Queue.
 */

import { db }            from '../db/database.js';
import { nextId }        from '../utils/idGenerator.js';
import { buildDedupKey, normalizeName } from '../utils/normalizer.js';
import { resolveAlias }  from './aliasService.js';

// ================================================================
// CONSTANTS
// ================================================================

export const DEMAND_STATUSES = Object.freeze({
  OPEN:      'Open',
  RESOLVED:  'Resolved',
  IGNORED:   'Ignored',
  CONVERTED: 'Converted to Purchase',
  MERGED:    'Merged',
});

export const DEMAND_REASONS = Object.freeze([
  'Out of Stock',
  'Insufficient Quantity',
  'Too Expensive',
  'Customer Declined Alternative',
  'Awaiting Supplier',
  'Unknown Product',
  'Prescription Deferred',
  'Other',
]);

export const CUSTOMER_TYPES = Object.freeze([
  'Walk-in',
  'Prescription',
  'Phone',
  'Other',
]);

export const EVIDENCE_TYPES = Object.freeze([
  'image',
  'prescription',
  'pack',
  'ocr_text',
]);

// ================================================================
// CAPTURE (create a demand entry)
// ================================================================

/**
 * Capture a new demand entry. Fast path — minimal required fields.
 *
 * @param {object} data
 * @returns {Promise<string>} DEM-NNNNNN id
 */
export async function captureDemand(data) {
  if (!data.productName?.trim() && !data.productId) {
    throw new Error('Product name or product ID is required.');
  }

  const requestedQty = Number(data.requestedQty) || 1;
  const suppliedQty  = Number(data.suppliedQty)  || 0;
  const missingQty   = Math.max(0, requestedQty - suppliedQty);

  // Auto-match product if productId not provided
  let productId = data.productId || null;
  if (!productId && data.productName?.trim()) {
    const match = await _matchProduct(data.productName, data.strength, data.dosageForm);
    productId = match?.productId || null;
  }

  const id  = await nextId('Demand');
  const now = Date.now();

  await db.Demand.add({
    id,
    productId,
    productName:    data.productName?.trim()    || '',
    status:         DEMAND_STATUSES.OPEN,
    reason:         data.reason                 || DEMAND_REASONS[0],
    requestedQty,
    suppliedQty,
    missingQty,
    customerType:   data.customerType           || null,
    estimatedPrice: data.estimatedPrice != null ? Number(data.estimatedPrice) : null,
    // Evidence
    evidenceData:   data.evidenceData           || null,
    evidenceType:   data.evidenceType           || null,
    evidenceNotes:  data.evidenceNotes?.trim()  || '',
    // Links
    supplierId:     data.supplierId             || null,
    sessionId:      data.sessionId              || null,
    // Meta
    notes:          data.notes?.trim()          || '',
    source:         data.source                 || 'manual',
    loggedAt:       data.loggedAt               || now,
    resolvedAt:     null,
    createdAt:      now,
    updatedAt:      now,
  });

  return id;
}

// ================================================================
// UPDATE / STATUS TRANSITIONS
// ================================================================

export async function updateDemand(id, data) {
  const existing = await db.Demand.get(id);
  if (!existing) throw new Error(`Demand entry not found: ${id}`);
  if (existing.status === DEMAND_STATUSES.MERGED) throw new Error('Cannot edit a merged demand entry.');

  await db.Demand.update(id, { ...data, updatedAt: Date.now() });
}

export async function resolveDemand(id, notes = '') {
  await db.Demand.update(id, {
    status:     DEMAND_STATUSES.RESOLVED,
    resolvedAt: Date.now(),
    notes,
    updatedAt:  Date.now(),
  });
}

export async function ignoreDemand(id, notes = '') {
  await db.Demand.update(id, {
    status:    DEMAND_STATUSES.IGNORED,
    notes,
    updatedAt: Date.now(),
  });
}

export async function convertDemand(id, sessionId) {
  await db.Demand.update(id, {
    status:     DEMAND_STATUSES.CONVERTED,
    sessionId,
    resolvedAt: Date.now(),
    updatedAt:  Date.now(),
  });
}

// ================================================================
// READ
// ================================================================

export async function getDemand(id) { return db.Demand.get(id); }

export async function searchDemand({
  query      = '',
  status     = null,
  reason     = null,
  dateFrom   = null,
  dateTo     = null,
  productId  = null,
  limit      = 200,
} = {}) {
  let collection = status
    ? db.Demand.where('status').equals(status)
    : db.Demand.toCollection();

  let results = await collection.toArray();

  const q = query.trim().toLowerCase();
  if (q) {
    results = results.filter((d) =>
      d.productName?.toLowerCase().includes(q) ||
      d.notes?.toLowerCase().includes(q)       ||
      d.id?.toLowerCase().includes(q)
    );
  }
  if (reason)    results = results.filter((d) => d.reason === reason);
  if (productId) results = results.filter((d) => d.productId === productId);
  if (dateFrom)  results = results.filter((d) => d.loggedAt >= dateFrom);
  if (dateTo)    results = results.filter((d) => d.loggedAt <= dateTo);

  results.sort((a, b) => b.loggedAt - a.loggedAt);
  return results.slice(0, limit);
}

// ================================================================
// ANALYTICS
// ================================================================

/**
 * Compute demand summary statistics for the dashboard.
 * One pass over all demand records — no N+1.
 */
export async function getDemandSummary() {
  const all = await db.Demand.toArray();
  const now = Date.now();
  const todayStart = _startOfDay(now);
  const weekStart  = todayStart - (new Date(now).getDay() * 86400000);
  const monthStart = _startOfMonth(now);

  const open = all.filter((d) => d.status === DEMAND_STATUSES.OPEN);

  const todayEntries = all.filter((d) => d.loggedAt >= todayStart);
  const weekEntries  = all.filter((d) => d.loggedAt >= weekStart);
  const monthEntries = all.filter((d) => d.loggedAt >= monthStart);

  const totalMissingUnits = open.reduce((s, d) => s + (d.missingQty || 0), 0);
  const estimatedLostRevenue = open
    .filter((d) => d.estimatedPrice != null)
    .reduce((s, d) => s + (d.missingQty || 0) * d.estimatedPrice, 0);

  // Top requested products (by frequency, open only)
  const productFreq = new Map();
  for (const d of open) {
    const key = d.productId || d.productName?.toLowerCase() || 'unknown';
    const label = d.productName || key;
    const entry = productFreq.get(key) || { key, label, count: 0, missingQty: 0 };
    entry.count++;
    entry.missingQty += d.missingQty || 0;
    productFreq.set(key, entry);
  }
  const topRequested = [...productFreq.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Unmatched products (open entries with no productId)
  const unmatched = open.filter((d) => !d.productId);

  // Repeated requests (products with >1 open entry)
  const repeated = [...productFreq.values()].filter((p) => p.count > 1);

  return {
    totalOpen:          open.length,
    todayCount:         todayEntries.length,
    weekCount:          weekEntries.length,
    monthCount:         monthEntries.length,
    totalMissingUnits,
    estimatedLostRevenue,
    topRequested,
    unmatchedCount:     unmatched.length,
    repeatedCount:      repeated.length,
    resolvedTotal:      all.filter((d) => d.status === DEMAND_STATUSES.RESOLVED).length,
    convertedTotal:     all.filter((d) => d.status === DEMAND_STATUSES.CONVERTED).length,
  };
}

// ================================================================
// PRODUCT MATCHING (reuses existing services, no new logic)
// ================================================================

async function _matchProduct(rawName, strength = '', dosageForm = '') {
  if (!rawName?.trim()) return null;

  // 1. Exact composite match
  const key   = buildDedupKey(rawName, strength, dosageForm);
  const exact = await db.Products.where('normalizedName').equals(key).first();
  if (exact && exact.lifecycleStatus !== 'Merged') {
    return { productId: exact.id, productName: exact.productName, confidence: 'exact' };
  }

  // 2. Alias resolution
  const aliasId = await resolveAlias(rawName);
  if (aliasId) {
    const ap = await db.Products.get(aliasId);
    if (ap && ap.lifecycleStatus !== 'Merged') {
      return { productId: ap.id, productName: ap.productName, confidence: 'alias' };
    }
  }

  // 3. Fuzzy name-only match
  const nameKey = normalizeName(rawName);
  const all     = await db.Products.where('lifecycleStatus').noneOf(['Merged', 'Archived']).toArray();
  const fuzzy   = all.find((p) => {
    const pk = normalizeName(p.productName);
    return pk === nameKey || pk.includes(nameKey) || nameKey.includes(pk);
  });
  if (fuzzy) return { productId: fuzzy.id, productName: fuzzy.productName, confidence: 'fuzzy' };

  return null; // unknown product — stored by name only
}

// ================================================================
// EVIDENCE HELPERS
// ================================================================

/**
 * Read a File as a base64 data URL for storage in IndexedDB.
 * @param {File} file
 * @returns {Promise<string>} data URL
 */
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/**
 * Attempt basic OCR-style text extraction from an image using a canvas.
 * On Android Chrome, this requires the user to have captured a clear image.
 * Returns extracted text or null if extraction is not supported.
 *
 * NOTE: This uses the browser's Tesseract-like heuristic (not available
 * natively in all browsers). The image is stored regardless; OCR is a
 * best-effort extraction from a displayed canvas.
 *
 * For DT-007: stores the full image; OCR text is extracted from the notes
 * field by the user or future AI integration. This function returns null
 * and leaves OCR to manual input — preserved as a hook for future AI capture.
 *
 * @param {string} dataURL — base64 image
 * @returns {Promise<string|null>}
 */
export async function attemptOCR(dataURL) {
  // Future: call an AI vision API or Web AI model.
  // For DT-007: image is source of truth; OCR text entered manually in notes.
  return null;
}

// ================================================================
// HELPERS
// ================================================================

function _startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function _startOfMonth(ts) {
  const d = new Date(ts);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
