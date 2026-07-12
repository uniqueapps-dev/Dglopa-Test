/**
 * DGLOPA PLATFORM — LIVE INVENTORY SERVICE
 * DT-006: All inventory calculations derived from existing tables.
 * DT-004B: Commercial Profile (selling price, replacement cost) read
 *          from CommercialProfileService (DM-001).
 * DT-004C: _buildInventoryRow() migrated to CommercialProfile reads.
 *          getDashboardSummary() migrated to bulk CommercialProfile reads.
 *          All commercial reads now pass through CommercialProfileService.
 *
 * LEGACY FIELD AUDIT (DT-004C):
 *   Products.weightedAvgCost  — INTENTIONAL: WAC drives inventory valuation
 *                               (cost-basis). CommercialProfile owns the
 *                               customer-facing price; WAC remains on Products.
 *   Products.lastCost         — LEGACY FALLBACK in _buildInventoryRow only.
 *                               Kept for the row's lastCost field, which is
 *                               surfaced in the detail modal [LEGACY-COMPAT].
 *   InventoryLots.sellingPrice — REMOVED from all primary read paths.
 *                               Fallback only: if no CommercialProfile exists.
 */

import { db }                         from '../db/database.js';
import {
  getProfile,
  getProfiles,
  PRICING_STATUS,
} from './commercialProfileService.js';

// ================================================================
// CONSTANTS
// ================================================================

const NEAR_EXPIRY_DAYS     = 90;  // 3 months
const LOW_STOCK_THRESHOLD  = 10;  // units — future: per-product reorder point

export const INVENTORY_STATUS = Object.freeze({
  HEALTHY:          'Healthy',
  LOW_STOCK:        'Low Stock',
  OUT_OF_STOCK:     'Out of Stock',
  NEAR_EXPIRY:      'Near Expiry',
  EXPIRED:          'Expired',
  REVIEW_REQUIRED:  'Review Required',
});

export const FILTER_TYPES = Object.freeze({
  ALL:            'All',
  LOW_STOCK:      'Low Stock',
  OUT_OF_STOCK:   'Out of Stock',
  NEAR_EXPIRY:    'Near Expiry',
  EXPIRED:        'Expired',
  FAST_MOVING:    'Fast Moving',   // placeholder
  SLOW_MOVING:    'Slow Moving',   // placeholder
  REVIEW:         'Review Required',
});

// ================================================================
// DASHBOARD AGGREGATES
// ================================================================

/**
 * Compute the Live Inventory Dashboard summary.
 * One pass over Products, one over InventoryLots.
 * @returns {Promise<DashboardSummary>}
 */
export async function getDashboardSummary() {
  const [products, lots] = await Promise.all([
    db.Products.where('lifecycleStatus').anyOf(['Active', 'Trial', 'Slow Moving', 'Sleeping']).toArray(),
    db.InventoryLots.toArray(),
  ]);

  const now              = Date.now();
  const nearExpiryMs     = NEAR_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  let totalInventoryValue = 0;
  let totalRetailValue    = 0;
  let lowStockCount       = 0;
  let outOfStockCount     = 0;
  let nearExpiryCount     = 0;   // distinct products with ≥1 near-expiry lot
  let expiredCount        = 0;   // distinct lots expired
  let reviewCount         = 0;   // lots in Review status

  // Build a lot map for fast product-level queries
  const lotsByProduct = new Map();
  for (const lot of lots) {
    if (!lot.productId) continue;
    if (!lotsByProduct.has(lot.productId)) lotsByProduct.set(lot.productId, []);
    lotsByProduct.get(lot.productId).push(lot);
  }

  const nearExpiryProducts = new Set();

  for (const product of products) {
    const productLots = lotsByProduct.get(product.id) || [];
    const activeLots  = productLots.filter((l) => l.quantityAvailable > 0 && l.status !== 'Expired');
    const stock       = activeLots.reduce((s, l) => s + (l.quantityAvailable || 0), 0);

    // Inventory Value (WAC × stock)
    const wac = product.weightedAvgCost ?? 0;
    totalInventoryValue += stock * wac;

    // Retail Value — read from CommercialProfile (DT-004C)
    // Falls back to lot-level sellingPrice if no profile exists [FALLBACK].
    const cp               = profileMap.get(product.id);
    const latestPricedLot  = [...activeLots]
      .filter((l) => l.sellingPrice != null)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    const sellingPrice = cp?.activeSellingPrice ?? latestPricedLot?.sellingPrice ?? 0;
    totalRetailValue  += stock * sellingPrice;

    // Stock status
    if (stock <= 0)                             outOfStockCount++;
    else if (stock <= LOW_STOCK_THRESHOLD)      lowStockCount++;

    // Near expiry (any active lot expiring within NEAR_EXPIRY_DAYS)
    const hasNearExpiry = activeLots.some(
      (l) => l.expiryDate != null && l.expiryDate > now && l.expiryDate < now + nearExpiryMs
    );
    if (hasNearExpiry) nearExpiryProducts.add(product.id);

    // Review lots
    reviewCount += productLots.filter((l) => l.status === 'Review').length;
  }

  // Expired lots (across all products)
  expiredCount = lots.filter((l) => l.status === 'Expired' || (l.expiryDate != null && l.expiryDate < now)).length;

  // Pending review queue items
  const pendingReview = await db.ReviewQueue.where('status').equals('Pending').count();

  return {
    totalProducts:          products.length,
    totalInventoryValue,
    totalRetailValue,
    estimatedGrossMargin:   totalRetailValue - totalInventoryValue,
    lowStockCount,
    outOfStockCount,
    nearExpiryCount:        nearExpiryProducts.size,
    expiredLotCount:        expiredCount,
    reviewLotCount:         reviewCount,
    pendingReviewQueueItems:pendingReview,
    computedAt:             Date.now(),
  };
}

// ================================================================
// INVENTORY LIST (with filtering and search)
// ================================================================

/**
 * Get the inventory list — one row per product with computed fields.
 *
 * @param {{ query, filter, supplierId, category }} options
 * @returns {Promise<InventoryRow[]>}
 */
export async function getInventoryList({
  query      = '',
  filter     = FILTER_TYPES.ALL,
  supplierId = null,
  category   = null,
} = {}) {
  const now         = Date.now();
  const nearExpiryMs = NEAR_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const q           = query.trim().toLowerCase();

  // Load active products
  let products = await db.Products
    .where('lifecycleStatus').anyOf(['Active', 'Trial', 'Slow Moving', 'Sleeping'])
    .toArray();

  // Text search
  if (q) {
    products = products.filter((p) =>
      p.productName?.toLowerCase().includes(q) ||
      p.genericName?.toLowerCase().includes(q) ||
      p.brand?.toLowerCase().includes(q)       ||
      p.category?.toLowerCase().includes(q)
    );
  }

  // Category filter
  if (category) {
    products = products.filter((p) => p.category === category);
  }

  // Load all lots and CommercialProfiles in parallel (DT-004C)
  const [allLots, listProfileMap] = await Promise.all([
    db.InventoryLots.toArray(),
    getProfiles(products.map((p) => p.id)),
  ]);

  const lotsByProduct = new Map();
  for (const lot of allLots) {
    if (!lotsByProduct.has(lot.productId)) lotsByProduct.set(lot.productId, []);
    lotsByProduct.get(lot.productId).push(lot);
  }

  // Build inventory rows — each row receives its CommercialProfile
  let rows = products.map((product) => {
    const productLots = lotsByProduct.get(product.id) || [];
    return _buildInventoryRow(product, productLots, now, nearExpiryMs, listProfileMap.get(product.id) ?? null);
  });

  // Supplier filter (via lots)
  if (supplierId) {
    const supplierProductIds = new Set(
      allLots.filter((l) => l.supplierId === supplierId).map((l) => l.productId)
    );
    rows = rows.filter((r) => supplierProductIds.has(r.productId));
  }

  // Status filter
  rows = _applyFilter(rows, filter);

  // Sort: out-of-stock first, then low stock, then by name
  rows.sort((a, b) => {
    const priority = { 'Out of Stock': 0, 'Expired': 1, 'Near Expiry': 2, 'Low Stock': 3, 'Review Required': 4, 'Healthy': 5 };
    const pa = priority[a.status] ?? 9;
    const pb = priority[b.status] ?? 9;
    if (pa !== pb) return pa - pb;
    return a.productName.localeCompare(b.productName);
  });

  return rows.slice(0, 300);
}

// ================================================================
// PRODUCT INVENTORY DETAIL
// ================================================================

/**
 * Full inventory detail for one product.
 * @param {string} productId
 * @returns {Promise<ProductDetail>}
 */
export async function getProductInventoryDetail(productId) {
  const now          = Date.now();
  const nearExpiryMs = NEAR_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  const [product, allLots, purchases, movements, sessions] = await Promise.all([
    db.Products.get(productId),
    db.InventoryLots.where('productId').equals(productId).toArray(),
    db.PurchaseHistory.where('productId').equals(productId).toArray(),
    db.StockMovements.where('productId').equals(productId).toArray(),
    db.ReceivingSessions.toArray(), // filtered below
  ]);

  if (!product) return null;

  // Sort lots FEFO
  const sortedLots = [...allLots].sort((a, b) => {
    if (a.expiryDate == null && b.expiryDate == null) return 0;
    if (a.expiryDate == null) return 1;
    if (b.expiryDate == null) return -1;
    return a.expiryDate - b.expiryDate;
  });

  const activeLots  = sortedLots.filter((l) => l.quantityAvailable > 0 && l.status !== 'Expired');
  const stock       = activeLots.reduce((s, l) => s + (l.quantityAvailable || 0), 0);

  // DT-004B: Read commercial data from CommercialProfile (DM-001)
  // Falls back to legacy Products.lastCost / InventoryLots.sellingPrice if no profile yet.
  const commercialProfile = await getProfile(product.id);
  const wac          = product.weightedAvgCost ?? 0;
  const sellingPrice = commercialProfile?.activeSellingPrice
    ?? (activeLots.filter((l) => l.sellingPrice != null).sort((a, b) => b.createdAt - a.createdAt)[0]?.sellingPrice ?? null);
  const replacementCostSnapshot = commercialProfile?.replacementCostSnapshot ?? null;
  const pricingStatus = commercialProfile?.pricingStatus ?? null;

  // Supplier info
  const supplierIds = new Set(allLots.map((l) => l.supplierId).filter(Boolean));
  const suppliers   = await Promise.all([...supplierIds].map((id) => db.Suppliers.get(id)));
  const supplierMap = new Map(suppliers.filter(Boolean).map((s) => [s.id, s]));

  // Receiving sessions linked to this product's lots
  const sessionIds    = new Set(allLots.map((l) => l.invoiceId).filter(Boolean));
  const linkedSessions = sessions.filter((s) => sessionIds.has(s.id));

  // Movement summary
  const receiptMoves  = movements.filter((m) => m.movementType === 'Receipt');
  const lastMovement  = movements.length
    ? movements.sort((a, b) => b.timestamp - a.timestamp)[0]
    : null;

  // Annotate lots with expiry status
  const annotatedLots = sortedLots.map((lot) => ({
    ...lot,
    expiryStatus:  _expiryStatus(lot.expiryDate, now, nearExpiryMs),
    supplierName:  supplierMap.get(lot.supplierId)?.supplierName || null,
  }));

  return {
    product,
    stock,
    inventoryValue:  stock * wac,
    retailValue:     sellingPrice != null ? stock * sellingPrice : null,
    estimatedMargin: sellingPrice != null ? (stock * sellingPrice) - (stock * wac) : null,
    sellingPrice,
    wac,
    // DT-004B: Commercial Profile fields
    replacementCostSnapshot,
    pricingStatus,
    commercialProfile: commercialProfile || null,
    status:          _productStatus(stock, allLots, now, nearExpiryMs),
    lots:            annotatedLots,
    activeLotCount:  activeLots.length,
    expiredLotCount: allLots.filter((l) => l.status === 'Expired' || (l.expiryDate != null && l.expiryDate < now)).length,
    suppliers:       [...supplierMap.values()],
    preferredSupplier: product.preferredSupplierId
      ? supplierMap.get(product.preferredSupplierId) || null
      : null,
    purchases:       purchases.sort((a, b) => b.purchaseDate - a.purchaseDate).slice(0, 20),
    movements:       movements.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20),
    receivingSessions: linkedSessions.sort((a, b) => (b.receivedDate || 0) - (a.receivedDate || 0)),
    lastMovement,
    receiptCount:    receiptMoves.length,
    // Health framework placeholders
    inventoryHealth: null,
    stockQuality:    null,
    expiryRisk:      null,
    stockAvailability: stock > 0 ? Math.min(stock / LOW_STOCK_THRESHOLD, 1) : 0,
    capitalUtilization: null,
  };
}

// ================================================================
// INTERNAL BUILDERS
// ================================================================

function _buildInventoryRow(product, lots, now, nearExpiryMs, commercialProfile = null) {
  const activeLots  = lots.filter((l) => l.quantityAvailable > 0 && l.status !== 'Expired');
  const stock       = activeLots.reduce((s, l) => s + (l.quantityAvailable || 0), 0);
  const wac = product.weightedAvgCost ?? 0; // INTENTIONAL: WAC is cost-basis for inventory valuation

  // DT-004C: read from CommercialProfile (DM-001)
  // Fallback to lot-level sellingPrice only when no profile exists [FALLBACK].
  const latestPricedLot = activeLots
    .filter((l) => l.sellingPrice != null)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const sellingPrice = commercialProfile?.activeSellingPrice
    ?? latestPricedLot?.sellingPrice
    ?? null;
  const replacementCost = commercialProfile?.replacementCostSnapshot?.amount
    ?? product.lastCost  // [LEGACY-COMPAT] removed in v9 migration
    ?? null;
  const pricingStatus   = commercialProfile?.pricingStatus ?? null;

  return {
    productId:       product.id,
    productName:     product.productName,
    genericName:     product.genericName || '',
    brand:           product.brand       || '',
    category:        product.category    || '',
    dosageForm:      product.dosageForm  || '',
    baseUnit:        product.baseUnit    || '',
    lifecycleStatus: product.lifecycleStatus,
    currentStock:    stock,
    availableStock:  stock,
    reservedStock:   0,     // placeholder — sales not yet implemented
    wac,
    lastCost:           product.lastCost ?? null,  // [LEGACY-COMPAT] see header
    sellingPrice,
    replacementCost,
    pricingStatus,
    inventoryValue:  stock * wac,
    retailValue:     sellingPrice != null ? stock * sellingPrice : null,
    estimatedMargin: sellingPrice != null ? (stock * sellingPrice) - (stock * wac) : null,
    activeLotCount:  activeLots.length,
    status:          _productStatus(stock, lots, now, nearExpiryMs),
    preferredSupplierId: product.preferredSupplierId || null,
    lastReceivedDate: product.lastReceivedDate || null,
  };
}

function _productStatus(stock, lots, now, nearExpiryMs) {
  if (lots.some((l) => l.status === 'Review')) return INVENTORY_STATUS.REVIEW_REQUIRED;
  if (stock <= 0)                              return INVENTORY_STATUS.OUT_OF_STOCK;
  const activeLots = lots.filter((l) => l.quantityAvailable > 0);
  if (activeLots.some((l) => l.expiryDate != null && l.expiryDate < now)) {
    return INVENTORY_STATUS.EXPIRED;
  }
  if (activeLots.some((l) => l.expiryDate != null && l.expiryDate < now + nearExpiryMs)) {
    return INVENTORY_STATUS.NEAR_EXPIRY;
  }
  if (stock > 0 && stock <= LOW_STOCK_THRESHOLD) return INVENTORY_STATUS.LOW_STOCK;
  return INVENTORY_STATUS.HEALTHY;
}

function _expiryStatus(expiryDate, now, nearExpiryMs) {
  if (expiryDate == null)              return 'No Expiry';
  if (expiryDate < now)               return 'Expired';
  if (expiryDate < now + nearExpiryMs) return 'Near Expiry';
  return 'Healthy';
}

function _applyFilter(rows, filter) {
  switch (filter) {
    case FILTER_TYPES.LOW_STOCK:    return rows.filter((r) => r.status === INVENTORY_STATUS.LOW_STOCK);
    case FILTER_TYPES.OUT_OF_STOCK: return rows.filter((r) => r.status === INVENTORY_STATUS.OUT_OF_STOCK);
    case FILTER_TYPES.NEAR_EXPIRY:  return rows.filter((r) => r.status === INVENTORY_STATUS.NEAR_EXPIRY);
    case FILTER_TYPES.EXPIRED:      return rows.filter((r) => r.status === INVENTORY_STATUS.EXPIRED);
    case FILTER_TYPES.REVIEW:       return rows.filter((r) => r.status === INVENTORY_STATUS.REVIEW_REQUIRED);
    case FILTER_TYPES.FAST_MOVING:  return rows; // placeholder — sales data not yet available
    case FILTER_TYPES.SLOW_MOVING:  return rows; // placeholder
    default:                        return rows;
  }
}

// ================================================================
// BATCH NUMBER SEARCH (for Lot Detail lookup)
// ================================================================

export async function searchByBatchNumber(batchQuery) {
  const q = batchQuery.trim().toLowerCase();
  if (!q) return [];
  const lots = await db.InventoryLots.toArray();
  return lots.filter((l) => l.batchNumber?.toLowerCase().includes(q)).slice(0, 50);
}

// ================================================================
// CATEGORIES (for filter dropdown)
// ================================================================

export async function getActiveCategories() {
  const products = await db.Products
    .where('lifecycleStatus').anyOf(['Active', 'Trial', 'Slow Moving', 'Sleeping'])
    .toArray();
  const cats = new Set(products.map((p) => p.category).filter(Boolean));
  return [...cats].sort();
}
