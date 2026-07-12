/**
 * DGLOPA PLATFORM — IME — COMMIT ENGINE
 * DT-003B: Production Commit Engine.
 *
 * Entry point: commitImport(pipelineResult, options)
 *
 * Commit order (respects FK dependencies per spec):
 *   1. Suppliers
 *   2. Products
 *   3. Product Aliases
 *   4. Inventory Lots
 *   5. Stock Movements (one RECEIPT movement per committed lot)
 *   6. Purchase History
 *   7. Review Queue
 *   8. ImportAudit
 *
 * ALL writes occur inside ONE Dexie transaction.
 * Either everything commits, or nothing commits.
 * Partial imports are impossible.
 *
 * Rows with error-severity issues route to ReviewQueue, not to production
 * tables. Rows with only warning-severity issues commit normally (per the
 * DT-003AA audit blueprint: selling price and cost absences are near-
 * universal warnings for this dataset, not blockers).
 *
 * options shape:
 *   {
 *     batchSupplierName:  string|null,  // fixed supplier for the whole batch
 *     batchWorkbookType:  string,       // 'Consignment' | 'General Inventory'
 *     imeVersion:         string,       // e.g. '1.4.0'
 *     user:               string,       // optional staff label
 *     notes:              string,       // optional import notes
 *     businessRulesVersion: string,     // e.g. 'v1'
 *   }
 */

import { db } from '../../db/database.js';
import { nextId } from '../../utils/idGenerator.js';
import { buildDedupKey } from '../../utils/normalizer.js';
import { splitQuantity, canonicalUnit } from '../../utils/quantitySplitter.js';
import { SEVERITY } from './validationEngine.js';

const IME_VERSION = '1.4.0';
const BUSINESS_RULES_VERSION = 'v1';

// ================================================================
// PUBLIC ENTRY POINT
// ================================================================

/**
 * Commit a validated PipelineResult into the database.
 *
 * @param {PipelineResult} pipelineResult — from runImportPipeline()
 * @param {object}         options
 * @param {function}       [onProgress]  — (stageName, current, total) => void
 * @returns {Promise<CommitResult>}
 */
export async function commitImport(pipelineResult, options = {}, onProgress = () => {}) {
  const {
    batchSupplierName   = null,
    batchWorkbookType   = 'General Inventory',
    imeVersion          = IME_VERSION,
    user                = 'system',
    notes               = '',
    businessRulesVersion = BUSINESS_RULES_VERSION,
  } = options;

  const startTime = Date.now();

  // Pre-flight: must have zero error-severity issues to commit production rows
  const errorRows = new Set(
    pipelineResult.validationIssues
      .filter((i) => i.severity === SEVERITY.ERROR)
      .map((i) => i.rowIndex)
  );

  const { normalizedRows, productMatches, supplierMatches, reviewQueue } = pipelineResult;
  const sourceFile = pipelineResult.sourceFile;

  // Classify rows: commit candidates vs review-queue candidates
  const commitRows = normalizedRows.filter((r) => !errorRows.has(r._rowIndex));
  const reviewRows = normalizedRows.filter((r) =>  errorRows.has(r._rowIndex));

  const counters = {
    rowsRead:     normalizedRows.length,
    rowsImported: 0,
    rowsUpdated:  0,
    rowsSkipped:  0,
    rowsReviewed: reviewRows.length,
    rowsFailed:   0,
  };

  let overallResult = 'Success';
  let importId = null;

  try {
    // ---- Generate all IDs outside the transaction to minimise lock time ----
    onProgress('Generating identifiers…', 0, commitRows.length);
    const ids = await _preAllocateIds(commitRows, batchSupplierName);

    // ---- Single atomic transaction covers all production writes ----
    onProgress('Writing to database…', 0, commitRows.length);

    await db.transaction(
      'rw',
      [
        db.Suppliers, db.Products, db.ProductAliases,
        db.InventoryLots, db.StockMovements, db.PurchaseHistory,
        db.ReviewQueue, db.ImportAudit, db.AuditLog, db.Settings,
      ],
      async () => {

        // ---- STAGE 1: Suppliers ----
        const supplierIdMap = await _commitSuppliers(
          commitRows, supplierMatches, ids.suppliers, batchSupplierName
        );

        // ---- STAGE 2: Products ----
        const productIdMap = await _commitProducts(
          commitRows, productMatches, ids.products, counters
        );

        // ---- STAGE 3: Product Aliases ----
        await _commitProductAliases(commitRows, productIdMap, ids.aliases);

        // ---- STAGE 4: Inventory Lots ----
        const lotIdMap = await _commitInventoryLots(
          commitRows, productIdMap, supplierIdMap, ids.lots, counters, onProgress
        );

        // ---- STAGE 5: Stock Movements (RECEIPT per lot) ----
        await _commitStockMovements(lotIdMap, productIdMap, ids.movements);

        // ---- STAGE 6: Purchase History ----
        await _commitPurchaseHistory(
          commitRows, productIdMap, supplierIdMap, lotIdMap, ids.purchases,
          sourceFile.name
        );

        // ---- STAGE 7: Review Queue (error rows + warning-only rows that need review) ----
        await _commitReviewQueue(
          reviewQueue, reviewRows, pipelineResult.validationIssues, ids.reviews
        );

        // ---- STAGE 8: ImportAudit ----
        importId = ids.importAuditId;
        const duration = Date.now() - startTime;
        await _commitImportAudit({
          id: importId,
          workbookName: sourceFile.name,
          workbookType: batchWorkbookType,
          importDate:   startTime,
          duration,
          ...counters,
          overallResult,
          imeVersion,
          businessRulesVersion,
          user,
          notes,
        });

        // ---- AuditLog entry for the batch ----
        await db.AuditLog.add({
          entity:      'ImportAudit',
          entityId:    importId,
          action:      'IMPORT_COMMIT',
          detail:      { workbookName: sourceFile.name, counters },
          performedBy: user,
          performedAt: startTime,
        });
      }
    );

  } catch (err) {
    overallResult = 'Failed';
    counters.rowsFailed = commitRows.length - counters.rowsImported - counters.rowsUpdated - counters.rowsSkipped;
    console.error('[CommitEngine] Transaction failed — automatic rollback applied:', err);
    throw new CommitError(
      `Import failed and was automatically rolled back. Database is unchanged.\n\nReason: ${err.message}`,
      err
    );
  }

  onProgress('Done.', counters.rowsImported, commitRows.length);

  return {
    importId,
    overallResult,
    duration: Date.now() - startTime,
    ...counters,
  };
}

// ================================================================
// ID PRE-ALLOCATION
// Pre-generate all required IDs before the transaction opens so
// ID generation (which uses its own nested transaction against
// db.Settings) does not need to nest inside the main transaction.
// ================================================================

async function _preAllocateIds(commitRows, batchSupplierName) {
  const needNewSupplier = batchSupplierName ? 1 : 0;
  const maxNewProducts  = commitRows.length; // upper bound; actual may be fewer
  const maxAliases      = commitRows.length;
  const maxLots         = commitRows.length;
  const maxMovements    = commitRows.length;
  const maxPurchases    = commitRows.length;
  const maxReviews      = commitRows.length * 3; // up to 3 issues per row

  const [
    supplierIds, productIds, aliasIds, lotIds, movementIds, purchaseIds, reviewIds, importAuditId,
  ] = await Promise.all([
    _genIds('Supplier',       needNewSupplier),
    _genIds('Product',        maxNewProducts),
    _genIds('ProductAlias',   maxAliases),
    _genIds('InventoryLot',   maxLots),
    _genIds('StockMovement',  maxMovements),
    _genIds('PurchaseHistory',maxPurchases),
    _genIds('ReviewQueue',    maxReviews),
    nextId('ImportAudit'),
  ]);

  return {
    suppliers:      supplierIds,
    products:       productIds,
    aliases:        aliasIds,
    lots:           lotIds,
    movements:      movementIds,
    purchases:      purchaseIds,
    reviews:        reviewIds,
    importAuditId,
  };
}

// Generate N sequential IDs for a given entity type
async function _genIds(entity, count) {
  if (count === 0) return [];
  const ids = [];
  for (let i = 0; i < count; i++) ids.push(await nextId(entity));
  return ids;
}

// ================================================================
// STAGE 1 — SUPPLIERS
// ================================================================

async function _commitSuppliers(commitRows, supplierMatches, supplierIds, batchSupplierName) {
  const idMap = new Map(); // supplierName.lower -> supplierId
  let idCursor = 0;

  if (batchSupplierName) {
    // Batch-level fixed supplier (no column in source, per DT-003AA finding)
    const key = batchSupplierName.trim().toLowerCase();
    const existing = await db.Suppliers.where('supplierName').equalsIgnoreCase(batchSupplierName.trim()).first();
    if (existing) {
      idMap.set(key, existing.id);
    } else {
      const newId = supplierIds[idCursor++];
      const now   = Date.now();
      await db.Suppliers.add({
        id:           newId,
        supplierName: batchSupplierName.trim(),
        status:       'Active',
        createdAt:    now,
        updatedAt:    now,
      });
      idMap.set(key, newId);
    }
    return idMap;
  }

  // Per-row supplier matching results
  const processed = new Set();
  for (const match of supplierMatches) {
    if (match.matched) {
      idMap.set(match.supplierName?.toLowerCase(), match.supplierId);
    } else if (match.supplierName && !processed.has(match.supplierName.toLowerCase())) {
      processed.add(match.supplierName.toLowerCase());
      const newId = supplierIds[idCursor++];
      const now   = Date.now();
      await db.Suppliers.add({
        id:           newId,
        supplierName: match.supplierName.trim(),
        status:       'Active',
        createdAt:    now,
        updatedAt:    now,
      });
      idMap.set(match.supplierName.toLowerCase(), newId);
    }
  }

  return idMap;
}

// ================================================================
// STAGE 2 — PRODUCTS
// ================================================================

async function _commitProducts(commitRows, productMatches, productIds, counters) {
  const idMap    = new Map(); // rowIndex -> productId
  let   idCursor = 0;
  const createdNames = new Map(); // normalizedName -> productId (dedup within this batch)

  for (const row of commitRows) {
    const match = productMatches.find((m) => m.rowIndex === row._rowIndex);

    if (match?.matched) {
      // Existing product — use matched ID; no update (DT-003A spec: never modify products)
      idMap.set(row._rowIndex, match.productId);
    } else if (row.productName?.trim()) {
      // New product — check batch-level dedup first
      const dedupKey = buildDedupKey(row.productName, row.strength, row.dosageForm);
      if (createdNames.has(dedupKey)) {
        idMap.set(row._rowIndex, createdNames.get(dedupKey));
        counters.rowsSkipped++;
      } else {
        const newId = productIds[idCursor++];
        const now   = Date.now();
        await db.Products.add({
          id:              newId,
          productName:     row.productName.trim(),
          normalizedName:  dedupKey,
          genericName:     row.genericName?.trim()  || '',
          brand:           row.brand?.trim()         || '',
          strength:        row.strength?.trim()      || '',
          dosageForm:      row.dosageForm?.trim()    || '',
          category:        row.category?.trim()      || '',
          baseUnit:        _resolveUnit(row),
          receivingUnits:  '',
          sellingUnits:    '',
          lifecycleStatus: 'Active',
          healthScore:     null,
          preferredSupplierId: null,
          notes:           '',
          imageURL:        null,
          thumbnailURL:    null,
          mergedIntoId:    null,
          mergedDate:      null,
          mergedReason:    null,
          createdAt:       now,
          updatedAt:       now,
        });
        idMap.set(row._rowIndex, newId);
        createdNames.set(dedupKey, newId);
        counters.rowsImported++;
      }
    }
  }

  return idMap;
}

function _resolveUnit(row) {
  // Unit may come from the unit column directly, or be the unitHint from quantity splitting
  if (row.unit?.trim()) return canonicalUnit(row.unit.trim());
  const { unitHint } = splitQuantity(row._raw?.Qty || row._raw?.qty || '');
  return unitHint || 'Piece';
}

// ================================================================
// STAGE 3 — PRODUCT ALIASES
// ================================================================

async function _commitProductAliases(commitRows, productIdMap, aliasIds) {
  let idCursor = 0;
  const now = Date.now();

  for (const row of commitRows) {
    const productId = productIdMap.get(row._rowIndex);
    if (!productId || !row.productName?.trim()) continue;

    // If the product name came from a fuzzy/alias match, store the workbook name
    // as an alias on the matched product so future imports resolve it directly.
    const existingAlias = await db.ProductAliases
      .where('productId').equals(productId)
      .and((r) => r.alias.toLowerCase() === row.productName.trim().toLowerCase())
      .first();

    if (!existingAlias) {
      await db.ProductAliases.add({
        id:        aliasIds[idCursor++],
        productId,
        alias:     row.productName.trim(),
        source:    'import',
        createdAt: now,
      });
    }
  }
}

// ================================================================
// STAGE 4 — INVENTORY LOTS
// ================================================================

async function _commitInventoryLots(commitRows, productIdMap, supplierIdMap, lotIds, counters, onProgress) {
  const lotIdMap = new Map(); // rowIndex -> lotId
  let   idCursor = 0;
  const total    = commitRows.length;
  let   done     = 0;
  const now      = Date.now();

  for (const row of commitRows) {
    const productId = productIdMap.get(row._rowIndex);
    if (!productId) { counters.rowsSkipped++; done++; continue; }

    const { quantity } = splitQuantity(row.quantity ?? row._raw?.Qty ?? '');
    if (quantity == null || quantity <= 0) { counters.rowsSkipped++; done++; continue; }

    // Resolve supplier
    const supplierKey = row.supplierName?.toLowerCase() ?? '';
    const supplierId  = supplierIdMap.get(supplierKey) ?? null;

    // Status: recompute from expiry date (DT-003AA finding: source status may contradict expiry)
    const computedStatus = _computeLotStatus(row.expiryDate, row.shelfLocation);

    const lotId = lotIds[idCursor++];
    await db.InventoryLots.add({
      id:               lotId,
      productId,
      supplierId,
      invoiceId:        null,
      quantityReceived: quantity,
      quantityAvailable:quantity,
      unitCost:         row.unitCost    ?? null,
      sellingPrice:     row.sellingPrice ?? null,
      ownerType:        _resolveOwnerType(row.owner ?? row._raw?.Owner ?? ''),
      batchNumber:      row.batchNumber?.trim() || null,
      expiryDate:       row.expiryDate           ?? null,
      shelfLocation:    _normalizeShelf(row.shelfLocation ?? row._raw?.Shelf ?? ''),
      status:           computedStatus,
      createdAt:        now,
    });

    lotIdMap.set(row._rowIndex, lotId);
    counters.rowsImported++;
    done++;

    if (done % 10 === 0) onProgress('Writing lots…', done, total);
  }

  return lotIdMap;
}

function _resolveOwnerType(raw) {
  const v = String(raw ?? '').trim().toUpperCase();
  if (v === 'O' || v === '0') return 'Owner';
  if (v === 'C')              return 'Consignment';
  return 'Unknown';
}

function _normalizeShelf(raw) {
  const v = String(raw ?? '').trim();
  // "Shelf 04" -> "S04", strip trailing periods
  return v.replace(/^Shelf\s+0?(\d+)$/i, 'S0$1')
          .replace(/^Shelf\s+(\d{2,})$/i, 'S$1')
          .replace(/\.$/, '')
          .toUpperCase() || v;
}

function _computeLotStatus(expiryEpoch, shelf) {
  if (expiryEpoch == null) return 'Review';
  const now = Date.now();
  if (expiryEpoch < now) return 'Expired';
  const twelveMonths = now + 365 * 24 * 60 * 60 * 1000;
  if (expiryEpoch < twelveMonths) return 'Action Needed';
  return 'Active';
}

// ================================================================
// STAGE 5 — STOCK MOVEMENTS (one RECEIPT per lot)
// ================================================================

async function _commitStockMovements(lotIdMap, productIdMap, movementIds) {
  let idCursor = 0;
  const now    = Date.now();

  for (const [rowIndex, lotId] of lotIdMap.entries()) {
    const productId = productIdMap.get(rowIndex);
    if (!productId) continue;
    await db.StockMovements.add({
      id:           movementIds[idCursor++],
      productId,
      lotId,
      movementType: 'Receipt',
      quantity:     null,  // stored on the lot; movement records the event
      balanceAfter: null,  // calculated by a future stock-level service
      reason:       'Import',
      timestamp:    now,
    });
  }
}

// ================================================================
// STAGE 6 — PURCHASE HISTORY
// ================================================================

async function _commitPurchaseHistory(commitRows, productIdMap, supplierIdMap, lotIdMap, purchaseIds, workbookName) {
  let idCursor = 0;
  const now    = Date.now();

  for (const row of commitRows) {
    const productId = productIdMap.get(row._rowIndex);
    const lotId     = lotIdMap.get(row._rowIndex);
    if (!productId || row.unitCost == null) continue; // no cost = nothing meaningful to record

    const supplierKey = row.supplierName?.toLowerCase() ?? '';
    const supplierId  = supplierIdMap.get(supplierKey) ?? null;
    const { quantity } = splitQuantity(row.quantity ?? '');

    await db.PurchaseHistory.add({
      id:            purchaseIds[idCursor++],
      productId,
      supplierId,
      invoiceNumber: workbookName,
      quantity:      quantity ?? null,
      unitCost:      row.unitCost,
      purchaseDate:  now,
    });
  }
}

// ================================================================
// STAGE 7 — REVIEW QUEUE
// ================================================================

async function _commitReviewQueue(inMemoryQueue, errorRows, validationIssues, reviewIds) {
  let idCursor = 0;
  const now    = Date.now();

  // Persist every in-memory review queue entry that has a real DB-spec shape
  for (const entry of inMemoryQueue) {
    await db.ReviewQueue.add({
      id:          reviewIds[idCursor++],
      category:    entry.category,
      severity:    entry.severity,
      assignedTo:  null,
      dueDate:     null,
      status:      'Pending',
      notes:       entry.notes,
      // Extended fields (for IME traceability beyond the base schema)
      rowIndex:           entry.rowIndex,
      description:        entry.description,
      suggestedResolution:entry.suggestedResolution,
      ruleTriggered:      entry.category,
      originalValue:      null,   // future: capture the raw cell value
      suggestedValue:     null,
      reason:             entry.description,
      confidence:         'Low',  // no confidence engine yet (deferred per spec)
      createdAt:          now,
    });
  }
}

// ================================================================
// STAGE 8 — IMPORT AUDIT
// ================================================================

async function _commitImportAudit(record) {
  await db.ImportAudit.add(record);
}

// ================================================================
// CUSTOM ERROR CLASS
// ================================================================

export class CommitError extends Error {
  constructor(message, cause) {
    super(message);
    this.name    = 'CommitError';
    this.cause   = cause;
  }
}
