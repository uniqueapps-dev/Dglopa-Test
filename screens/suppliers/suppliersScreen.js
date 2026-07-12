/**
 * DGLOPA PLATFORM — SUPPLIERS SCREEN
 * DT-005: Full Supplier Relationship Management UI.
 * Directory → Profile → Edit/Archive workflow.
 */

import { renderSupplierWorkspace }  from './supplierWorkspace.js';
import { renderSupplierTimeline }   from './supplierTimeline.js';
import {
  searchSuppliers, createSupplier, updateSupplier,
  archiveSupplier, restoreSupplier, getSupplier,
  getRelationshipSummary, getProductsForSupplier,
  getSupplierCounts, mergeSuppliers,
} from '../../services/supplierService.js';
import { buildSupplierForm, readSupplierFormValues } from './supplierForm.js';
import { buildSupplierProfile }                       from './supplierProfile.js';
import { toast }                                      from '../../components/toast.js';
import { openModal, closeModal }                      from '../../components/modal.js';
import { debounce }                                   from '../../utils/helpers.js';

// ---- Module state ----
let _query        = '';
let _statusFilter = 'Active';

// ================================================================
// ENTRY POINT
// ================================================================

// ---- View state ----
let _view = 'workspace'; // 'workspace' | 'directory'

export async function initSuppliersScreen() {
  const container = document.getElementById('screen-suppliers');
  if (!container) return;
  if (_view === 'workspace') {
    await renderSupplierWorkspace(container, () => {
      _view = 'directory';
      _render(container);
    });
  } else {
    await _render(container);
  }
}

// ================================================================
// DIRECTORY
// ================================================================

async function _render(container) {
  const counts = await getSupplierCounts();

  container.innerHTML = `
    <div class="screen-header d-flex justify-between align-center mb-4">
      <div>
        <div class="section-title" style="margin-bottom:0">Supplier Directory</div>
        <div class="text-muted text-xs" id="sup-count">${counts.active} active · ${counts.total} total</div>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-secondary btn-sm" id="sup-workspace-btn">← Workspace</button>
        <button class="btn btn-primary btn-sm" id="sup-add-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add
      </button>
      </div>
    </div>

    <div class="search-wrap">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input class="search-input" id="sup-search" type="search"
             placeholder="Name, contact, city…" autocomplete="off" value="${_e(_query)}">
    </div>

    <div class="filter-tabs" id="sup-filters">
      ${['Active','Archived','All'].map((s) =>
        `<button class="filter-tab${s === _statusFilter ? ' active' : ''}" data-filter="${s}">${s}</button>`
      ).join('')}
    </div>

    <div id="sup-list">
      <div class="empty-state"><div class="loader-spinner"></div></div>
    </div>
  `;

  container.querySelector('#sup-workspace-btn')?.addEventListener('click', () => {
    _view = 'workspace';
    renderSupplierWorkspace(container, () => {
      _view = 'directory';
      _render(container);
    });
  });
  container.querySelector('#sup-add-btn').addEventListener('click', () => _openAddModal());
  container.querySelector('#sup-search').addEventListener('input', debounce(_onSearch, 250));
  container.querySelector('#sup-filters').addEventListener('click', _onFilterClick);

  await _loadList(container);
}

async function _loadList(container) {
  const listEl = container.querySelector('#sup-list');
  if (!listEl) return;
  try {
    const suppliers = await searchSuppliers({ query: _query, statusFilter: _statusFilter });
    _renderList(listEl, suppliers);
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-state-title text-red">Failed to load suppliers</div></div>`;
  }
}

function _renderList(listEl, suppliers) {
  if (suppliers.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="2" y="7" width="20" height="14" rx="2"/>
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
        </svg>
        <div class="empty-state-title">${_query ? 'No suppliers match your search' : 'No suppliers yet'}</div>
        <div class="empty-state-body">${_query ? 'Try a different search term.' : 'Tap Add to create your first supplier.'}</div>
      </div>`;
    return;
  }

  listEl.innerHTML = suppliers.map(_supplierCard).join('');
  listEl.querySelectorAll('.sup-card').forEach((el) => {
    el.addEventListener('click', () => _openProfile(el.dataset.id));
  });
}

function _supplierCard(s) {
  const badge = { Active: 'badge-green', Archived: 'badge-red', Merged: 'badge-red' }[s.status] || 'badge-accent';
  const sub   = [s.contactPerson, s.phone, s.city].filter(Boolean).join(' · ');
  return `
    <div class="sup-card card" data-id="${_e(s.id)}" style="cursor:pointer;margin-bottom:var(--sp-2)">
      <div class="d-flex justify-between align-center">
        <div class="fw-medium">${_e(s.supplierName)}</div>
        <div class="d-flex gap-2 align-center">
          ${s.preferredSupplier ? '<span class="badge badge-accent" style="font-size:0.6rem">Preferred</span>' : ''}
          <span class="badge ${badge}">${_e(s.status)}</span>
        </div>
      </div>
      ${sub ? `<div class="text-muted text-xs" style="margin-top:2px">${_e(sub)}</div>` : ''}
      <div class="text-mono text-xs" style="color:var(--clr-text-3);margin-top:var(--sp-1)">${_e(s.id)}</div>
    </div>`;
}

// ================================================================
// SEARCH + FILTER
// ================================================================

function _onSearch(e) {
  _query = e.target.value;
  const container = document.getElementById('screen-suppliers');
  if (container) _loadList(container);
}

function _onFilterClick(e) {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  _statusFilter = btn.dataset.filter;
  document.querySelectorAll('#sup-filters .filter-tab').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  const container = document.getElementById('screen-suppliers');
  if (container) _loadList(container);
}

// ================================================================
// ADD MODAL
// ================================================================

function _openAddModal() {
  const modal = openModal({ id: 'add-supplier', title: 'Add Supplier', bodyHTML: buildSupplierForm() });
  _wireForm(modal, null);
}

// ================================================================
// PROFILE VIEW
// ================================================================

async function _openProfile(supplierId) {
  const supplier = await getSupplier(supplierId);
  if (!supplier) { toast('Supplier not found.', 'error'); return; }

  const [summary, products] = await Promise.all([
    getRelationshipSummary(supplierId),
    getProductsForSupplier(supplierId),
  ]);

  const isMerged   = supplier.status === 'Merged';
  const isArchived = supplier.status === 'Archived';

  const modal = openModal({
    id: 'view-supplier',
    bodyHTML: `
      <div id="sup-profile-body">${buildSupplierProfile(supplier, summary, products)}</div>
      ${isMerged ? `
      <div class="profile-actions">
        <div class="merged-notice text-sm text-muted">
          Merged into <span class="text-mono">${_e(supplier.mergedIntoId)}</span>
        </div>
      </div>` : `
      <div class="profile-actions">
        <button class="btn btn-secondary btn-sm" id="sup-edit-btn">Edit</button>
        <button class="btn btn-secondary btn-sm" id="sup-timeline-btn">Timeline</button>
        <button class="btn btn-danger btn-sm" id="sup-archive-btn">
          ${isArchived ? 'Restore' : 'Archive'}
        </button>
      </div>`}
    `,
  });

  if (!isMerged) {
    modal.querySelector('#sup-timeline-btn').addEventListener('click', () => {
      closeModal();
      const container = document.getElementById('screen-suppliers');
      if (container) renderSupplierTimeline(container, supplierId, supplier.supplierName, () => _render(container));
    });

    modal.querySelector('#sup-edit-btn').addEventListener('click', () => {
      closeModal();
      setTimeout(() => _openEditModal(supplierId), 250);
    });

    modal.querySelector('#sup-archive-btn').addEventListener('click', async () => {
      try {
        if (isArchived) {
          await restoreSupplier(supplierId);
          toast('Supplier restored.', 'success');
        } else {
          await archiveSupplier(supplierId);
          toast('Supplier archived.', 'warning');
        }
        closeModal();
        const container = document.getElementById('screen-suppliers');
        if (container) await _loadList(container);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }
}

// ================================================================
// EDIT MODAL
// ================================================================

async function _openEditModal(supplierId) {
  const supplier = await getSupplier(supplierId);
  if (!supplier) { toast('Supplier not found.', 'error'); return; }
  if (supplier.status === 'Merged') { toast('Merged suppliers cannot be edited.', 'warning'); return; }

  const modal = openModal({ id: 'edit-supplier', title: 'Edit Supplier', bodyHTML: buildSupplierForm(supplier) });
  _wireForm(modal, supplierId);
}

// ================================================================
// FORM WIRING (shared by Add and Edit)
// ================================================================

function _wireForm(modal, editId) {
  const form = modal.querySelector('#supplier-form');

  // Show/hide credit fields based on payment method
  const pmSelect     = modal.querySelector('#sf-payment-method');
  const creditFields = modal.querySelector('#sf-credit-fields');
  const _toggleCredit = () => {
    creditFields.style.display = pmSelect.value === 'Credit' ? '' : 'none';
  };
  pmSelect?.addEventListener('change', _toggleCredit);

  modal.querySelector('#sup-form-cancel').addEventListener('click', closeModal);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn   = form.querySelector('#sup-form-submit');
    const errorBanner = form.querySelector('#sup-form-error');
    errorBanner.style.display = 'none';
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Saving…';

    try {
      const data = readSupplierFormValues(form);
      if (editId) {
        await updateSupplier(editId, data);
        toast('Supplier updated.', 'success');
      } else {
        const newId = await createSupplier(data);
        toast(`Supplier added — ${newId}`, 'success');
      }
      closeModal();
      const container = document.getElementById('screen-suppliers');
      if (container) await _render(container);
    } catch (err) {
      errorBanner.textContent = err.message;
      errorBanner.style.display  = 'block';
      submitBtn.disabled    = false;
      submitBtn.textContent = editId ? 'Save Changes' : 'Add Supplier';
    }
  });
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
