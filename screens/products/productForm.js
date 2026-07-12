/**
 * DGLOPA PLATFORM — PRODUCT FORM COMPONENT
 * Returns HTML string for the Add/Edit product form.
 * DT-002A: All dropdowns sourced from lookup tables. DT-002B: Merged excluded from selectable statuses. (no hardcoded arrays).
 */

// Selectable lifecycle values in the product form.
// 'Merged' is excluded — it is set only by ProductMergeService. (DT-002B)
export const LIFECYCLE_STATUSES = [
  'Trial',
  'Active',
  'Slow Moving',
  'Sleeping',
  'Discontinued',
  'Archived',
];

/**
 * Build the product form HTML.
 * @param {object|null} product   — existing product for edit, null for add
 * @param {Array}       suppliers — [{ id, supplierName }]
 * @param {object}      lookups   — { units, dosageForms, categories }
 *                                  from lookupService.loadLookups()
 * @returns {string} HTML
 */
export function buildProductForm(product = null, suppliers = [], lookups = {}) {
  const v      = product ?? {};
  const isEdit = !!product;

  const { units = [], dosageForms = [], categories = [] } = lookups;

  // Generic option builder for lookup rows {id, name}
  const lookupOptions = (rows, selectedName = '') =>
    rows.map((r) =>
      `<option value="${_e(r.name)}"${r.name === selectedName ? ' selected' : ''}>${_e(r.name)}</option>`
    ).join('');

  const supplierOptions = suppliers
    .map((s) =>
      `<option value="${_e(s.id)}"${v.preferredSupplierId === s.id ? ' selected' : ''}>${_e(s.supplierName)}</option>`
    ).join('');

  const lifecycleOptions = LIFECYCLE_STATUSES
    .map((s) =>
      `<option value="${_e(s)}"${(v.lifecycleStatus || 'Active') === s ? ' selected' : ''}>${_e(s)}</option>`
    ).join('');

  return `
    <form id="product-form" novalidate>
      <div id="form-error-banner" class="form-error-banner" style="display:none"></div>

      <!-- IDENTITY -->
      <div class="form-section-label">Identity</div>

      <div class="form-group">
        <label class="form-label" for="f-productName">Product Name <span class="req">*</span></label>
        <input class="form-input" id="f-productName" name="productName"
               type="text" autocomplete="off" spellcheck="false"
               value="${_e(v.productName || '')}" placeholder="e.g. Amoxicillin">
      </div>

      <div class="form-group">
        <label class="form-label" for="f-genericName">Generic Name</label>
        <input class="form-input" id="f-genericName" name="genericName"
               type="text" autocomplete="off"
               value="${_e(v.genericName || '')}" placeholder="INN / generic">
      </div>

      <div class="form-group">
        <label class="form-label" for="f-brand">Brand</label>
        <input class="form-input" id="f-brand" name="brand"
               type="text" autocomplete="off"
               value="${_e(v.brand || '')}" placeholder="Brand or manufacturer">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="f-strength">Strength</label>
          <input class="form-input" id="f-strength" name="strength"
                 type="text" autocomplete="off"
                 value="${_e(v.strength || '')}" placeholder="e.g. 500mg">
        </div>

        <div class="form-group">
          <label class="form-label" for="f-dosageForm">Dosage Form <span class="req">*</span></label>
          <select class="form-select" id="f-dosageForm" name="dosageForm">
            <option value="">Select form…</option>
            ${lookupOptions(dosageForms, v.dosageForm)}
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="f-category">Category</label>
        <select class="form-select" id="f-category" name="category">
          <option value="">Select category…</option>
          ${lookupOptions(categories, v.category)}
        </select>
      </div>

      <!-- UNITS -->
      <div class="form-section-label">Units</div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="f-baseUnit">Base Unit <span class="req">*</span></label>
          <select class="form-select" id="f-baseUnit" name="baseUnit">
            <option value="">Select…</option>
            ${lookupOptions(units, v.baseUnit)}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="f-receivingUnits">Receiving Unit</label>
          <input class="form-input" id="f-receivingUnits" name="receivingUnits"
                 type="text" autocomplete="off"
                 value="${_e(v.receivingUnits || '')}" placeholder="e.g. Box of 100">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="f-sellingUnits">Selling Unit</label>
        <input class="form-input" id="f-sellingUnits" name="sellingUnits"
               type="text" autocomplete="off"
               value="${_e(v.sellingUnits || '')}" placeholder="e.g. Per tablet">
      </div>

      <!-- SOURCING -->
      <div class="form-section-label">Sourcing</div>

      <div class="form-group">
        <label class="form-label" for="f-preferredSupplierId">Preferred Supplier</label>
        <select class="form-select" id="f-preferredSupplierId" name="preferredSupplierId">
          <option value="">None selected</option>
          ${supplierOptions}
        </select>
      </div>

      <!-- STATUS -->
      <div class="form-section-label">Status</div>
      <div class="form-group">
        <label class="form-label" for="f-lifecycleStatus">Lifecycle Status</label>
        <select class="form-select" id="f-lifecycleStatus" name="lifecycleStatus">
          ${lifecycleOptions}
        </select>
      </div>

      <!-- NOTES -->
      <div class="form-section-label">Notes</div>
      <div class="form-group">
        <label class="form-label" for="f-notes">Notes</label>
        <textarea class="form-input" id="f-notes" name="notes"
                  rows="3" placeholder="Optional notes…">${_e(v.notes || '')}</textarea>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="form-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary" id="form-submit-btn">
          ${isEdit ? 'Save Changes' : 'Add Product'}
        </button>
      </div>
    </form>
  `;
}

/**
 * Read form values into a plain object.
 */
export function readFormValues(formEl) {
  const fd   = new FormData(formEl);
  const data = {};
  fd.forEach((val, key) => { data[key] = val; });
  return data;
}

function _e(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
