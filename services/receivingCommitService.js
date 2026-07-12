/**
 * DGLOPA PLATFORM — RECEIVING COMMIT SERVICE
 * DT-004: Commits a validated receiving session into inventory.
 *
 * One atomic Dexie transaction per session commit:
 *   1. InventoryLots — one lot per committed line
 *   2. StockMovements — one RECEIPT movement per lot
 *   3. PurchaseHistory — one record per committed line
 *   4. Products — update currentStock, lastCost, weightedAvgCost, lastReceivedDate
 *   5. ReviewQueue — persist flagged lines
 *   6. ReceivingSession — mark Completed + write summary
 *   7. AuditLog — batch entry
 *
 * Lines with unresolved productId route to ReviewQueue; they do NOT
 * enter InventoryLots. The session is still marked Completed if at
 * least one line committed successfully.
 *
 * ReceivingLine shape (prepared by the UI / line entry service):
 *   {
 *     lineNumber:    number,       // 1-based within the session
 *     productId:     string|null,  // null = unresolved → ReviewQueue
 *     productName:   string,       // raw name from invoice
 *     supplierId:    string|null,
 *     batchNumber:   string,
 *     expiryDate:    number|null,  // epoch ms
 *     quantity:      number,
 *     unitCost:      number|null,
 *     sellingPrice:  number|null,
 *     shelfLocation: string,
 *     ownerType:     'Owner'|'Consignment',
 *     reviewReasons: string[],     // populated by validation
 *   }
 */

import { db }           from '../db/database.js';
import { nextId }       from '../utils/idGenerator.js';
import { SESSION_STATUSES, advanceStatus, incrementLineCount } from './receivingSessionService.js';

const IME_VERSION = '1.4.0';

// ================================================================
// PUBLIC ENTRY POINT
// ================================================================

/**
 * @param {string}           sessionId
 * @param {ReceivingLine[]}  lines
 * @param {string}           [operator]
 * @returns {Promise<CommitResult>}
 */
export async function commitReceivingSession(sessionId, lines, operator = 'system') {
  const session = await db.ReceivingSessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  if (session.status === SESSION_STATUSES.COMPLETED) {
    throw new Error(`Session ${sessionId} is already completed.`);
  }
  if (session.status === SESSION_STATUSES.CANCELLED) {
    throw new Error(`Session ${sessionId} is cancelled and cannot be committed.`);
  }

  const startTime = Date.now();

  const commitLines = lines.filter((l) => l.productId && l.quantity > 0 && !l.reviewReasons?.length);
  const reviewLines = lines.filter((l) => !l.productId || l.quantity <= 0 || l.reviewReasons?.length);

  const counters = {
    linesRead:     lines.length,
    linesImported: 0,
    linesReviewed: reviewLines.length,
    linesFailed:   0,
  };

  // Pre-allocate IDs outside the transaction
  const lotIds      = await _genIds('InventoryLot',    commitLines.length);
  const movIds      = await _genIds('StockMovement',   commitLines.length);
  const purIds      = await _genIds('PurchaseHistory', commitLines.length);
  const revIds      = await _genIds('ReviewQueue',     reviewLines.length * 3);

  try {
    await db.transaction('rw', [
      db.InventoryLots, db.StockMovements, db.PurchaseHistory,
      db.Products, db.ReviewQueue, db.ReceivingSessions, db.AuditLog,
    ], async () => {

      // ---- Stage 1: Inventory Lots ----
      const lotMap = new Map(); // productId → { lots for WAC calc }
      for (let i = 0; i < commitLines.length; i++) {
        const line  = commitLines[i];
        const lotId = lotIds[i];
        await db.InventoryLots.add({
          id:                lotId,
          productId:         line.productId,
          supplierId:        line.supplierId      || session.supplierId || null,
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
        lotMap.get(line.productId).push({ qty: line.quantity, cost: line.unitCost, lotId });
        counters.linesImported++;
      }

      // ---- Stage 2: Stock Movements ----
      for (let i = 0; i < commitLines.length; i++) {
        await db.StockMovements.add({
          id:           movIds[i],
          productId:    commitLines[i].productId,
          lotId:        lotIds[i],
          movementType: 'Receipt',
          quantity:     commitLines[i].quantity,
          balanceAfter: null,  // DT-004: stock level engine deferred
          reason:       `Receiving session ${sessionId}`,
          timestamp:    startTime,
        });
      }

      // ---- Stage 3: Purchase History ----
      for (let i = 0; i < commitLines.length; i++) {
        const line = commitLines[i];
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
        lineCount:     lines.length,
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
        detail:      { counters, invoiceNumber: session.invoiceNumber },
        performedBy: operator,
        performedAt: startTime,
      });
    });

  } catch (err) {
    counters.linesFailed = commitLines.length - counters.linesImported;
    console.error('[ReceivingCommit] Transaction failed — rolled back:', err);
    throw new Error(`Receiving commit failed and was rolled back. Database is unchanged.\n\nReason: ${err.message}`);
  }

  return {
    sessionId,
    duration:      Date.now() - startTime,
    overallResult: 'Completed',
    ...counters,
  };
}

// ================================================================
// WEIGHTED AVERAGE COST + STOCK UPDATE
// ================================================================

/**
 * Recompute WAC and update currentStock/lastCost/lastReceivedDate on the Product.
 * WAC = Σ(qty × cost) / Σ(qty) across all active lots with a cost.
 * Must be called inside an existing Dexie transaction.
 */
async function _updateProductInventoryFields(productId, newLots, timestamp) {
  // Fetch all active lots for this product (existing + new just added above)
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
      lastCost   = lot.unitCost; // last lot (ordered by creation) wins
    }
  }

  const wac = hasCost && totalQty > 0 ? totalCost / totalQty : null;

  // Use the most recently created lot's cost as lastCost
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

// ================================================================
// HELPERS
// ================================================================

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
