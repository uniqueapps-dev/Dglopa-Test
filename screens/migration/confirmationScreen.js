/**
 * DGLOPA PLATFORM — IME — IMPORT CONFIRMATION SCREEN
 * DT-003B: Shown between Import Preview and the actual commit.
 * Requires explicit user confirmation before any database write occurs.
 * Also collects the batch-level options the commit engine needs.
 */

export function buildConfirmationScreen(preview, options = {}) {
  const { workbookName = '', batchWorkbookType = 'General Inventory', batchSupplierName = '' } = options;

  const hasErrors   = preview.errors   > 0;
  const hasWarnings = preview.warnings > 0;

  return `
    <div class="ime-confirm-header">
      <div class="section-title" style="margin-bottom:2px">Confirm Import</div>
      <div class="text-muted text-xs">${_e(workbookName)}</div>
    </div>

    <!-- Pre-commit summary -->
    <div class="ime-summary-grid" style="margin-top:var(--sp-4)">
      ${_statCard('Rows to Import', preview.inventoryLotsDetected - preview.errors, 'green')}
      ${_statCard('Products Matched', preview.productsMatched, 'green')}
      ${_statCard('New Products', preview.newProducts, 'accent')}
      ${_statCard('New Suppliers', preview.newSuppliers, 'accent')}
      ${_statCard('Errors (will route to Review Queue)', preview.errors, preview.errors > 0 ? 'red' : 'green')}
      ${_statCard('Warnings', preview.warnings, preview.warnings > 0 ? 'amber' : 'green')}
    </div>

    <!-- Status banner -->
    <div class="ime-readiness-banner ${hasErrors ? 'blocked' : 'ready'}" style="margin-top:var(--sp-4)">
      ${hasErrors
        ? `${preview.errors} row${preview.errors !== 1 ? 's' : ''} with errors will NOT be imported — they will go to the Review Queue instead.`
        : '✓ No blocking errors. All valid rows will be committed to the database.'}
    </div>

    ${hasWarnings ? `
    <div class="ime-confirm-notice" style="margin-top:var(--sp-3)">
      <strong>Note:</strong> ${preview.warnings} warning${preview.warnings !== 1 ? 's' : ''} were detected
      (most commonly missing selling price and/or unit cost). These rows will still be imported.
      Prices can be updated in the Product Master after import.
    </div>` : ''}

    <!-- Batch options -->
    <div class="form-section-label" style="margin-top:var(--sp-5)">Import Options</div>

    <div class="form-group">
      <label class="form-label" for="ime-workbook-type">Workbook Type</label>
      <select class="form-select" id="ime-workbook-type">
        <option value="General Inventory"${batchWorkbookType === 'General Inventory' ? ' selected' : ''}>General Inventory (shelf count)</option>
        <option value="Consignment"${batchWorkbookType === 'Consignment' ? ' selected' : ''}>Consignment delivery</option>
        <option value="Other"${batchWorkbookType === 'Other' ? ' selected' : ''}>Other</option>
      </select>
    </div>

    <div class="form-group">
      <label class="form-label" for="ime-supplier-name">
        Batch Supplier
        <span class="text-muted text-xs" style="font-weight:normal"> — optional. Applied to all rows with no matched supplier.</span>
      </label>
      <input class="form-input" id="ime-supplier-name" type="text"
             value="${_e(batchSupplierName)}"
             placeholder="e.g. Quicksave Distributors">
    </div>

    <div class="form-group">
      <label class="form-label" for="ime-import-notes">Notes</label>
      <textarea class="form-input" id="ime-import-notes" rows="2"
                placeholder="Optional — import batch notes"></textarea>
    </div>

    <!-- Explicit confirmation checkbox -->
    <div class="ime-confirm-check" id="ime-confirm-check">
      <input type="checkbox" id="ime-confirm-cb" class="ime-confirm-cb">
      <label for="ime-confirm-cb" class="ime-confirm-label">
        I understand this will write data to the database. This action cannot be
        automatically undone.
      </label>
    </div>

    <!-- Actions -->
    <div class="form-actions" style="margin-top:var(--sp-4)">
      <button class="btn btn-secondary" id="ime-back-btn">Back to Preview</button>
      <button class="btn btn-primary" id="ime-commit-btn" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:16px;height:16px;stroke-width:2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Commit Import
      </button>
    </div>
  `;
}

export function buildImportSummary(commitResult, workbookName) {
  const ok = commitResult.overallResult === 'Success';
  const pct = commitResult.rowsRead > 0
    ? Math.round((commitResult.rowsImported / commitResult.rowsRead) * 100)
    : 0;

  return `
    <div class="ime-confirm-header">
      <div class="section-title" style="margin-bottom:2px">
        Import ${ok ? 'Complete' : 'Failed'}
      </div>
      <div class="text-muted text-xs">${_e(workbookName)} · ID: ${_e(commitResult.importId)}</div>
    </div>

    <div class="ime-readiness-banner ${ok ? 'ready' : 'blocked'}" style="margin-top:var(--sp-4)">
      ${ok
        ? `✓ ${commitResult.rowsImported} row${commitResult.rowsImported !== 1 ? 's' : ''} successfully committed to the database.`
        : 'Import failed. The database was automatically rolled back and is unchanged.'}
    </div>

    <div class="ime-summary-grid" style="margin-top:var(--sp-4)">
      ${_statCard('Rows Read',     commitResult.rowsRead,     'accent')}
      ${_statCard('Rows Imported', commitResult.rowsImported, 'green')}
      ${_statCard('Rows Updated',  commitResult.rowsUpdated,  'accent')}
      ${_statCard('Rows Reviewed', commitResult.rowsReviewed, 'amber')}
      ${_statCard('Rows Skipped',  commitResult.rowsSkipped,  'amber')}
      ${_statCard('Rows Failed',   commitResult.rowsFailed,   commitResult.rowsFailed > 0 ? 'red' : 'green')}
    </div>

    <div class="settings-section-label" style="margin-top:var(--sp-5)">Details</div>
    <div class="settings-list">
      ${_detailRow('Commit Status',     commitResult.overallResult)}
      ${_detailRow('Import Duration',   `${(commitResult.duration / 1000).toFixed(1)}s`)}
      ${_detailRow('Success Rate',      `${pct}%`)}
      ${_detailRow('Import ID',         commitResult.importId ?? '—')}
    </div>

    <div class="form-actions" style="margin-top:var(--sp-5)">
      <button class="btn btn-primary" id="ime-done-btn">Done</button>
    </div>
  `;
}

function _statCard(label, value, color) {
  return `
    <div class="ime-stat-card">
      <div class="ime-stat-value text-${color}">${value ?? 0}</div>
      <div class="ime-stat-label">${label}</div>
    </div>`;
}

function _detailRow(label, value) {
  return `
    <div class="settings-item" style="cursor:default">
      <span class="settings-item-label">${label}</span>
      <span class="settings-item-value">${_e(value)}</span>
    </div>`;
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
