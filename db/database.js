/**
 * DGLOPA PLATFORM — DATABASE ENGINE
 * Dexie.js IndexedDB wrapper
 * Version-controlled schema — add new versions below, never modify past ones.
 *
 * ID STRATEGY (DT-002):
 *   All primary keys are application-generated immutable strings (PRD-000001 etc).
 *   Stored in the `id` field. Dexie indexes `id` as the primary key with `&id`
 *   (unique, non-auto-increment). The application always sets `id` before put().
 */

import Dexie from 'https://cdn.jsdelivr.net/npm/dexie@3.2.7/dist/dexie.mjs';

class DglopaDB extends Dexie {
  constructor() {
    super('DglopaDB');

    // ============================================================
    // VERSION 1 — Foundation (DT-001) — DO NOT EDIT
    // ============================================================
    this.version(1).stores({
      Products:
        '++id, &barcode, name, genericName, category, supplierId, isActive, createdAt, updatedAt',
      InventoryLots:
        '++id, productId, batchNumber, expiryDate, supplierId, invoiceId, createdAt',
      Suppliers:
        '++id, &code, name, phone, isActive, createdAt, updatedAt',
      SupplierInvoices:
        '++id, supplierId, invoiceNumber, invoiceDate, status, createdAt',
      Sales:
        '++id, receiptNumber, saleDate, staffId, paymentMethod, status, createdAt',
      SaleLines:
        '++id, saleId, productId, lotId, createdAt',
      StockMovements:
        '++id, productId, lotId, type, referenceId, referenceType, createdAt',
      Demand:
        '++id, productId, loggedAt, source, createdAt',
      Payments:
        '++id, referenceId, referenceType, method, status, createdAt',
      PurchaseHistory:
        '++id, productId, supplierId, invoiceId, purchaseDate',
      PriceHistory:
        '++id, productId, effectiveDate, changedBy',
      ReviewQueue:
        '++id, productId, reason, priority, status, createdAt, resolvedAt',
      Settings:
        '&key, updatedAt',
      AuditLog:
        '++id, entity, entityId, action, performedBy, performedAt',
    });

    // ============================================================
    // VERSION 2 — Product Master (DT-002) — DO NOT EDIT
    // ============================================================
    this.version(2).stores({
      Products: [
        '&id', 'normalizedName', 'productName', 'genericName', 'brand',
        'dosageForm', 'category', 'lifecycleStatus', 'preferredSupplierId',
        'createdAt', 'updatedAt',
      ].join(', '),
      Barcodes:         '++_rowid, &barcode, productId',
      InventoryLots:    '&id, productId, supplierId, invoiceId, expiryDate, status, ownerType, createdAt',
      Suppliers:        '&id, supplierName, status, paymentMethod, createdAt, updatedAt',
      SupplierInvoices: '&id, supplierId, invoiceNumber, invoiceDate, status, createdAt',
      Sales:            '&id, receiptNumber, saleDate, staffId, paymentMethod, status, createdAt',
      SaleLines:        '++_rowid, saleId, productId, lotId, createdAt',
      StockMovements:   '&id, productId, lotId, movementType, timestamp',
      Demand:           '&id, productId, loggedAt, source, createdAt',
      Payments:         '&id, referenceId, referenceType, method, status, createdAt',
      PurchaseHistory:  '&id, productId, supplierId, invoiceNumber, purchaseDate',
      PriceHistory:     '++_rowid, productId, effectiveDate, changedBy',
      ReviewQueue:      '&id, category, severity, status, dueDate, assignedTo, createdAt',
      Settings:         '&key, updatedAt',
      AuditLog:         '++_rowid, entity, entityId, action, performedBy, performedAt',
    });

    // ============================================================
    // VERSION 3 — Product Master Enhancements (DT-002A) — DO NOT EDIT
    // ============================================================
    this.version(3).stores({
      Products: [
        '&id', 'normalizedName', 'productName', 'genericName', 'brand',
        'dosageForm', 'category', 'lifecycleStatus', 'preferredSupplierId',
        'createdAt', 'updatedAt',
      ].join(', '),
      ProductAliases: '&id, productId, alias, source, createdAt',
      Units:          '++id, &name, symbol, status',
      DosageForms:    '++id, &name, status',
      Categories:     '++id, &name, status',
    });

    // ============================================================
    // VERSION 4 — Merge Framework & Soft Delete (DT-002B)
    //
    // Products:
    //   + mergedIntoId indexed — enables resolveProductId() chain walks
    //     and direct queries for "which products were merged into X?"
    //   mergedDate, mergedReason stored as plain fields (no index).
    //
    // AuditLog:
    //   + action indexed — enables fast lookup of all MERGE or
    //     STATUS_CHANGE entries without full table scan.
    //   detail stored as plain JSON field (no index).
    //
    // No other table changes — child tables (_originalProductId,
    // _transferredAt) are written at merge time as plain fields;
    // they do not need indexes at this stage.
    // ============================================================
    this.version(4).stores({
      Products: [
        '&id',
        'normalizedName',
        'productName',
        'genericName',
        'brand',
        'dosageForm',
        'category',
        'lifecycleStatus',
        'mergedIntoId',          // NEW: index for merge chain queries
        'preferredSupplierId',
        'createdAt',
        'updatedAt',
      ].join(', '),

      // action indexed for efficient merge/status_change history queries
      AuditLog: '++_rowid, entity, entityId, action, performedBy, performedAt',
    });

    // ============================================================
    // VERSION 5 — Production Commit Engine (DT-003B)
    //
    // New table:
    //   ImportAudit — one record per completed import batch.
    //   Tracks file, timing, row counts, result, and IME version.
    //   IMP-NNNNNN primary key.
    // ============================================================
    this.version(5).stores({
      ImportAudit:
        '&id, workbookName, workbookType, importDate, overallResult, imeVersion',
    });

    // ============================================================
    // VERSION 6 — Receiving Workflow (DT-004)
    //
    // New table:
    //   ReceivingSessions — one record per supplier delivery event.
    //   REC-NNNNNN primary key.
    //   Statuses: Draft | In Review | Ready to Commit | Completed | Cancelled
    //
    // Products schema additions:
    //   weightedAvgCost  — recomputed on every receiving commit
    //   lastCost         — unit cost from the most recent receipt
    //   lastReceivedDate — timestamp of most recent receiving session
    //   currentStock     — total quantityAvailable across all active lots
    //                      (denormalized for fast dashboard reads; updated at commit time)
    // ============================================================
    this.version(6).stores({
      ReceivingSessions:
        '&id, supplierId, invoiceNumber, status, receivedDate, createdAt',

      // Products: add indexed fields for inventory intelligence
      Products: [
        '&id',
        'normalizedName',
        'productName',
        'genericName',
        'brand',
        'dosageForm',
        'category',
        'lifecycleStatus',
        'mergedIntoId',
        'preferredSupplierId',
        'createdAt',
        'updatedAt',
        // weightedAvgCost, lastCost, lastReceivedDate, currentStock stored as plain fields
      ].join(', '),
    });

    // ============================================================
    // VERSION 7 — Demand Log (DT-007)
    //
    // Demand table upgraded with full operational schema:
    //   status       — Open | Resolved | Ignored | Converted | Merged
    //   reason       — standard vocabulary (indexed for analytics)
    //   requestedQty — what customer asked for
    //   suppliedQty  — what pharmacy could provide (0 = fully unmet)
    //   missingQty   — requestedQty - suppliedQty (computed at save time)
    //   customerType — Walk-in | Prescription | Phone | Other
    //   productName  — raw name as spoken/written (allows unknown products)
    //   estimatedPrice — for lost revenue calculation
    //   evidenceData — base64 image/prescription (stored inline)
    //   evidenceType — 'image' | 'prescription' | 'pack' | 'ocr_text' | null
    //   evidenceNotes— free-text from evidence review
    //   notes        — general notes
    //   supplierId   — linked supplier (optional)
    //   sessionId    — linked receiving session (when resolved via receiving)
    //   resolvedAt   — when status moved to Resolved/Converted
    // ============================================================
    this.version(7).stores({
      Demand: [
        '&id',
        'productId',
        'productName',
        'status',
        'reason',
        'loggedAt',
        'supplierId',
        'sessionId',
        'customerType',
        'createdAt',
      ].join(', '),
    });

    // ============================================================
    // VERSION 8 — Product Commercial Profile (DT-004B)
    //
    // Implements DM-001: Product Commercial Profile.
    //
    // New table: ProductCommercialProfiles
    //   &id              — CPS-NNNNNN primary key
    //   &productId       — unique one-to-one with Products
    //   pricingStatus    — indexed: Current|ReviewRequired|AtRisk|ManualOverride
    //   updatedAt        — indexed for recency queries
    //
    //   Plain (unindexed) fields:
    //   replacementCostSnapshot  — object: { amount, supplierId, supplierName,
    //                               source, timestamp, confidence }
    //   activeSellingPrice       — number|null — unified shelf price
    //   pricingProfileVersion    — number — incremented on each update
    //   commercialJustification  — string|null — placeholder (PIE populates)
    //   marginQuality            — string|null — placeholder (PIE populates)
    //   capitalExposure          — number|null — placeholder
    //   recoveryOpportunity      — number|null — placeholder
    //   generatedAt              — timestamp of first creation
    //
    // New table: CommercialPriceHistory
    //   Replaces the empty PriceHistory stub from v1/v2.
    //   One record per commercial change — immutable audit trail.
    //   &id              — CPH-NNNNNN primary key
    //   productId        — indexed
    //   changeType       — indexed: 'SellingPrice'|'ReplacementCost'|'PricingStatus'
    //   changedAt        — indexed
    //
    // BACKWARD COMPATIBILITY:
    //   Products.lastCost and InventoryLots.sellingPrice remain intact.
    //   Legacy reads still work. CommercialProfileService becomes the
    //   preferred read path but does not enforce exclusivity until v9.
    // ============================================================
    this.version(8).stores({
      ProductCommercialProfiles:
        '&id, &productId, pricingStatus, updatedAt',

      CommercialPriceHistory:
        '&id, productId, changeType, changedAt',
    });

    // ============================================================
    // VERSION 9 — Receiving Lines Persistence (DT-004-v9)
    //
    // Adds ReceivingLines table so that invoice lines entered during
    // a receiving session survive navigation events.
    //
    // Previously, lines lived only in a module-level JS array in
    // receivingSession.js. Navigating away (Back) then reopening the
    // session reset the array to [], causing "No lines yet" — the
    // core symptom of BLOCKER-003 / BLOCKER-004.
    //
    // Table: ReceivingLines
    //   &id           — RL-NNNNNN primary key
    //   sessionId     — FK to ReceivingSessions (indexed — primary query key)
    //   lineNumber    — 1-based within session
    //   productId     — null if unresolved
    //   createdAt     — indexed for ordering
    //
    //   Plain (unindexed) fields mirror the ReceivingLine shape:
    //   productName, matchedName, confidence, supplierId,
    //   batchNumber, expiryDate, quantity, unit, unitCost,
    //   sellingPrice, shelfLocation, ownerType, notes, reviewReasons[]
    //
    // BACKWARD COMPATIBILITY:
    //   Existing sessions with in-memory-only lines are already committed
    //   or lost (they were never persisted). No data migration required.
    // ============================================================
    this.version(9).stores({
      ReceivingLines: '&id, sessionId, lineNumber, createdAt',
    });

    // ============================================================
    // VERSION 10 — Receiving Persistence Architecture (RPA-001)
    //
    // Upgrades ReceivingLines with:
    //   status    — Draft | Review | Committed | Archived
    //               Enables soft archival — lines are NEVER physically deleted.
    //               Physical deletion destroys invoice history, supplier dispute
    //               records, and regulatory audit trails.
    //   updatedAt — tracks last modification for sync and analytics
    //
    // The architecture change: ReceivingLines is now the SINGLE SOURCE OF
    // TRUTH for invoice lines. The screen never uses a module-level array
    // for correctness — only as a render cache rebuilt from the DB on every
    // entry. commitReceivingSession() reads lines directly from ReceivingLines
    // and archives them (status → Committed) rather than deleting them.
    //
    // ReceivingAttachments table (future-ready):
    //   Prepared for OCR invoice capture, supplier dispute documentation,
    //   and regulatory compliance. No UI or upload feature is implemented
    //   in this version. The table exists so that attachments can be
    //   associated with sessions and lines without a future schema migration.
    // ============================================================
    this.version(10).stores({
      ReceivingLines: '&id, sessionId, lineNumber, status, productId, createdAt, updatedAt',

      ReceivingAttachments:
        '&id, sessionId, lineId, attachmentType, mimeType, createdAt',
    });
  }
}

// ---- Singleton ----
const db = new DglopaDB();

// ================================================================
// SEED DATA (DT-002A lookup tables)
// ================================================================

const SEED_UNITS = [
  { name: 'Tablet',  symbol: 'tab',  status: 'Active' },
  { name: 'Capsule', symbol: 'cap',  status: 'Active' },
  { name: 'Bottle',  symbol: 'btl',  status: 'Active' },
  { name: 'Vial',    symbol: 'vial', status: 'Active' },
  { name: 'Ampoule', symbol: 'amp',  status: 'Active' },
  { name: 'Sachet',  symbol: 'sac',  status: 'Active' },
  { name: 'Tube',    symbol: 'tube', status: 'Active' },
  { name: 'Pack',    symbol: 'pk',   status: 'Active' },
  { name: 'Strip',   symbol: 'str',  status: 'Active' },
  { name: 'Piece',   symbol: 'pc',   status: 'Active' },
  { name: 'ml',      symbol: 'ml',   status: 'Active' },
  { name: 'g',       symbol: 'g',    status: 'Active' },
  { name: 'L',       symbol: 'L',    status: 'Active' },
  { name: 'mg',      symbol: 'mg',   status: 'Active' },
];

const SEED_DOSAGE_FORMS = [
  'Tablet','Capsule','Syrup','Suspension','Solution','Injection',
  'Cream','Ointment','Gel','Drops','Inhaler','Suppository',
  'Patch','Powder','Sachet','Lozenge','Spray','Pessary','Enema','Other',
].map((name) => ({ name, status: 'Active' }));

const SEED_CATEGORIES = [
  'Analgesic','Antibiotic','Antifungal','Antiviral','Antihypertensive',
  'Antidiabetic','Cardiovascular','CNS','Dermatology','ENT',
  'Gastrointestinal','Haematology','Hormones & Endocrinology','Immunology',
  'Nutritional','Ophthalmology','Respiratory','Urinary',
  'Vitamins & Supplements','Antimalarial','Antiparasitic','Wound Care','Other',
].map((name) => ({ name, status: 'Active' }));

async function runMigration003() {
  const [u, f, c] = await Promise.all([
    db.Units.count(), db.DosageForms.count(), db.Categories.count(),
  ]);
  const tasks = [];
  if (u === 0) tasks.push(db.Units.bulkAdd(SEED_UNITS));
  if (f === 0) tasks.push(db.DosageForms.bulkAdd(SEED_DOSAGE_FORMS));
  if (c === 0) tasks.push(db.Categories.bulkAdd(SEED_CATEGORIES));
  if (tasks.length > 0) {
    await Promise.all(tasks);
    console.info('[DB] Migration 003: lookup tables seeded.');
  }
}

// ================================================================
// MIGRATION 008 — Seed ProductCommercialProfiles (DT-004B)
// ================================================================

/**
 * Seeds one CommercialProfile per existing product that does not
 * already have one. Safe to run on every startup — idempotent.
 *
 * Seeding strategy:
 *   replacementCostSnapshot ← Products.lastCost (if present)
 *     source: 'migration', confidence: 'Low' (provenance unknown)
 *   activeSellingPrice ← most recent InventoryLots.sellingPrice
 *     for this product (if any lot has one)
 *   pricingStatus ← 'Current'
 *   all placeholder fields ← null
 */
async function runMigration008() {
  if (db.verno < 8) return; // schema not yet at v8

  const [products, existingProfiles, allLots] = await Promise.all([
    db.Products.toArray(),
    db.ProductCommercialProfiles.toArray(),
    db.InventoryLots.toArray(),
  ]);

  const existingIds = new Set(existingProfiles.map((p) => p.productId));
  const toSeed      = products.filter((p) => !existingIds.has(p.id));

  if (toSeed.length === 0) return;

  // Build productId → latest sellingPrice lookup from lots
  const lotPriceMap = new Map();
  for (const lot of allLots) {
    if (!lot.productId || lot.sellingPrice == null) continue;
    const existing = lotPriceMap.get(lot.productId);
    if (!existing || lot.createdAt > existing.createdAt) {
      lotPriceMap.set(lot.productId, lot);
    }
  }

  const now = Date.now();
  let seq = 0;

  const profiles = toSeed.map((product) => {
    const pricedLot = lotPriceMap.get(product.id);
    seq++;

    const replacementCostSnapshot = product.lastCost != null
      ? {
          amount:       product.lastCost,
          supplierId:   product.preferredSupplierId || null,
          supplierName: null, // resolved at read time
          source:       'migration',
          timestamp:    product.lastReceivedDate || now,
          confidence:   'Low',
        }
      : null;

    return {
      id:                    `CPS-${String(now).slice(-6)}${String(seq).padStart(4,'0')}`,
      productId:             product.id,
      replacementCostSnapshot,
      activeSellingPrice:    pricedLot?.sellingPrice ?? null,
      pricingStatus:         'Current',
      pricingProfileVersion: 1,
      commercialJustification: null,
      marginQuality:           null,
      capitalExposure:         null,
      recoveryOpportunity:     null,
      generatedAt:  now,
      updatedAt:    now,
    };
  });

  if (profiles.length > 0) {
    await db.ProductCommercialProfiles.bulkAdd(profiles);
    console.info(`[DB] Migration 008: seeded ${profiles.length} CommercialProfile${profiles.length !== 1 ? 's' : ''}.`);
  }
}

// ================================================================
// LIFECYCLE
// ================================================================

export async function openDB() {
  try {
    await db.open();
    await _recordMigrations();
    await runMigration003();
    await runMigration008();
    console.info('[DB] DglopaDB opened — version', db.verno);
    return db;
  } catch (err) {
    console.error('[DB] Failed to open:', err);
    throw err;
  }
}

async function _recordMigrations() {
  const migrations = [
    { id: '001_initial',                       dexieVersion: 1 },
    { id: '002_product_master',                dexieVersion: 2 },
    { id: '003_product_master_enhancements',   dexieVersion: 3 },
    { id: '004_merge_framework_soft_delete',   dexieVersion: 4 },
    { id: '005_import_audit',                   dexieVersion: 5 },
    { id: '006_receiving_workflow',              dexieVersion: 6 },
    { id: '007_demand_log',                       dexieVersion: 7 },
    { id: '008_product_commercial_profile',        dexieVersion: 8 },
    { id: '009_receiving_lines_persistence',         dexieVersion: 9 },
    { id: '010_receiving_persistence_architecture',    dexieVersion: 10 },
  ];
  for (const m of migrations) {
    if (db.verno >= m.dexieVersion) {
      const existing = await db.Settings.get(`migration_${m.id}`);
      if (!existing) {
        await db.Settings.put({
          key:       `migration_${m.id}`,
          value:     m.id,
          appliedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  }
}

export async function getDBVersion()     { return db.verno; }
export async function exportDBSnapshot() { throw new Error('Export not yet implemented'); }
export async function importDBSnapshot() { throw new Error('Import not yet implemented'); }

export { db };
