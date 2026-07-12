/**
 * DGLOPA PLATFORM — IME — IMPORT PREVIEW VIEW
 * Read-only rendering of a PipelineResult. No commit action exists in DT-003A.
 */

import { formatNaira } from '../../utils/helpers.js';

export function buildImportPreview(result) {
  const { sourceFile, preview, normalizedRows, productMatches, supplierMatches, reviewQueue } = result;

  return `
    <div class="import-summary-header">
      <div class="section-title" style="margin-bottom:2px">Import Preview</div>
      <div class="text-muted text-xs">${_e(sourceFile.name)} · ${preview.totalRows} row${preview.totalRows !== 1 ? 's' : ''} · ${_e(preview.sourceFormat.toUpperCase())}</div>
    </div>

    <div class="ime-summary-grid">
      ${_summaryCard('Products Matched', preview.productsMatched, 'green')}
      ${_summaryCard('New Products', preview.newProducts, 'accent')}
      ${_summaryCard('Suppliers Matched', preview.suppliersMatched, 'green')}
      ${_summaryCard('New Suppliers', preview.newSuppliers, 'accent')}
      ${_summaryCard('Inventory Lots Detected', preview.inventoryLotsDetected, 'accent')}
      ${_summaryCard('Errors', preview.errors, preview.errors > 0 ? 'red' : 'green')}
      ${_summaryCard('Warnings', preview.warnings, preview.warnings > 0 ? 'amber' : 'green')}
    </div>

    <div class="ime-readiness-banner ${preview.readyToImport ? 'ready' : 'blocked'}">
      ${preview.readyToImport
        ? '✓ No blocking errors detected. (Import is disabled in this build — preview only.)'
        : `${preview.errors} error${preview.errors !== 1 ? 's' : ''} must be resolved before this workbook could be imported.`}
    </div>

    <div class="section-title" style="margin-top:var(--sp-6);font-size:var(--text-lg)">Row Details</div>
    <div class="ime-row-list">
      ${normalizedRows.map((row) => _rowCard(row, productMatches, supplierMatches, reviewQueue)).join('')}
    </div>
  `;
}

function _summaryCard(label, value, color) {
  return `
    <div class="ime-stat-card">
      <div class="ime-stat-value text-${color}">${value}</div>
      <div class="ime-stat-label">${label}</div>
    </div>`;
}

function _rowCard(row, productMatches, supplierMatches, reviewQueue) {
  const pMatch = productMatches.find((m) => m.rowIndex === row._rowIndex);
  const sMatch = supplierMatches.find((m) => m.rowIndex === row._rowIndex);
  const issues = reviewQueue.filter((i) => i.rowIndex === row._rowIndex);

  const hasError   = issues.some((i) => i.severity === 'error');
  const hasWarning = issues.some((i) => i.severity === 'warning');
  const rowClass   = hasError ? 'row-error' : hasWarning ? 'row-warning' : 'row-clean';

  return `
    <div class="ime-row-card ${rowClass}">
      <div class="ime-row-header">
        <span class="ime-row-number">Row ${row._rowIndex}</span>
        ${hasError ? '<span class="badge badge-red">Error</span>' : hasWarning ? '<span class="badge badge-amber">Warning</span>' : '<span class="badge badge-green">Clean</span>'}
      </div>

      <div class="ime-row-name">${_e(row.productName || '(blank product name)')}</div>
      <div class="ime-row-sub text-muted text-xs">
        ${[row.strength, row.dosageForm, row.brand].filter(Boolean).map(_e).join(' · ') || '—'}
      </div>

      <div class="ime-row-grid">
        ${_field('Product Match', pMatch?.matched ? `${_e(pMatch.productName)} (${pMatch.confidence})` : 'No match — new product')}
        ${_field('Supplier Match', sMatch?.matched ? `${_e(sMatch.supplierName)} (${sMatch.confidence})` : (row.supplierName ? 'No match — new supplier' : '—'))}
        ${_field('Quantity', row.quantity != null ? String(row.quantity) : '—')}
        ${_field('Unit Cost', row.unitCost != null ? formatNaira(row.unitCost) : '—')}
        ${_field('Selling Price', row.sellingPrice != null ? formatNaira(row.sellingPrice) : '—')}
        ${_field('Batch', row.batchNumber || '—')}
        ${_field('Expiry', row.expiryDate ? new Date(row.expiryDate).toLocaleDateString('en-NG') : '—')}
      </div>

      ${issues.length > 0 ? `
      <div class="ime-row-issues">
        ${issues.map((i) => `
          <div class="ime-issue ime-issue-${i.severity}">
            <span class="ime-issue-cat">${_e(i.category)}</span>
            <span class="ime-issue-desc">${_e(i.description)}</span>
          </div>
        `).join('')}
      </div>` : ''}
    </div>`;
}

function _field(label, value) {
  return `<div class="ime-field"><span class="ime-field-label">${label}</span><span class="ime-field-value">${value}</span></div>`;
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
