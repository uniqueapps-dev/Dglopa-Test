/**
 * DGLOPA PLATFORM — RECEIVING COMMIT SERVICE
 * RPA-001: Receiving Persistence Architecture
 *
 * Commits a validated receiving session to inventory.
 *
 * ARCHITECTURE CHANGE (RPA-001):
 *   Previously accepted a `lines` array from the caller.
 *   Now reads lines directly from ReceivingLines (DB) via receivingLineService.
 *   The caller passes only the sessionId. This makes the commit reproducible
 *   and independent of any in-memory state.
 *
 * SOFT ARCHIVAL (RPA-001):
 *   After a successful commit, lines are marked Committed — never deleted.
 *   Invoice history, supplier dispute records, and audit trails are preserved.
 *
 * PIPELINE:
 *   1. InventoryLots        — one lot per committed line
 *   2. StockMovements       — one RECEIPT movement per lot
 *   3. PurchaseHistory      — one record per committed line
 *   4. Products             — WAC, lastCost, currentStock, lastReceivedDate
 *   4B. CommercialProfile   — ReplacementCostSnapshot (Verified) + activeSellingPrice
 *       (post-transaction, non-fatal)
 *   5. ReviewQueue          — one entry per review reason on unresolved lines
 *   6. ReceivingSession     — status → Completed, counts written
 *   7. AuditLog             — single batch audit entry
 *   8. ReceivingLines       — status → Committed (soft archival)
 */

import { db }                from '../db/database.js';
import { nextId }            from '../utils/idGenerator.js';
import { SESSION_STATUSES }  from './receivingSessionService.js';
import {
  getLinesForSession,
  commitLines,
  LINE_STATUS,
}                            from './receivingLineService.js';
import {
  updateReplacementCostFromReceiving,
  setActiveSellingPrice,
}                            from './commercialProfileService.js';

const IME_VERSION = '1.4.0';

// ================================================================
// PUBLIC ENTRY POINT
// ================================================================

/**
 * Commit all lines for a session from the ReceivingLines table to inventory.
 *
 * @param {string} sessionId
 * @param {string} [operator]
 * @returns {Promise<CommitResult>}
 */
export async function commitReceivingSession(sessionId, operator = 'system') {
  const session = await db.ReceivingSessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  if (session.status === SESSION_STATUSES.COMPLETED) {
    throw new Error(`Session ${sessionId} is already completed.`);
  }
  if (session.status === SESSION_STATUSES.CANCELLED) {
    throw new Error(`Session ${sessionId} is cancelled and cannot be committed.`);
  }

  const startTime = Date.now();

  // ---- Read lines from DB (not from caller) ----
  const allLines    = await getLinesForSession(sessionId);
  const commitLines_ = allLines.filter((l) => l.productId && l.quantity > 0 && !l.reviewReasons?.length);
  const reviewLines = allLines.filter((l) => !l.productId || l.quantity <= 0 || l.reviewReasons?.length);

  const counters = {
    linesRead:     allLines.length,
    linesImported: 0,
    linesReviewed: reviewLines.length,
    linesFailed:   0,
  };

  // Pre-allocate IDs outside the transaction
  const lotIds = await _genIds('InventoryLot',    commitLines_.length);
  const movIds = await _genIds('StockMovement',   commitLines_.length);
  const purIds = await _genIds('PurchaseHistory', commitLines_.length);
  const revIds = await _genIds('ReviewQueue',     reviewLines.length * 3);

  try {
    await db.transaction('rw', [
      db.InventoryLots, db.StockMovements, db.PurchaseHistory,
      db.Products, db.ReviewQueue, db.ReceivingSessions, db.AuditLog,
    ], async () => {

      // ---- Stage 1: Inventory Lots ----
      const lotMap = new Map();
      for (let i = 0; i < commitLines_.length; i++) {
        const line  = commitLines_[i];
        const lotId = lotIds[i];
        await db.InventoryLots.add({
          id:                lotId,
          productId:         line.productId,
          supplierId:        line.supplierId || session.supplierId || null,
          invoiceId:         sessionId,
          quantityReceived:  line.quantity,
          quantityAvailable: line.quantity,
          unitCost:          line.unitCost        ?? null,
          sellingPrice:      line.sellingPrice     ?? null,
          ownerType:         line.ownerType       || 'Owner',
          batchNumber:       line.batchNumber?.trim() || null,
          expiryDate:        line.expiryDate       ?? null,
          shelfLocation:     line.shelfLocation?.trim() || null,
          status:            _computeLotStatus(line.expiryDate),
          createdAt:         startTime,
        });

        if (!lotMap.has(line.productId)) lotMap.set(line.productId, []);
        lotMap.get(line.productId).push({ qty: line.quantity, cost: line.unitCost, lotId, sellingPrice: line.sellingPrice });
        counters.linesImported++;
      }

      // ---- Stage 2: Stock Movements ----
      for (let i = 0; i < commitLines_.length; i++) {
        await db.StockMovements.add({
          id:           movIds[i],
          productId:    commitLines_[i].productId,
          lotId:        lotIds[i],
          movementType: 'Receipt',
          quantity:     commitLines_[i].quantity,
          balanceAfter: null,
          reason:       `Receiving session ${sessionId}`,
          timestamp:    startTime,
        });
      }

      // ---- Stage 3: Purchase History ----
      for (let i = 0; i < commitLines_.length; i++) {
        const line = commitLines_[i];
        await db.PurchaseHistory.add({
          id:            purIds[i],
          productId:     line.productId,
          supplierId:    line.supplierId || session.supplierId || null,
          invoiceNumber: session.invoiceNumber || sessionId,
          quantity:      line.quantity,
          unitCost:      line.unitCost ?? null,
          purchaseDate:  startTime,
        });
      }

      // ---- Stage 4: Products — WAC, lastCost, currentStock, lastReceivedDate ----
      for (const [productId, lots] of lotMap.entries()) {
        await _updateProductInventoryFields(productId, lots, startTime);
      }

      // ---- Stage 5: Review Queue ----
      let revIdx = 0;
      for (const line of reviewLines) {
        const reasons = line.reviewReasons?.length ? line.reviewReasons : ['Unresolved receiving line'];
        for (const reason of reasons) {
          await db.ReviewQueue.add({
            id:                  revIds[revIdx++],
            category:            'Receiving',
            severity:            'warning',
            assignedTo:          null,
            dueDate:             null,
            status:              'Pending',
            notes:               `Session ${sessionId} — Line ${line.lineNumber}: ${reason}`,
            rowIndex:            line.lineNumber,
            description:         reason,
            suggestedResolution: line.productId ? 'Review lot details' : 'Match or create product before re-committing',
            ruleTriggered:       reason,
            originalValue:       line.productName,
            suggestedValue:      null,
            reason,
            confidence:          'Low',
            createdAt:           startTime,
          });
        }
      }

      // ---- Stage 6: Complete Session ----
      await db.ReceivingSessions.update(sessionId, {
        status:        SESSION_STATUSES.COMPLETED,
        lineCount:     allLines.length,
        linesImported: counters.linesImported,
        linesReviewed: counters.linesReviewed,
        completedAt:   startTime,
        updatedAt:     startTime,
        duration:      Date.now() - startTime,
      });

      // ---- Stage 7: AuditLog ----
      await db.AuditLog.add({
        entity:      'ReceivingSessions',
        entityId:    sessionId,
        action:      'RECEIVING_COMMIT',
        detail:      { counters, invoiceNumber: session.invoiceNumber, imeVersion: IME_VERSION },
        performedBy: operator,
        performedAt: startTime,
      });
    });

  } catch (err) {
    counters.linesFailed = commitLines_.length - counters.linesImported;
    console.error('[ReceivingCommit] Transaction failed — rolled back:', err);
    throw new Error(`Receiving commit failed and was rolled back. Database is unchanged.\n\nReason: ${err.message}`);
  }

  // ---- Stage 4B: CommercialProfile — post-transaction (non-fatal) ----
  // Runs outside the Dexie transaction so CommercialPriceHistory can be written.
  for (const line of commitLines_) {
    if (line.unitCost != null) {
      await updateReplacementCostFromReceiving(line.productId, {
        amount:      line.unitCost,
        supplierId:  line.supplierId || session.supplierId || null,
        supplierName: null,
      }, startTime).catch((err) =>
        console.warn('[ReceivingCommit] Stage 4B snapshot failed (non-fatal):', line.productId, err.message)
      );
    }
    if (line.sellingPrice != null) {
      await setActiveSellingPrice(line.productId, line.sellingPrice, {
        notes: `Receiving — invoice ${session.invoiceNumber || sessionId}`,
      }).catch((err) =>
        console.warn('[ReceivingCommit] Stage 4B price failed (non-fatal):', line.productId, err.message)
      );
    }
  }

  // ---- Stage 8: Soft-archive ReceivingLines (RPA-001) ----
  await commitLines(sessionId).catch((err) =>
    console.warn('[ReceivingCommit] Stage 8 line archival failed (non-fatal):', err.message)
  );

  return {
    sessionId,
    duration:      Date.now() - startTime,
    overallResult: 'Completed',
    ...counters,
  };
}

// ================================================================
// INTERNAL HELPERS
// ================================================================

async function _updateProductInventoryFields(productId, newLots, timestamp) {
  const allLots = await db.InventoryLots
    .where('productId').equals(productId)
    .and((l) => l.status !== 'Expired' && l.quantityAvailable > 0)
    .toArray();

  let totalQty  = 0;
  let totalCost = 0;
  let hasCost   = false;
  let lastCost  = null;

  for (const lot of allLots) {
    totalQty += lot.quantityAvailable;
    if (lot.unitCost != null) {
      totalCost += lot.quantityAvailable * lot.unitCost;
      hasCost    = true;
      lastCost   = lot.unitCost;
    }
  }

  const wac = hasCost && totalQty > 0 ? totalCost / totalQty : null;
  const mostRecent = newLots[newLots.length - 1];
  if (mostRecent?.cost != null) lastCost = mostRecent.cost;

  await db.Products.update(productId, {
    currentStock:       totalQty,
    weightedAvgCost:    wac,
    lastCost,
    lastReceivedDate:   timestamp,
    updatedAt:          timestamp,
  });
}

function _computeLotStatus(expiryEpoch) {
  if (expiryEpoch == null) return 'Review';
  const now          = Date.now();
  const twelveMonths = now + 365 * 24 * 60 * 60 * 1000;
  if (expiryEpoch < now)          return 'Expired';
  if (expiryEpoch < twelveMonths) return 'Action Needed';
  return 'Active';
}

async function _genIds(entity, count) {
  if (count === 0) return [];
  const ids = [];
  for (let i = 0; i < count; i++) ids.push(await nextId(entity));
  return ids;
}
