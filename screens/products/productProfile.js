/**
 * DGLOPA PLATFORM — PRODUCT PROFILE VIEW
 * DT-002B: Badge map covers full 7-value lifecycle; merge info section
 *          shown when product.lifecycleStatus === 'Merged'.
 */

import { formatDate, formatNaira } from '../../utils/helpers.js';

export function buildProductProfile(product, supplier = null, commercialProfile = null) {
  const s = (v) => v?.trim() || '—';

  const statusBadge = {
    'Trial':        'badge-accent',
    'Active':       'badge-green',
    'Slow Moving':  'badge-amber',
    'Sleeping':     'badge-amber',
    'Discontinued': 'badge-red',
    'Archived':     'badge-red',
    'Merged':       'badge-red',
  }[product.lifecycleStatus] || 'badge-accent';

  return `
    <div class="profile-header">
      <div>
        <div class="profile-name">${_e(product.productName)}</div>
        <div class="profile-id text-mono text-muted text-xs">${_e(product.id)}</div>
      </div>
      <span class="badge ${statusBadge}">${_e(product.lifecycleStatus)}</span>
    </div>

    ${product.lifecycleStatus === 'Merged' ? `
    <div class="profile-section">
      <div class="profile-section-title">Merge Record</div>
      <div class="profile-grid">
        ${_row('Merged Into', `<span class="text-mono">${_e(product.mergedIntoId)}</span>`)}
        ${_row('Merged Date', formatDate(product.mergedDate))}
        ${_row('Reason', s(product.mergedReason))}
      </div>
    </div>` : ''}

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

    <!-- Commercial Profile (DT-004B / DM-001) -->
    ${commercialProfile ? _buildCommercialSection(commercialProfile) : `
    <div class="profile-section-title" style="margin-top:var(--sp-6)">Commercial Profile</div>
    <div class="text-muted text-sm">Loading commercial profile…</div>`}

    <!-- Still coming later -->
    <div class="future-sections" style="margin-top:var(--sp-5)">
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

function _buildCommercialSection(cp) {
  const snap     = cp.replacementCostSnapshot;
  const statusCls = {
    'Current':         'badge-green',
    'ReviewRequired':  'badge-amber',
    'AtRisk':          'badge-red',
    'ManualOverride':  'badge-accent',
  }[cp.pricingStatus] || 'badge-accent';

  const confidenceCls = {
    'Verified': 'text-green',
    'High':     'text-green',
    'Medium':   'text-amber',
    'Low':      'text-muted',
  }[snap?.confidence] || 'text-muted';

  return `
    <div class="profile-section" style="margin-top:var(--sp-5)">
      <div class="d-flex justify-between align-center" style="margin-bottom:var(--sp-3)">
        <div class="profile-section-title" style="margin-bottom:0">Commercial Profile</div>
        <span class="badge ${statusCls}">${_e(cp.pricingStatus || 'Current')}</span>
      </div>
      <div class="profile-grid">
        ${_row('Selling Price', cp.activeSellingPrice != null ? formatNaira(cp.activeSellingPrice) : '—')}
        ${snap
          ? `${_row('Replacement Cost', formatNaira(snap.amount))}
             ${_row('Cost Source', _e(snap.source || '—'))}
             ${_row('Supplier', _e(snap.supplierName || snap.supplierId || '—'))}
             ${_row('Cost Updated', formatDate(snap.timestamp))}
             ${_row('Confidence', '<span class="' + confidenceCls + '">' + _e(snap.confidence) + '</span>')}`
          : _row('Replacement Cost', '—')
        }
        ${_row('Profile Version', String(cp.pricingProfileVersion || 1))}
        ${_row('Last Updated', formatDate(cp.updatedAt))}
      </div>
    </div>`;
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
