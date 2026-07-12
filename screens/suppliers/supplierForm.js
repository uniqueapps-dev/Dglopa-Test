/**
 * DGLOPA PLATFORM — SUPPLIER FORM COMPONENT
 * DT-005: Builds the Add / Edit supplier form HTML.
 */

import { PAYMENT_METHODS, ORDERING_METHODS } from '../../services/supplierService.js';

export function buildSupplierForm(supplier = null) {
  const v      = supplier ?? {};
  const isEdit = !!supplier;

  const pmOptions = PAYMENT_METHODS.map((m) =>
    `<option value="${_e(m)}"${(v.paymentMethod || 'Pay On Delivery') === m ? ' selected' : ''}>${_e(m)}</option>`
  ).join('');

  const omOptions = ORDERING_METHODS.map((m) =>
    `<option value="${_e(m)}"${(v.preferredOrderingMethod || 'WhatsApp') === m ? ' selected' : ''}>${_e(m)}</option>`
  ).join('');

  return `
    <form id="supplier-form" novalidate>
      <div id="sup-form-error" class="form-error-banner" style="display:none"></div>

      <!-- IDENTITY -->
      <div class="form-section-label">Business Identity</div>

      <div class="form-group">
        <label class="form-label" for="sf-name">Supplier Name <span class="req">*</span></label>
        <input class="form-input" id="sf-name" name="supplierName" type="text"
               autocomplete="off" value="${_e(v.supplierName || '')}" placeholder="Legal business name">
      </div>

      <div class="form-group">
        <label class="form-label" for="sf-trading">Trading Name</label>
        <input class="form-input" id="sf-trading" name="tradingName" type="text"
               autocomplete="off" value="${_e(v.tradingName || '')}" placeholder="Brand / trading name if different">
      </div>

      <div class="form-group">
        <label class="form-label" for="sf-contact">Contact Person</label>
        <input class="form-input" id="sf-contact" name="contactPerson" type="text"
               autocomplete="off" value="${_e(v.contactPerson || '')}" placeholder="Primary contact name">
      </div>

      <!-- CONTACT -->
      <div class="form-section-label">Contact Details</div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="sf-phone">Phone</label>
          <input class="form-input" id="sf-phone" name="phone" type="tel"
                 value="${_e(v.phone || '')}" placeholder="e.g. 08012345678">
        </div>
        <div class="form-group">
          <label class="form-label" for="sf-whatsapp">WhatsApp</label>
          <input class="form-input" id="sf-whatsapp" name="whatsApp" type="tel"
                 value="${_e(v.whatsApp || '')}" placeholder="If different from phone">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="sf-email">Email</label>
        <input class="form-input" id="sf-email" name="email" type="email"
               value="${_e(v.email || '')}" placeholder="orders@supplier.com">
      </div>

      <div class="form-group">
        <label class="form-label" for="sf-address">Address</label>
        <input class="form-input" id="sf-address" name="address" type="text"
               autocomplete="off" value="${_e(v.address || '')}" placeholder="Street address">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="sf-city">City</label>
          <input class="form-input" id="sf-city" name="city" type="text"
                 autocomplete="off" value="${_e(v.city || '')}" placeholder="City">
        </div>
        <div class="form-group">
          <label class="form-label" for="sf-state">State</label>
          <input class="form-input" id="sf-state" name="state" type="text"
                 autocomplete="off" value="${_e(v.state || '')}" placeholder="State">
        </div>
      </div>

      <!-- PAYMENT POLICY -->
      <div class="form-section-label">Payment Policy</div>

      <div class="form-group">
        <label class="form-label" for="sf-payment-method">Payment Method</label>
        <select class="form-select" id="sf-payment-method" name="paymentMethod">
          ${pmOptions}
        </select>
      </div>

      <div class="form-row" id="sf-credit-fields" style="${(v.paymentMethod || 'Pay On Delivery') === 'Credit' ? '' : 'display:none'}">
        <div class="form-group">
          <label class="form-label" for="sf-credit-limit">Credit Limit (₦)</label>
          <input class="form-input" id="sf-credit-limit" name="creditLimit" type="number"
                 min="0" step="100" value="${v.creditLimit ?? ''}" placeholder="0">
        </div>
        <div class="form-group">
          <label class="form-label" for="sf-credit-days">Credit Days</label>
          <input class="form-input" id="sf-credit-days" name="creditDays" type="number"
                 min="0" value="${v.creditDays ?? ''}" placeholder="e.g. 30">
        </div>
      </div>

      <!-- ORDERING POLICY -->
      <div class="form-section-label">Ordering Policy</div>

      <div class="form-group">
        <label class="form-label" for="sf-ordering-method">Preferred Ordering Method</label>
        <select class="form-select" id="sf-ordering-method" name="preferredOrderingMethod">
          ${omOptions}
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="sf-min-order">Min. Order Value (₦)</label>
          <input class="form-input" id="sf-min-order" name="minimumOrderValue" type="number"
                 min="0" step="100" value="${v.minimumOrderValue ?? ''}" placeholder="0">
        </div>
        <div class="form-group">
          <label class="form-label" for="sf-lead-time">Lead Time (days)</label>
          <input class="form-input" id="sf-lead-time" name="leadTime" type="number"
                 min="0" value="${v.leadTime ?? ''}" placeholder="e.g. 2">
        </div>
      </div>

      <!-- PREFERENCE -->
      ${isEdit ? `
      <div class="form-section-label">Preference</div>
      <div class="ime-confirm-check" style="margin-bottom:var(--sp-4)">
        <input type="checkbox" id="sf-preferred" name="preferredSupplier" class="ime-confirm-cb"
               ${v.preferredSupplier ? 'checked' : ''}>
        <label for="sf-preferred" class="ime-confirm-label">Mark as a Preferred Supplier</label>
      </div>` : ''}

      <!-- NOTES -->
      <div class="form-section-label">Notes</div>
      <div class="form-group">
        <label class="form-label" for="sf-notes">Business Notes</label>
        <textarea class="form-input" id="sf-notes" name="notes" rows="3"
                  placeholder="Optional notes about this supplier…">${_e(v.notes || '')}</textarea>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="sup-form-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary" id="sup-form-submit">
          ${isEdit ? 'Save Changes' : 'Add Supplier'}
        </button>
      </div>
    </form>
  `;
}

export function readSupplierFormValues(formEl) {
  const fd   = new FormData(formEl);
  const data = {};
  fd.forEach((val, key) => { data[key] = val; });
  // Checkbox (not submitted when unchecked by FormData)
  data.preferredSupplier = formEl.querySelector('#sf-preferred')?.checked ?? false;
  // Numeric fields
  ['creditLimit','creditDays','minimumOrderValue','leadTime'].forEach((f) => {
    data[f] = data[f] !== '' ? parseFloat(data[f]) : null;
  });
  return data;
}

function _e(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
