/**
 * DGLOPA PLATFORM — SUPPLIER WORKSPACE SERVICE
 * DT-005A: Aggregates commercial relationship data across all suppliers
 * in a single parallel data load, then computes all workspace values
 * in memory. No per-supplier sequential queries.
 *
 * DESIGN PRINCIPLE: This service is a read aggregator, not a data store.
 * Everything is derived at call time from existing tables. Zero writes.
 * Zero duplication of business logic from supplierService.js.
 */

import { db } from '../db/database.js';

// ================================================================
// WORKSPACE SUMMARY (main entry point)
// ================================================================

/**
 * Load all data required for the workspace in one parallel fetch,
 * then compute the full workspace payload in memory.
 *
 * @returns {Promise<WorkspacePayload>}
 */
export async function getWorkspaceSummary() {
  const now = Date.now();
  const monthStart = _startOfMonth(now);

  // ---- Single parallel data load ----
  const [suppliers, purchases, sessions, lots, reviewPending] = await Promise.all([
    db.Suppliers.toArray(),
    db.PurchaseHistory.toArray(),
    db.ReceivingSessions.toArray(),
    db.InventoryLots.toArray(),
    db.ReviewQueue.where('status').equals('Pending').toArray(),
  ]);

  // Active (non-merged) suppliers
  const active    = suppliers.filter((s) => s.status === 'Active');
  const preferred = active.filter((s) => s.preferredSupplier === true);
  const archived  = suppliers.filter((s) => s.status === 'Archived');

  // ---- Index purchases by supplier ----
  const purchasesBySupplier = _groupBy(purchases, 'supplierId');
  const sessionsBySupplier  = _groupBy(sessions,  'supplierId');
  const lotsBySupplier      = _groupBy(lots,       'supplierId');

  // ---- Commercial totals ----
  let totalPurchaseValue = 0;
  let totalInventoryValue = 0;
  const supplierRows = [];

  for (const supplier of active) {
    const sp = purchasesBySupplier.get(supplier.id) || [];
    const ss = sessionsBySupplier.get(supplier.id)  || [];
    const sl = lotsBySupplier.get(supplier.id)       || [];

    const purchaseValue = sp.reduce((sum, p) => sum + (p.quantity || 0) * (p.unitCost || 0), 0);
    const inventoryValue = sl
      .filter((l) => l.quantityAvailable > 0 && l.status !== 'Expired')
      .reduce((sum, l) => sum + (l.quantityAvailable || 0) * (l.unitCost || 0), 0);

    const purchaseDates  = sp.map((p) => p.purchaseDate).filter(Boolean);
    const lastPurchase   = purchaseDates.length ? Math.max(...purchaseDates) : null;
    const sessionDates   = ss.filter((s) => s.status === 'Completed').map((s) => s.receivedDate).filter(Boolean);
    const lastDelivery   = sessionDates.length ? Math.max(...sessionDates) : null;
    const completedCount = ss.filter((s) => s.status === 'Completed').length;
    const productCount   = new Set(sp.map((p) => p.productId).filter(Boolean)).size;

    totalPurchaseValue  += purchaseValue;
    totalInventoryValue += inventoryValue;

    supplierRows.push({
      id:             supplier.id,
      supplierName:   supplier.supplierName,
      status:         supplier.status,
      preferredSupplier: supplier.preferredSupplier ?? false,
      paymentMethod:  supplier.paymentMethod,
      creditLimit:    supplier.creditLimit ?? null,
      purchaseValue,
      inventoryValue,
      lastPurchase,
      lastDelivery,
      sessionCount:   completedCount,
      productCount,
      pendingReview:  reviewPending.filter((r) => r.notes?.includes(supplier.id)).length,
      pendingSessions:ss.filter((s) => s.status === 'Draft' || s.status === 'In Review').length,
    });
  }

  // Deliveries this month
  const deliveriesThisMonth = sessions.filter(
    (s) => s.status === 'Completed' && (s.receivedDate || 0) >= monthStart
  ).length;

  // Average invoice value (all completed sessions with known values)
  const avgInvoiceValue = totalPurchaseValue > 0 && sessions.filter((s) => s.status === 'Completed').length > 0
    ? totalPurchaseValue / sessions.filter((s) => s.status === 'Completed').length
    : null;

  // Products covered (unique product IDs across all active supplier purchases)
  const allProductIds = new Set(purchases.map((p) => p.productId).filter(Boolean));

  // ---- Sort options ----
  const byPurchaseValue  = [...supplierRows].sort((a, b) => b.purchaseValue  - a.purchaseValue);
  const byInventoryValue = [...supplierRows].sort((a, b) => b.inventoryValue - a.inventoryValue);
  const byProductCount   = [...supplierRows].sort((a, b) => b.productCount   - a.productCount);
  const byRecentActivity = [...supplierRows].sort((a, b) => (b.lastDelivery || 0) - (a.lastDelivery || 0));

  // ---- Attention items ----
  const attention = _buildAttentionItems(active, supplierRows, sessions, reviewPending, now);

  // ---- Insights ----
  const insights = _buildInsights(supplierRows, active, now);

  return {
    // Summary
    activeCount:        active.length,
    preferredCount:     preferred.length,
    archivedCount:      archived.length,
    totalPurchaseValue,
    totalInventoryValue,
    avgInvoiceValue,
    deliveriesThisMonth,
    productsCovered:    allProductIds.size,
    // Top supplier panels (top 10 each)
    byPurchaseValue:    byPurchaseValue.slice(0, 10),
    byInventoryValue:   byInventoryValue.slice(0, 10),
    byProductCount:     byProductCount.slice(0, 10),
    byRecentActivity:   byRecentActivity.filter((s) => s.lastDelivery).slice(0, 10),
    // Attention
    attention,
    // Insights
    insights,
    computedAt: now,
  };
}

// ================================================================
// ATTENTION ITEMS
// ================================================================

function _buildAttentionItems(active, rows, sessions, reviewPending, now) {
  const items = [];

  // Pending receiving sessions
  const pendingSessions = sessions.filter((s) => s.status === 'Draft' || s.status === 'In Review');
  if (pendingSessions.length > 0) {
    items.push({
      type:     'pending_sessions',
      severity: 'warning',
      title:    `${pendingSessions.length} Receiving Session${pendingSessions.length !== 1 ? 's' : ''} Pending`,
      body:     'Sessions in Draft or In Review status — not yet committed.',
      count:    pendingSessions.length,
      action:   'View Receiving',
      screen:   'receive',
    });
  }

  // Review queue items
  if (reviewPending.length > 0) {
    items.push({
      type:     'review_queue',
      severity: 'warning',
      title:    `${reviewPending.length} Item${reviewPending.length !== 1 ? 's' : ''} in Review Queue`,
      body:     'Receiving lines, products, or suppliers awaiting manual resolution.',
      count:    reviewPending.length,
      action:   'View Review Queue',
      screen:   null,
    });
  }

  // Credit limit approaching (>80% utilised) — placeholder until payment tracking
  const creditSuppliers = active.filter((s) => s.creditLimit != null && s.creditLimit > 0);
  if (creditSuppliers.length > 0) {
    items.push({
      type:     'credit_exposure',
      severity: 'info',
      title:    `${creditSuppliers.length} Supplier${creditSuppliers.length !== 1 ? 's' : ''} with Credit Terms`,
      body:     'Payment tracking not yet active. Credit utilisation will show here once implemented.',
      count:    creditSuppliers.length,
      action:   null,
      screen:   null,
    });
  }

  // Inactive suppliers (no delivery in 90+ days)
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  const inactive   = rows.filter((r) => r.sessionCount > 0 && r.lastDelivery != null && (now - r.lastDelivery) > ninetyDays);
  if (inactive.length > 0) {
    items.push({
      type:     'inactive_suppliers',
      severity: 'info',
      title:    `${inactive.length} Supplier${inactive.length !== 1 ? 's' : ''} Inactive 90+ Days`,
      body:     inactive.slice(0, 3).map((s) => s.supplierName).join(', ') + (inactive.length > 3 ? '…' : ''),
      count:    inactive.length,
      action:   'View Suppliers',
      screen:   'suppliers',
    });
  }

  // New suppliers (added in last 30 days, no completed session yet)
  const thirtyDays  = 30 * 24 * 60 * 60 * 1000;
  const newSuppliers = rows.filter((r) => {
    const s = active.find((a) => a.id === r.id);
    return s && (now - s.createdAt) < thirtyDays && r.sessionCount === 0;
  });
  if (newSuppliers.length > 0) {
    items.push({
      type:     'new_suppliers',
      severity: 'info',
      title:    `${newSuppliers.length} New Supplier${newSuppliers.length !== 1 ? 's' : ''} — No Deliveries Yet`,
      body:     newSuppliers.map((s) => s.supplierName).join(', '),
      count:    newSuppliers.length,
      action:   null,
      screen:   null,
    });
  }

  return items;
}

// ================================================================
// WORKSPACE INSIGHTS
// ================================================================

function _buildInsights(rows, active, now) {
  const withPurchases  = rows.filter((r) => r.purchaseValue > 0);
  const withDeliveries = rows.filter((r) => r.lastDelivery != null);
  const withProducts   = rows.filter((r) => r.productCount > 0);

  const largest        = withPurchases.sort((a, b) => b.purchaseValue  - a.purchaseValue)[0]  || null;
  const mostActive     = rows.sort((a, b) => b.sessionCount - a.sessionCount)[0]              || null;
  const mostProducts   = withProducts.sort((a, b) => b.productCount - a.productCount)[0]     || null;
  const mostCredit     = [...rows].filter((r) => r.creditLimit != null).sort((a, b) => b.creditLimit - a.creditLimit)[0] || null;
  const newest         = [...active].sort((a, b) => b.createdAt - a.createdAt)[0]            || null;
  const longestInactive= withDeliveries.sort((a, b) => a.lastDelivery - b.lastDelivery)[0]   || null;

  return {
    largest,
    mostActive,
    mostProducts,
    mostCredit,
    newest,
    longestInactive,
  };
}

// ================================================================
// RECENT ACTIVITY (last 10 completed sessions across all suppliers)
// ================================================================

export async function getRecentActivity(limit = 10) {
  const sessions = await db.ReceivingSessions
    .where('status').equals('Completed')
    .toArray();

  sessions.sort((a, b) => (b.receivedDate || 0) - (a.receivedDate || 0));
  const recent = sessions.slice(0, limit);

  // Enrich with supplier names
  const supplierIds = new Set(recent.map((s) => s.supplierId).filter(Boolean));
  const suppliers   = await Promise.all([...supplierIds].map((id) => db.Suppliers.get(id)));
  const supplierMap = new Map(suppliers.filter(Boolean).map((s) => [s.id, s]));

  return recent.map((s) => ({
    ...s,
    supplierName: supplierMap.get(s.supplierId)?.supplierName || s.supplierName || '—',
  }));
}

// ================================================================
// HELPERS
// ================================================================

function _groupBy(arr, key) {
  const map = new Map();
  for (const item of arr) {
    const k = item[key];
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

function _startOfMonth(now) {
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
