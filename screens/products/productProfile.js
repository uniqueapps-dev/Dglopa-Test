/**
 * DGLOPA PLATFORM — PRODUCT PROFILE VIEW
 * Read-only product profile with placeholder future sections.
 */

import { formatDate } from '../../utils/helpers.js';

export function buildProductProfile(product, supplier = null) {
  const s = (v) => v?.trim() || '—';

  const statusBadge = {
    Active:       'badge-green',
    Discontinued: 'badge-amber',
    Archived:     'badge-red',
  }[product.lifecycleStatus] || 'badge-accent';

  return `
    <div class="profile-header">
      <div>
        <div class="profile-name">${_e(product.productName)}</div>
        <div class="profile-id text-mono text-muted text-xs">${_e(product.id)}</div>
      </div>
      <span class="badge ${statusBadge}">${_e(product.lifecycleStatus)}</span>
    </div>

    <!-- Identity -->
    <div class="profile-section">
      <div class="profile-section-title">Identity</div>
      <div class="profile-grid">
        ${_row('Generic Name', s(product.genericName))}
        ${_row('Brand', s(product.brand))}
        ${_row('Strength', s(product.strength))}
        ${_row('Dosage Form', s(product.dosageForm))}
        ${_row('Category', s(product.category))}
      </div>
    </div>

    <!-- Units -->
    <div class="profile-section">
      <div class="profile-section-title">Units</div>
      <div class="profile-grid">
        ${_row('Base Unit', s(product.baseUnit))}
        ${_row('Receiving Unit', s(product.receivingUnits))}
        ${_row('Selling Unit', s(product.sellingUnits))}
      </div>
    </div>

    <!-- Sourcing -->
    <div class="profile-section">
      <div class="profile-section-title">Sourcing</div>
      <div class="profile-grid">
        ${_row('Preferred Supplier', supplier ? _e(supplier.supplierName) : (product.preferredSupplierId ? product.preferredSupplierId : '—'))}
      </div>
    </div>

    ${product.notes ? `
    <div class="profile-section">
      <div class="profile-section-title">Notes</div>
      <p class="profile-notes">${_e(product.notes)}</p>
    </div>` : ''}

    <!-- Future sections — placeholder -->
    <div class="profile-section-title" style="margin-top:var(--sp-6)">Coming in Future Tickets</div>
    <div class="future-sections">
      ${_futureTab('Purchase History', 'M2')}
      ${_futureTab('Price History', 'M2')}
      ${_futureTab('Inventory Lots', 'M3')}
      ${_futureTab('Demand History', 'M5')}
      ${_futureTab('Analytics', 'M7')}
    </div>

    <!-- Meta -->
    <div class="profile-meta">
      Added ${formatDate(product.createdAt)}
      ${product.updatedAt !== product.createdAt ? ` · Updated ${formatDate(product.updatedAt)}` : ''}
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

function _futureTab(label, milestone) {
  return `
    <div class="future-tab">
      <span>${label}</span>
      <span class="badge badge-accent">${milestone}</span>
    </div>`;
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
