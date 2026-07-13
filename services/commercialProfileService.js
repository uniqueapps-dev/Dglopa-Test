/**
 * DGLOPA PLATFORM — COMMERCIAL PROFILE SERVICE (DT-004B)
 * Implements DM-001: Product Commercial Profile.
 *
 * This service is the SOLE OWNER of commercial truth for every product.
 * After DT-004B, all commercial reads MUST pass through this service.
 * Direct reads of Products.lastCost or InventoryLots.sellingPrice are
 * deprecated and will be removed in a future migration.
 *
 * RESPONSIBILITIES:
 *   - Create and seed CommercialProfiles for new products
 *   - Read profiles (single, bulk)
 *   - Update ReplacementCostSnapshot (called by ReceivingCommitService)
 *   - Update activeSellingPrice (called by future selling price UI)
 *   - Update pricingStatus
 *   - Write immutable CommercialPriceHistory records on every change
 *   - Validate profile integrity
 *
 * WRITE DUAL-PATH (backward compatibility):
 *   During the migration period every write to CommercialProfileService
 *   also updates the legacy Products.lastCost / InventoryLots.sellingPrice
 *   fields. This ensures existing screens (inventoryScreen, productProfile)
 *   continue working without modification. The legacy write is tagged
 *   [LEGACY-COMPAT] in comments and will be removed in migration v9.
 *
 * CONFIDENCE LEVELS for ReplacementCostSnapshot:
 *   Verified — came from a completed receiving session (hardware receipt)
 *   High     — came from a manual entry with explicit confirmation
 *   Medium   — came from a manual entry without confirmation
 *   Low      — came from a migration, import, or estimate
 */

import { db }     from '../db/database.js';
import { nextId } from '../utils/idGenerator.js';

// ================================================================
// CONSTANTS
// ================================================================

export const PRICING_STATUS = Object.freeze({
  CURRENT:          'Current',
  REVIEW_REQUIRED:  'ReviewRequired',
  AT_RISK:          'AtRisk',
  MANUAL_OVERRIDE:  'ManualOverride',
});

export const SNAPSHOT_CONFIDENCE = Object.freeze({
  VERIFIED: 'Verified',
  HIGH:     'High',
  MEDIUM:   'Medium',
  LOW:      'Low',
});

export const SNAPSHOT_SOURCE = Object.freeze({
  RECEIVING:  'receiving',
  MANUAL:     'manual',
  IMPORT:     'import',
  MIGRATION:  'migration',
});

export const PRICE_CHANGE_TYPE = Object.freeze({
  SELLING_PRICE:      'SellingPrice',
  REPLACEMENT_COST:   'ReplacementCost',
  PRICING_STATUS:     'PricingStatus',
  PROFILE_CREATED:    'ProfileCreated',
});

// ================================================================
// CREATE
// ================================================================

/**
 * Create a new CommercialProfile for a product.
 * Called immediately after productService.createProduct().
 * Should be called in the same logical flow as product creation
 * (not necessarily the same Dexie transaction — CommercialProfiles
 * is a separate table).
 *
 * @param {string} productId
 * @param {object} [initial]  — optional seeding data
 * @returns {Promise<string>} CPS-NNNNNN id
 */
export async function createProfile(productId, {
  activeSellingPrice       = null,
  replacementCostSnapshot  = null,
  pricingStatus            = PRICING_STATUS.CURRENT,
} = {}) {
  if (!productId) throw new Error('[CommercialProfile] productId is required.');

  const existing = await db.ProductCommercialProfiles
    .where('productId').equals(productId).first();
  if (existing) return existing.id; // idempotent

  const id  = await nextId('CommercialProfile');
  const now = Date.now();

  await db.ProductCommercialProfiles.add({
    id,
    productId,
    replacementCostSnapshot:  replacementCostSnapshot ? _validateSnapshot(replacementCostSnapshot) : null,
    activeSellingPrice:        activeSellingPrice != null ? Number(activeSellingPrice) : null,
    pricingStatus,
    pricingProfileVersion:     1,
    commercialJustification:   null,   // placeholder — PIE (EPIC-001B)
    marginQuality:             null,   // placeholder — PIE (EPIC-001B)
    capitalExposure:           null,   // placeholder
    recoveryOpportunity:       null,   // placeholder
    generatedAt:  now,
    updatedAt:    now,
  });

  // Audit trail
  await _writeHistory(productId, PRICE_CHANGE_TYPE.PROFILE_CREATED, null, null, 'CommercialProfile created.', now);

  return id;
}

// ================================================================
// READ
// ================================================================

/**
 * Get the CommercialProfile for a single product.
 * Enriches the ReplacementCostSnapshot with supplierName if a
 * supplierId is present (avoids null supplierName in the UI).
 *
 * @param {string} productId
 * @returns {Promise<CommercialProfile|null>}
 */
export async function getProfile(productId) {
  if (!productId) return null;

  const profile = await db.ProductCommercialProfiles
    .where('productId').equals(productId).first();

  if (!profile) return null;
  return _enrichProfile(profile);
}

/**
 * Get CommercialProfiles for multiple products in one batch.
 * Returns a Map<productId, CommercialProfile>.
 *
 * @param {string[]} productIds
 * @returns {Promise<Map<string, CommercialProfile>>}
 */
export async function getProfiles(productIds) {
  if (!productIds?.length) return new Map();

  const profiles = await db.ProductCommercialProfiles
    .where('productId').anyOf(productIds).toArray();

  // Enrich supplier names in bulk
  const supplierIds = new Set(
    profiles
      .map((p) => p.replacementCostSnapshot?.supplierId)
      .filter(Boolean)
  );
  const supplierList = await Promise.all([...supplierIds].map((id) => db.Suppliers.get(id)));
  const supplierMap  = new Map(supplierList.filter(Boolean).map((s) => [s.id, s.supplierName]));

  const enriched = profiles.map((p) => _enrichProfileWithMap(p, supplierMap));
  return new Map(enriched.map((p) => [p.productId, p]));
}

/**
 * Get all profiles requiring review.
 */
export async function getProfilesRequiringReview() {
  const profiles = await db.ProductCommercialProfiles
    .where('pricingStatus').equals(PRICING_STATUS.REVIEW_REQUIRED)
    .toArray();
  const enriched = await Promise.all(profiles.map(_enrichProfile));
  return enriched;
}

/**
 * Ensure a profile exists for every product that currently lacks one.
 * Safe to call on demand — idempotent per product.
 * Returns the count of newly created profiles.
 */
export async function ensureProfilesForAllProducts() {
  const [products, profiles] = await Promise.all([
    db.Products.toArray(),
    db.ProductCommercialProfiles.toArray(),
  ]);
  const existingIds = new Set(profiles.map((p) => p.productId));
  const missing     = products.filter((p) => !existingIds.has(p.id));

  let created = 0;
  for (const product of missing) {
    await createProfile(product.id);
    created++;
  }
  return created;
}

// ================================================================
// UPDATE — REPLACEMENT COST SNAPSHOT
// ================================================================

/**
 * Update the ReplacementCostSnapshot from a receiving session commit.
 * Called by ReceivingCommitService after each product's lots are written.
 *
 * Receiving commits produce Verified snapshots — the highest confidence
 * level — because the cost comes from a physical supplier invoice.
 *
 * @param {string} productId
 * @param {object} snapshotData
 *   { amount, supplierId, supplierName?, invoiceNumber? }
 * @param {number} [timestamp]
 */
export async function updateReplacementCostFromReceiving(productId, snapshotData, timestamp = Date.now()) {
  _assertAmount(snapshotData.amount, 'updateReplacementCostFromReceiving');

  const snapshot = _buildSnapshot({
    amount:      snapshotData.amount,
    supplierId:  snapshotData.supplierId  || null,
    supplierName:snapshotData.supplierName|| null,
    source:      SNAPSHOT_SOURCE.RECEIVING,
    timestamp,
    confidence:  SNAPSHOT_CONFIDENCE.VERIFIED,
  });

  await _updateProfile(productId, {
    replacementCostSnapshot: snapshot,
  }, timestamp);

  await _writeHistory(
    productId,
    PRICE_CHANGE_TYPE.REPLACEMENT_COST,
    null,
    snapshot.amount,
    `Receiving commit — source: ${snapshotData.supplierId || 'unknown supplier'}`,
    timestamp
  );

  // [LEGACY-COMPAT] Keep Products.lastCost in sync during migration period
  await db.Products.update(productId, { lastCost: snapshot.amount, updatedAt: timestamp });
}

/**
 * Manual replacement cost update (pharmacist-entered).
 * Confidence defaults to Medium unless explicitly confirmed.
 *
 * @param {string} productId
 * @param {number} amount
 * @param {object} [options]
 */
export async function updateReplacementCostManual(productId, amount, {
  supplierId   = null,
  supplierName = null,
  confirmed    = false,
  notes        = '',
} = {}) {
  _assertAmount(amount, 'updateReplacementCostManual');

  const now      = Date.now();
  const snapshot = _buildSnapshot({
    amount,
    supplierId,
    supplierName,
    source:     SNAPSHOT_SOURCE.MANUAL,
    timestamp:  now,
    confidence: confirmed ? SNAPSHOT_CONFIDENCE.HIGH : SNAPSHOT_CONFIDENCE.MEDIUM,
  });

  await _updateProfile(productId, { replacementCostSnapshot: snapshot }, now);
  await _writeHistory(productId, PRICE_CHANGE_TYPE.REPLACEMENT_COST, null, amount, notes || 'Manual update', now);

  // Set PricingStatus → ReviewRequired so the pharmacist knows the selling price
  // has not yet been reviewed against the new replacement cost (DT-004A spec).
  await _updateProfile(productId, { pricingStatus: PRICING_STATUS.REVIEW_REQUIRED }, now);
  await _writeHistory(productId, PRICE_CHANGE_TYPE.PRICING_STATUS, PRICING_STATUS.CURRENT, PRICING_STATUS.REVIEW_REQUIRED, 'Auto-set: manual replacement cost update', now);

  // [LEGACY-COMPAT]
  await db.Products.update(productId, { lastCost: amount, updatedAt: now });
}

// ================================================================
// UPDATE — ACTIVE SELLING PRICE
// ================================================================

/**
 * Set the unified active shelf price for a product.
 * One price per product — visible to dispensers and patients.
 *
 * Every price change creates an immutable CommercialPriceHistory record.
 *
 * @param {string} productId
 * @param {number} newPrice
 * @param {object} [options]
 */
export async function setActiveSellingPrice(productId, newPrice, {
  notes   = '',
  actorId = 'system',
} = {}) {
  if (newPrice == null || isNaN(newPrice) || newPrice < 0) {
    throw new Error('[CommercialProfile] Selling price must be a non-negative number.');
  }

  const now      = Date.now();
  const existing = await getProfile(productId);
  const oldPrice = existing?.activeSellingPrice ?? null;

  await _updateProfile(productId, { activeSellingPrice: Number(newPrice) }, now);
  await _writeHistory(productId, PRICE_CHANGE_TYPE.SELLING_PRICE, oldPrice, newPrice, notes || 'Price update', now, actorId);
}

// ================================================================
// UPDATE — PRICING STATUS
// ================================================================

/**
 * Set the pricing status of a product's commercial profile.
 *
 * @param {string} productId
 * @param {string} status   — PRICING_STATUS value
 * @param {string} [notes]
 */
export async function setPricingStatus(productId, status, notes = '') {
  if (!Object.values(PRICING_STATUS).includes(status)) {
    throw new Error(`[CommercialProfile] Invalid pricingStatus: "${status}".`);
  }

  const now = Date.now();
  await _updateProfile(productId, { pricingStatus: status }, now);
  await _writeHistory(productId, PRICE_CHANGE_TYPE.PRICING_STATUS, null, status, notes, now);
}

// ================================================================
// PRICE HISTORY
// ================================================================

/**
 * Get the full price history for a product, newest first.
 * @param {string} productId
 * @returns {Promise<CommercialPriceHistory[]>}
 */
export async function getPriceHistory(productId) {
  const rows = await db.CommercialPriceHistory
    .where('productId').equals(productId).toArray();
  return rows.sort((a, b) => b.changedAt - a.changedAt);
}

// ================================================================
// VALIDATION
// ================================================================

/**
 * Validate a CommercialProfile for data integrity.
 * Returns { valid, errors }.
 */
export function validateProfile(profile) {
  const errors = [];
  if (!profile.productId) errors.push('productId is required.');
  if (!Object.values(PRICING_STATUS).includes(profile.pricingStatus)) {
    errors.push(`Invalid pricingStatus: "${profile.pricingStatus}".`);
  }
  if (profile.replacementCostSnapshot != null) {
    const s = profile.replacementCostSnapshot;
    if (s.amount == null || isNaN(s.amount)) errors.push('Snapshot amount must be a number.');
    if (!Object.values(SNAPSHOT_CONFIDENCE).includes(s.confidence)) {
      errors.push(`Invalid snapshot confidence: "${s.confidence}".`);
    }
    if (!Object.values(SNAPSHOT_SOURCE).includes(s.source)) {
      errors.push(`Invalid snapshot source: "${s.source}".`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ================================================================
// INTERNAL HELPERS
// ================================================================

async function _updateProfile(productId, updates, now) {
  const existing = await db.ProductCommercialProfiles
    .where('productId').equals(productId).first();

  if (!existing) {
    // Auto-create profile if missing (handles products that pre-date DT-004B)
    await createProfile(productId);
    const fresh = await db.ProductCommercialProfiles
      .where('productId').equals(productId).first();
    if (!fresh) throw new Error(`[CommercialProfile] Cannot find or create profile for ${productId}.`);
    await db.ProductCommercialProfiles.update(fresh.id, {
      ...updates,
      pricingProfileVersion: 1,
      updatedAt: now,
    });
    return;
  }

  await db.ProductCommercialProfiles.update(existing.id, {
    ...updates,
    pricingProfileVersion: (existing.pricingProfileVersion || 1) + 1,
    updatedAt: now,
  });
}

async function _writeHistory(productId, changeType, previousValue, newValue, notes, changedAt, changedBy = 'system') {
  const id = await nextId('CommercialPriceHistory');
  await db.CommercialPriceHistory.add({
    id,
    productId,
    changeType,
    previousValue: previousValue ?? null,
    newValue:      newValue      ?? null,
    notes:         notes         || '',
    changedBy,
    changedAt,
  });
}

function _buildSnapshot({ amount, supplierId, supplierName, source, timestamp, confidence }) {
  return Object.freeze({
    amount:      Number(amount),
    supplierId:  supplierId   || null,
    supplierName: supplierName || null,
    source,
    timestamp:   timestamp   || Date.now(),
    confidence,
  });
}

function _validateSnapshot(s) {
  if (s == null) return null;
  if (s.amount == null || isNaN(s.amount)) throw new Error('[CommercialProfile] Snapshot amount is required.');
  return {
    amount:       Number(s.amount),
    supplierId:   s.supplierId   || null,
    supplierName: s.supplierName || null,
    source:       s.source       || SNAPSHOT_SOURCE.MANUAL,
    timestamp:    s.timestamp    || Date.now(),
    confidence:   s.confidence   || SNAPSHOT_CONFIDENCE.MEDIUM,
  };
}

async function _enrichProfile(profile) {
  if (!profile) return null;
  const snap = profile.replacementCostSnapshot;
  if (snap?.supplierId && !snap.supplierName) {
    const supplier = await db.Suppliers.get(snap.supplierId).catch(() => null);
    if (supplier) {
      return {
        ...profile,
        replacementCostSnapshot: { ...snap, supplierName: supplier.supplierName },
      };
    }
  }
  return profile;
}

function _enrichProfileWithMap(profile, supplierMap) {
  const snap = profile.replacementCostSnapshot;
  if (snap?.supplierId && !snap.supplierName && supplierMap.has(snap.supplierId)) {
    return {
      ...profile,
      replacementCostSnapshot: { ...snap, supplierName: supplierMap.get(snap.supplierId) },
    };
  }
  return profile;
}

function _assertAmount(amount, caller) {
  if (amount == null || isNaN(amount) || Number(amount) < 0) {
    throw new Error(`[CommercialProfile.${caller}] amount must be a non-negative number.`);
  }
}
