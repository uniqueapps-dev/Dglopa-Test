/**
 * DGLOPA PLATFORM — SUPPLIER PROFILE COMPONENT
 * DT-005: Read-only supplier profile with relationship summary,
 * performance framework placeholders, and purchasing history links.
 */

import { formatNaira, formatDate } from '../../utils/helpers.js';

export function buildSupplierProfile(supplier, summary, products) {
  const statusBadge = {
    Active:   'badge-green',
    Archived: 'badge-red',
    Merged:   'badge-red',
    Inactive: 'badge-amber',
  }[supplier.status] || 'badge-accent';

  return `
    <!-- Header -->
    <div class="profile-header">
      <div>
        <div class="profile-name">${_e(supplier.supplierName)}</div>
        ${supplier.tradingName ? `<div class="text-muted text-xs">${_e(supplier.tradingName)}</div>` : ''}
        <div class="profile-id text-mono text-xs">${_e(supplier.id)}</div>
      </div>
      <span class="badge ${statusBadge}">${_e(supplier.status)}</span>
    </div>

    ${supplier.status === 'Merged' ? `
    <div class="profile-section">
      <div class="profile-section-title">Merge Record</div>
      <div class="profile-grid">
        ${_row('Merged Into', `<span class="text-mono">${_e(supplier.mergedIntoId)}</span>`)}
        ${_row('Merged Date', formatDate(supplier.mergedDate))}
        ${_row('Reason', supplier.mergedReason || '—')}
      </div>
    </div>` : ''}

    <!-- Contact -->
    <div class="profile-section">
      <div class="profile-section-title">Contact</div>
      <div class="profile-grid">
        ${_row('Contact Person', supplier.contactPerson || '—')}
        ${_row('Phone',          supplier.phone         || '—')}
        ${_row('WhatsApp',       supplier.whatsApp      || '—')}
        ${_row('Email',          supplier.email         || '—')}
        ${_row('Address',        [supplier.address, supplier.city, supplier.state].filter(Boolean).join(', ') || '—')}
      </div>
    </div>

    <!-- Commercial -->
    <div class="profile-section">
      <div class="profile-section-title">Commercial Terms</div>
      <div class="profile-grid">
        ${_row('Payment Method',      supplier.paymentMethod           || '—')}
        ${_row('Credit Limit',        supplier.creditLimit != null ? formatNaira(supplier.creditLimit) : '—')}
        ${_row('Credit Days',         supplier.creditDays != null ? `${supplier.creditDays} days` : '—')}
        ${_row('Ordering Method',     supplier.preferredOrderingMethod || '—')}
        ${_row('Min. Order Value',    supplier.minimumOrderValue != null ? formatNaira(supplier.minimumOrderValue) : '—')}
        ${_row('Lead Time',           supplier.leadTime != null ? `${supplier.leadTime} day${supplier.leadTime !== 1 ? 's' : ''}` : '—')}
        ${_row('Preferred Supplier',  supplier.preferredSupplier ? '✓ Yes' : 'No')}
      </div>
    </div>

    <!-- Relationship Summary -->
    <div class="profile-section">
      <div class="profile-section-title">Relationship Summary</div>
      <div class="profile-grid">
        ${_row('Total Purchases',     summary.purchaseCount || 0)}
        ${_row('Receiving Sessions',  summary.sessionCount  || 0)}
        ${_row('Total Purchase Value',summary.totalPurchaseValue > 0 ? formatNaira(summary.totalPurchaseValue) : '—')}
        ${_row('Avg Invoice Value',   summary.avgInvoiceValue != null ? formatNaira(summary.avgInvoiceValue) : '—')}
        ${_row('Products Supplied',   summary.productCount  || 0)}
        ${_row('First Purchase',      formatDate(summary.firstPurchase))}
        ${_row('Last Purchase',       formatDate(summary.lastPurchase))}
        ${_row('Last Delivery',       formatDate(summary.lastDelivery))}
      </div>
    </div>

    <!-- Credit Status -->
    <div class="profile-section">
      <div class="profile-section-title">Credit Status</div>
      <div class="profile-grid">
        ${_row('Credit Limit',      supplier.creditLimit != null ? formatNaira(supplier.creditLimit) : '—')}
        ${_row('Outstanding',       '<span class="text-muted text-xs">Payment tracking — future ticket</span>')}
        ${_row('Available Credit',  '<span class="text-muted text-xs">Payment tracking — future ticket</span>')}
      </div>
    </div>

    <!-- Performance Framework -->
    <div class="profile-section">
      <div class="profile-section-title">Performance Framework</div>
      <div class="profile-grid">
        ${_perfRow('Delivery Reliability')}
        ${_perfRow('Price Stability')}
        ${_perfRow('Invoice Accuracy')}
        ${_perfRow('Availability')}
        ${_perfRow('Response Time')}
        ${_perfRow('Relationship Score')}
      </div>
      <div class="text-xs text-muted" style="margin-top:var(--sp-2)">
        Performance scoring will be calculated as transaction history grows.
      </div>
    </div>

    <!-- Products Supplied -->
    ${products.length > 0 ? `
    <div class="profile-section">
      <div class="profile-section-title">Products Supplied (${products.length})</div>
      <div class="profile-grid">
        ${products.slice(0, 20).map((p) => `
          <div class="profile-row">
            <span class="profile-row-label">${_e(p.productName)}</span>
            <span class="profile-row-value text-xs">${p.lastCost != null ? formatNaira(p.lastCost) : '—'}</span>
          </div>`).join('')}
        ${products.length > 20 ? `<div class="profile-row"><span class="profile-row-label text-muted">…and ${products.length - 20} more</span></div>` : ''}
      </div>
    </div>` : ''}

    ${supplier.notes ? `
    <div class="profile-section">
      <div class="profile-section-title">Notes</div>
      <p class="profile-notes">${_e(supplier.notes)}</p>
    </div>` : ''}

    <div class="profile-meta">
      Added ${formatDate(supplier.createdAt)}
      ${supplier.updatedAt !== supplier.createdAt ? ` · Updated ${formatDate(supplier.updatedAt)}` : ''}
    </div>
  `;
}

function _row(label, value) {
  return `
    <div class="profile-row">
      <span class="profile-row-label">${label}</span>
      <span class="profile-row-value">${value}</span>
    </div>`;
}

function _perfRow(label) {
  return `
    <div class="profile-row">
      <span class="profile-row-label">${label}</span>
      <span class="profile-row-value"><span class="badge badge-accent" style="font-size:0.6rem">Pending data</span></span>
    </div>`;
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
