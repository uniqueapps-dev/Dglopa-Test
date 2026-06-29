/**
 * DGLOPA PLATFORM — PRODUCTS SCREEN (Dglopa Product Master)
 * Manages list, search, filter, add, edit, archive, view.
 */

import { searchProducts, createProduct, updateProduct, archiveProduct, restoreProduct, getProduct, getProductCount } from '../../services/productService.js';
import { buildProductForm, readFormValues }   from './productForm.js';
import { buildProductProfile }                from './productProfile.js';
import { toast }                              from '../../components/toast.js';
import { openModal, closeModal }              from '../../components/modal.js';
import { debounce }                           from '../../utils/helpers.js';
import { db }                                 from '../../db/database.js';

// ---- Module state ----
let _query        = '';
let _statusFilter = 'Active';
let _lastResults  = [];

// ---- Entry point called by router onEnter ----
export async function initProductsScreen() {
  const container = document.getElementById('screen-inventory');
  if (!container) return;
  _render(container);
  await _loadList();
}

// ================================================================
// RENDER SHELL
// ================================================================
function _render(container) {
  container.innerHTML = `
    <div class="screen-header d-flex justify-between align-center mb-4">
      <div>
        <div class="section-title" style="margin-bottom:0">Product Master</div>
        <div class="text-muted text-xs" id="prd-count">—</div>
      </div>
      <button class="btn btn-primary btn-sm" id="prd-add-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add
      </button>
    </div>

    <!-- Search + filter -->
    <div class="search-wrap">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="search-input" id="prd-search" type="search"
             placeholder="Name, generic, brand, strength…"
             autocomplete="off" spellcheck="false" value="${_e(_query)}">
    </div>

    <!-- Quick filters -->
    <div class="filter-tabs" id="prd-filters">
      ${_filterTab('Active',       _statusFilter)}
      ${_filterTab('Archived',     _statusFilter)}
      ${_filterTab('Discontinued', _statusFilter)}
      ${_filterTab('All',          _statusFilter)}
    </div>

    <!-- List -->
    <div id="prd-list">
      <div class="empty-state">
        <div class="loader-spinner"></div>
      </div>
    </div>
  `;

  // Events
  container.querySelector('#prd-add-btn').addEventListener('click', _openAddModal);
  container.querySelector('#prd-search').addEventListener('input', debounce(_onSearch, 250));
  container.querySelector('#prd-filters').addEventListener('click', _onFilterClick);

  _updateCount();
}

function _filterTab(label, active) {
  return `<button class="filter-tab${label === active ? ' active' : ''}" data-filter="${label}">${label}</button>`;
}

// ================================================================
// LIST LOAD + RENDER
// ================================================================
async function _loadList() {
  const listEl = document.getElementById('prd-list');
  if (!listEl) return;

  try {
    _lastResults = await searchProducts({ query: _query, statusFilter: _statusFilter });
    _renderList(listEl, _lastResults);
    _updateCount();
  } catch (err) {
    console.error('[DPM] Load error:', err);
    listEl.innerHTML = `<div class="empty-state"><div class="empty-state-title text-red">Failed to load products</div><div class="empty-state-body">${_e(err.message)}</div></div>`;
  }
}

function _renderList(listEl, products) {
  if (products.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
        <div class="empty-state-title">${_query ? 'No products match your search' : 'No products yet'}</div>
        <div class="empty-state-body">${_query ? 'Try a different search term.' : 'Tap Add to create your first product.'}</div>
      </div>`;
    return;
  }

  listEl.innerHTML = products.map(_productCard).join('');
  listEl.querySelectorAll('.prd-card').forEach((card) => {
    card.addEventListener('click', () => _openProfile(card.dataset.id));
  });
}

function _productCard(p) {
  const badgeCls = { Active: 'badge-green', Discontinued: 'badge-amber', Archived: 'badge-red' }[p.lifecycleStatus] || 'badge-accent';
  const sub = [p.strength, p.dosageForm, p.genericName].filter(Boolean).join(' · ');
  return `
    <div class="prd-card card" data-id="${_e(p.id)}" style="cursor:pointer;margin-bottom:var(--sp-2)">
      <div class="d-flex justify-between align-center">
        <div class="prd-card-name fw-medium">${_e(p.productName)}</div>
        <span class="badge ${badgeCls}">${_e(p.lifecycleStatus)}</span>
      </div>
      ${sub ? `<div class="prd-card-sub text-muted text-xs" style="margin-top:2px">${_e(sub)}</div>` : ''}
      <div class="prd-card-id text-mono text-xs" style="color:var(--clr-text-3);margin-top:var(--sp-1)">${_e(p.id)}</div>
    </div>`;
}

async function _updateCount() {
  const el = document.getElementById('prd-count');
  if (!el) return;
  try {
    const n = await getProductCount();
    el.textContent = `${n} active product${n !== 1 ? 's' : ''}`;
  } catch (_) {}
}

// ================================================================
// SEARCH + FILTER EVENTS
// ================================================================
function _onSearch(e) {
  _query = e.target.value;
  _loadList();
}

function _onFilterClick(e) {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  _statusFilter = btn.dataset.filter;
  document.querySelectorAll('.filter-tab').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  _loadList();
}

// ================================================================
// ADD MODAL
// ================================================================
async function _openAddModal() {
  const suppliers = await _loadSuppliers();
  const modal = openModal({
    id:       'add-product',
    title:    'Add Product',
    bodyHTML: buildProductForm(null, suppliers),
  });

  modal.querySelector('#form-cancel-btn').addEventListener('click', closeModal);
  modal.querySelector('#product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await _handleFormSubmit(e.target, null);
  });
}

// ================================================================
// EDIT MODAL
// ================================================================
async function _openEditModal(productId) {
  const [product, suppliers] = await Promise.all([getProduct(productId), _loadSuppliers()]);
  if (!product) { toast('Product not found.', 'error'); return; }

  const modal = openModal({
    id:       'edit-product',
    title:    'Edit Product',
    bodyHTML: buildProductForm(product, suppliers),
  });

  modal.querySelector('#form-cancel-btn').addEventListener('click', closeModal);
  modal.querySelector('#product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await _handleFormSubmit(e.target, productId);
  });
}

// ================================================================
// FORM SUBMIT
// ================================================================
async function _handleFormSubmit(formEl, editId) {
  const submitBtn  = formEl.querySelector('#form-submit-btn');
  const errorBanner = formEl.querySelector('#form-error-banner');
  errorBanner.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    const data = readFormValues(formEl);
    if (editId) {
      await updateProduct(editId, data);
      toast('Product updated.', 'success');
    } else {
      const newId = await createProduct(data);
      toast(`Product added — ${newId}`, 'success');
    }
    closeModal();
    await _loadList();
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = 'block';
    submitBtn.disabled  = false;
    submitBtn.textContent = editId ? 'Save Changes' : 'Add Product';
  }
}

// ================================================================
// PROFILE VIEW
// ================================================================
async function _openProfile(productId) {
  const product = await getProduct(productId);
  if (!product) { toast('Product not found.', 'error'); return; }

  let supplier = null;
  if (product.preferredSupplierId) {
    supplier = await db.Suppliers.get(product.preferredSupplierId).catch(() => null);
  }

  // Lazy import to keep initial bundle small
  const { buildProductProfile } = await import('./productProfile.js');

  const modal = openModal({
    id:       'view-product',
    bodyHTML: `
      <div id="profile-body">${buildProductProfile(product, supplier)}</div>
      <div class="profile-actions">
        <button class="btn btn-secondary btn-sm" id="profile-edit-btn">Edit</button>
        <button class="btn btn-danger btn-sm" id="profile-archive-btn">
          ${product.lifecycleStatus === 'Archived' ? 'Restore' : 'Archive'}
        </button>
      </div>`,
  });

  modal.querySelector('#profile-edit-btn').addEventListener('click', () => {
    closeModal();
    setTimeout(() => _openEditModal(productId), 250);
  });

  modal.querySelector('#profile-archive-btn').addEventListener('click', async () => {
    try {
      if (product.lifecycleStatus === 'Archived') {
        await restoreProduct(productId);
        toast('Product restored.', 'success');
      } else {
        await archiveProduct(productId);
        toast('Product archived.', 'warning');
      }
      closeModal();
      await _loadList();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ================================================================
// HELPERS
// ================================================================
async function _loadSuppliers() {
  try {
    return await db.Suppliers
      .where('status').equals('Active')
      .sortBy('supplierName');
  } catch (_) {
    return [];
  }
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
