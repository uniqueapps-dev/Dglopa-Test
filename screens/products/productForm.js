/**
 * DGLOPA PLATFORM — PRODUCT FORM COMPONENT
 * Returns HTML string for the Add/Edit product form.
 * Suppliers list injected for the preferred supplier selector.
 */

export const DOSAGE_FORMS = [
  'Tablet', 'Capsule', 'Syrup', 'Suspension', 'Solution',
  'Injection', 'Cream', 'Ointment', 'Gel', 'Drops',
  'Inhaler', 'Suppository', 'Patch', 'Powder', 'Sachet', 'Other',
];

export const CATEGORIES = [
  'Analgesic', 'Antibiotic', 'Antifungal', 'Antiviral',
  'Antihypertensive', 'Antidiabetic', 'Cardiovascular', 'CNS',
  'Dermatology', 'ENT', 'Gastrointestinal', 'Haematology',
  'Hormones', 'Immunology', 'Nutritional', 'Ophthalmology',
  'Respiratory', 'Urinary', 'Vitamins & Supplements', 'Other',
];

export const UNITS = [
  'Tablet', 'Capsule', 'Bottle', 'Vial', 'Ampoule',
  'Sachet', 'Tube', 'Pack', 'Strip', 'Piece', 'ml', 'g',
];

/**
 * Build the product form HTML.
 * @param {object|null} product — existing product for edit mode, null for add
 * @param {Array}       suppliers — list of { id, supplierName } objects
 * @returns {string} HTML
 */
export function buildProductForm(product = null, suppliers = []) {
  const v = product ?? {};
  const isEdit = !!product;

  const optionList = (arr, selected = '') => arr
    .map((o) => `<option value="${_e(o)}"${selected === o ? ' selected' : ''}>${_e(o)}</option>`)
    .join('');

  const supplierOptions = suppliers
    .map((s) => `<option value="${_e(s.id)}"${v.preferredSupplierId === s.id ? ' selected' : ''}>${_e(s.supplierName)}</option>`)
    .join('');

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
            ${optionList(DOSAGE_FORMS, v.dosageForm)}
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="f-category">Category</label>
        <select class="form-select" id="f-category" name="category">
          <option value="">Select category…</option>
          ${optionList(CATEGORIES, v.category)}
        </select>
      </div>

      <!-- UNITS -->
      <div class="form-section-label">Units</div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="f-baseUnit">Base Unit <span class="req">*</span></label>
          <select class="form-select" id="f-baseUnit" name="baseUnit">
            <option value="">Select…</option>
            ${optionList(UNITS, v.baseUnit)}
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

      <!-- SUPPLIER -->
      <div class="form-section-label">Sourcing</div>

      <div class="form-group">
        <label class="form-label" for="f-preferredSupplierId">Preferred Supplier</label>
        <select class="form-select" id="f-preferredSupplierId" name="preferredSupplierId">
          <option value="">None selected</option>
          ${supplierOptions}
        </select>
      </div>

      <!-- STATUS (edit only) -->
      ${isEdit ? `
      <div class="form-section-label">Status</div>
      <div class="form-group">
        <label class="form-label" for="f-lifecycleStatus">Lifecycle Status</label>
        <select class="form-select" id="f-lifecycleStatus" name="lifecycleStatus">
          <option value="Active"${v.lifecycleStatus === 'Active' ? ' selected' : ''}>Active</option>
          <option value="Discontinued"${v.lifecycleStatus === 'Discontinued' ? ' selected' : ''}>Discontinued</option>
          <option value="Archived"${v.lifecycleStatus === 'Archived' ? ' selected' : ''}>Archived</option>
        </select>
      </div>
      ` : ''}

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
  const fd = new FormData(formEl);
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
