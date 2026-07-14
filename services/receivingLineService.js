/**
 * DGLOPA PLATFORM — RECEIVING LINE SERVICE
 * RPA-001: Receiving Persistence Architecture
 *
 * SINGLE RESPONSIBILITY: This service is the sole owner of ReceivingLines.
 * All reads and writes to the ReceivingLines table pass through here.
 * No screen or other service writes to ReceivingLines directly.
 *
 * LINE STATUS LIFECYCLE:
 *   Draft     — line is being edited; session not yet reviewed
 *   Review    — session moved to review stage
 *   Committed — line was committed to inventory (lot created or review queue entry)
 *   Archived  — session was cancelled; line preserved for audit
 *
 * SOFT ARCHIVAL POLICY (per RPA-001):
 *   Lines are NEVER physically deleted. Physical deletion destroys invoice
 *   history, supplier dispute records, and regulatory audit trails.
 *   commitLines() and archiveLines() update status in-place.
 *
 * MATCHING CHAIN (unchanged from DT-004):
 *   1. Exact normalizedName composite (name + strength + form)
 *   2. Alias resolution via aliasService
 *   3. Fuzzy name-only match
 *   4. Unresolved → route to Review Queue on commit
 */

import { db }              from '../db/database.js';
import { nextId }          from '../utils/idGenerator.js';
import { buildDedupKey, normalizeName } from '../utils/normalizer.js';
import { resolveAlias }    from './aliasService.js';
import { splitQuantity, canonicalUnit } from '../utils/quantitySplitter.js';

// ================================================================
// LINE STATUS CONSTANTS
// ================================================================

export const LINE_STATUS = Object.freeze({
  DRAFT:     'Draft',
  REVIEW:    'Review',
  COMMITTED: 'Committed',
  ARCHIVED:  'Archived',
});

// ================================================================
// READ
// ================================================================

/**
 * Load all lines for a session, ordered by lineNumber.
 * Always reads from DB — never from a caller-held array.
 *
 * @param {string} sessionId
 * @param {string} [statusFilter] — optional LINE_STATUS value
 * @returns {Promise<ReceivingLine[]>}
 */
export async function getLinesForSession(sessionId, statusFilter = null) {
  let rows = await db.ReceivingLines
    .where('sessionId').equals(sessionId)
    .toArray();

  if (statusFilter) {
    rows = rows.filter((r) => r.status === statusFilter);
  }

  rows.sort((a, b) => a.lineNumber - b.lineNumber);
  return rows;
}

/**
 * Get a single line by its ID.
 * @param {string} id
 */
export async function getLine(id) {
  return db.ReceivingLines.get(id);
}

/**
 * Count active (non-archived, non-committed) lines for a session.
 */
export async function countActiveLines(sessionId) {
  const rows = await db.ReceivingLines.where('sessionId').equals(sessionId).toArray();
  return rows.filter((r) => r.status === LINE_STATUS.DRAFT || r.status === LINE_STATUS.REVIEW).length;
}

// ================================================================
// WRITE — ADD
// ================================================================

/**
 * Add a new validated line to a session.
 * Validates the line data, matches the product, then writes to DB.
 *
 * @param {string} sessionId
 * @param {object} lineData — raw form values from the UI
 * @param {number} lineNumber
 * @returns {Promise<ReceivingLine>} — the persisted line
 */
export async function addLine(sessionId, lineData, lineNumber) {
  const validated = await _buildLine(lineData, sessionId, lineNumber, null);
  await db.ReceivingLines.add(validated);
  return validated;
}

// ================================================================
// WRITE — UPDATE
// ================================================================

/**
 * Update an existing line in-place.
 * Re-validates the line data, then writes to DB.
 *
 * @param {string} id — existing line ID
 * @param {object} lineData — updated form values
 * @returns {Promise<ReceivingLine>}
 */
export async function updateLine(id, lineData) {
  const existing = await db.ReceivingLines.get(id);
  if (!existing) throw new Error(`[ReceivingLineService] Line not found: ${id}`);

  const updated = await _buildLine(lineData, existing.sessionId, existing.lineNumber, id);
  await db.ReceivingLines.put(updated);
  return updated;
}

// ================================================================
// WRITE — SOFT DELETE (archive)
// ================================================================

/**
 * Archive a single line (soft delete).
 * The line record is preserved. status → Archived.
 *
 * @param {string} id
 */
export async function archiveLine(id) {
  const now = Date.now();
  await db.ReceivingLines.update(id, {
    status:    LINE_STATUS.ARCHIVED,
    updatedAt: now,
  });
}

// ================================================================
// BULK STATUS TRANSITIONS
// ================================================================

/**
 * Move all Draft lines for a session to Review status.
 * Called when the session enters the review stage.
 *
 * @param {string} sessionId
 */
export async function moveLinesToReview(sessionId) {
  const now = Date.now();
  const rows = await db.ReceivingLines
    .where('sessionId').equals(sessionId)
    .toArray();

  const toUpdate = rows.filter((r) => r.status === LINE_STATUS.DRAFT);
  await Promise.all(toUpdate.map((r) =>
    db.ReceivingLines.update(r.id, { status: LINE_STATUS.REVIEW, updatedAt: now })
  ));
}

/**
 * Mark all lines for a session as Committed after a successful commit.
 * Never physically deletes.
 *
 * @param {string} sessionId
 */
export async function commitLines(sessionId) {
  const now = Date.now();
  const rows = await db.ReceivingLines
    .where('sessionId').equals(sessionId)
    .toArray();

  await Promise.all(rows.map((r) =>
    db.ReceivingLines.update(r.id, { status: LINE_STATUS.COMMITTED, updatedAt: now })
  ));
}

/**
 * Archive all lines for a session (session was cancelled).
 *
 * @param {string} sessionId
 */
export async function archiveSessionLines(sessionId) {
  const now = Date.now();
  const rows = await db.ReceivingLines
    .where('sessionId').equals(sessionId)
    .toArray();

  await Promise.all(rows.map((r) =>
    db.ReceivingLines.update(r.id, { status: LINE_STATUS.ARCHIVED, updatedAt: now })
  ));
}

// ================================================================
// PRODUCT MATCHING
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
  if (fuzzy) return { productId: fuzzy.id, productName: fuzzy.productName, confidence: 'fuzzy' };

  return null;
}

/**
 * Match a supplier name to an existing Supplier record.
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
// VALIDATION (standalone — used by commit service and screen)
// ================================================================

/**
 * Validate a receiving line and populate reviewReasons.
 * Does NOT block — routes issues to reviewReasons array.
 * Does NOT write to DB — returns a plain validated object.
 * Persistence is the caller's responsibility.
 *
 * @param {object} lineData — raw form values
 * @param {string} sessionId
 * @param {number} lineNumber
 * @returns {Promise<object>} — validated line object (not yet persisted)
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

  // Duplicate batch detection
  if (lineData.batchNumber?.trim() && productMatch?.productId) {
    const existing = await db.InventoryLots
      .where('productId').equals(productMatch.productId)
      .and((l) => l.batchNumber?.trim().toLowerCase() === lineData.batchNumber.trim().toLowerCase())
      .first();
    if (existing) {
      reviewReasons.push(`Duplicate batch number "${lineData.batchNumber}" — already exists for this product`);
    }
  }

  return {
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
// FEFO
// ================================================================

export function sortFEFO(lots) {
  return [...lots].sort((a, b) => {
    if (a.expiryDate == null && b.expiryDate == null) return 0;
    if (a.expiryDate == null) return 1;
    if (b.expiryDate == null) return -1;
    return a.expiryDate - b.expiryDate;
  });
}

export async function getLotsForProduct(productId) {
  const lots = await db.InventoryLots
    .where('productId').equals(productId)
    .and((l) => l.quantityAvailable > 0 && l.status !== 'Expired')
    .toArray();
  return sortFEFO(lots);
}

// ================================================================
// INTERNAL BUILDER
// ================================================================

async function _buildLine(lineData, sessionId, lineNumber, existingId) {
  const validated = await validateLine(lineData, sessionId, lineNumber);
  const now = Date.now();
  const id  = existingId || await nextId('ReceivingLine');

  return {
    id,
    sessionId,
    lineNumber,
    status:    LINE_STATUS.DRAFT,
    createdAt: now,
    updatedAt: now,
    ...validated,
  };
}
