/**
 * DGLOPA PLATFORM — ID GENERATOR
 * Produces immutable, human-readable IDs.
 * Format: PREFIX-NNNNNN (zero-padded to 6 digits)
 * IDs are generated from a persisted sequence stored in Settings.
 *
 * Counters are stored as: { key: 'seq_PRD', value: 42 }
 * Thread-safety: IndexedDB transactions are serialised per-origin.
 */

import { db } from '../db/database.js';

const PREFIXES = {
  Product:         'PRD',
  Supplier:        'SUP',
  InventoryLot:    'LOT',
  SupplierInvoice: 'INV',
  Sale:            'SAL',
  Demand:          'DEM',
  Payment:         'PAY',
  StockMovement:   'MOV',
  PurchaseHistory: 'PUR',
  ReviewQueue:     'REV',
};

/**
 * Generate the next ID for a given entity type.
 * Atomically increments the sequence counter.
 * @param {'Product'|'Supplier'|'InventoryLot'|...} entity
 * @returns {Promise<string>} e.g. 'PRD-000042'
 */
export async function nextId(entity) {
  const prefix = PREFIXES[entity];
  if (!prefix) throw new Error(`[IDGen] Unknown entity: ${entity}`);

  const seqKey = `seq_${prefix}`;

  return await db.transaction('rw', db.Settings, async () => {
    const row = await db.Settings.get(seqKey);
    const next = (row?.value ?? 0) + 1;
    await db.Settings.put({ key: seqKey, value: next, updatedAt: Date.now() });
    return `${prefix}-${String(next).padStart(6, '0')}`;
  });
}

export { PREFIXES };
