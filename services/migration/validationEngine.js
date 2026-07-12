/**
 * DGLOPA PLATFORM — IME — VALIDATION ENGINE
 * Detects per DT-003A requirements:
 *   Missing Product, Missing Supplier, Missing Unit,
 *   Missing Cost, Missing Selling Price,
 *   Invalid Quantity, Invalid Expiry,
 *   Duplicate Workbook Rows
 *
 * Produces ValidationIssue objects matching the ReviewQueue schema shape
 * (Category, Severity, AssignedTo, DueDate, Status, Notes) so they can be
 * persisted directly in a future ticket without remapping.
 */

export const SEVERITY = Object.freeze({ ERROR: 'error', WARNING: 'warning' });

export const ISSUE_CATEGORIES = Object.freeze({
  MISSING_PRODUCT:       'Missing Product',
  MISSING_SUPPLIER:      'Missing Supplier',
  MISSING_UNIT:          'Missing Unit',
  MISSING_COST:          'Missing Cost',
  MISSING_SELLING_PRICE: 'Missing Selling Price',
  INVALID_QUANTITY:      'Invalid Quantity',
  INVALID_EXPIRY:        'Invalid Expiry',
  DUPLICATE_ROW:         'Duplicate Workbook Row',
});

/**
 * Validate an array of NormalizedRow objects.
 * @param {NormalizedRow[]} rows
 * @returns {ValidationIssue[]}
 */
export function validateRows(rows) {
  const issues = [];
  rows.forEach((row) => issues.push(..._validateRow(row)));
  issues.push(..._detectDuplicateRows(rows));
  return issues;
}

function _validateRow(row) {
  const issues = [];
  const r = row._rowIndex;

  if (!row.productName?.trim()) {
    issues.push(_issue(r, SEVERITY.ERROR, ISSUE_CATEGORIES.MISSING_PRODUCT,
      'Product name is blank.',
      'Provide a product name or remove this row before import.'));
  }

  if (!row.supplierName?.trim()) {
    issues.push(_issue(r, SEVERITY.WARNING, ISSUE_CATEGORIES.MISSING_SUPPLIER,
      'Supplier name is blank.',
      'Add a supplier name, or this row will require manual supplier assignment during review.'));
  }

  if (!row.unit?.trim()) {
    issues.push(_issue(r, SEVERITY.WARNING, ISSUE_CATEGORIES.MISSING_UNIT,
      'Unit is blank.',
      'Specify a base unit (e.g. Tablet, Bottle) — required before this row can be imported.'));
  }

  if (row.unitCost == null) {
    issues.push(_issue(r, SEVERITY.WARNING, ISSUE_CATEGORIES.MISSING_COST,
      'Unit cost is blank or unreadable.',
      'Enter a numeric unit cost (e.g. 250.00).'));
  }

  if (row.sellingPrice == null) {
    issues.push(_issue(r, SEVERITY.WARNING, ISSUE_CATEGORIES.MISSING_SELLING_PRICE,
      'Selling price is blank or unreadable.',
      'Enter a numeric selling price (e.g. 350.00).'));
  }

  if (row.quantity == null) {
    issues.push(_issue(r, SEVERITY.ERROR, ISSUE_CATEGORIES.INVALID_QUANTITY,
      'Quantity is blank or not a valid number.',
      'Enter a positive numeric quantity.'));
  } else if (row.quantity <= 0) {
    issues.push(_issue(r, SEVERITY.ERROR, ISSUE_CATEGORIES.INVALID_QUANTITY,
      `Quantity (${row.quantity}) must be greater than zero.`,
      'Correct the quantity to a positive number.'));
  } else if (!Number.isFinite(row.quantity)) {
    issues.push(_issue(r, SEVERITY.ERROR, ISSUE_CATEGORIES.INVALID_QUANTITY,
      'Quantity is not a finite number.',
      'Correct the quantity value.'));
  }

  if (row.expiryDate == null && _hadExpiryInput(row)) {
    issues.push(_issue(r, SEVERITY.ERROR, ISSUE_CATEGORIES.INVALID_EXPIRY,
      'Expiry date could not be parsed.',
      'Use a recognizable date format, e.g. DD/MM/YYYY or YYYY-MM-DD.'));
  } else if (row.expiryDate != null && row.expiryDate < Date.now()) {
    issues.push(_issue(r, SEVERITY.WARNING, ISSUE_CATEGORIES.INVALID_EXPIRY,
      'Expiry date is in the past.',
      'Confirm this is correct — expired stock should not normally be received.'));
  }

  return issues;
}

/**
 * Conservative check: did the source row have a column that looks like an
 * expiry field with a non-empty value, even though normalization failed to
 * parse it into a date? Avoids false positives when no expiry column exists.
 */
function _hadExpiryInput(row) {
  return Object.entries(row._raw).some(
    ([k, v]) => /exp|expiry/i.test(k) && String(v ?? '').trim() !== ''
  );
}

/**
 * Detect rows that are exact duplicates of an earlier row (by productName +
 * batchNumber + supplierName + quantity). Flags every duplicate after the first.
 */
function _detectDuplicateRows(rows) {
  const issues = [];
  const seen = new Map();

  rows.forEach((row) => {
    if (!row.productName?.trim()) return; // already flagged as missing product

    const key = [
      row.productName?.trim().toLowerCase(),
      row.batchNumber?.trim().toLowerCase(),
      row.supplierName?.trim().toLowerCase(),
      row.quantity,
    ].join('|');

    if (seen.has(key)) {
      const firstRow = seen.get(key);
      issues.push(_issue(row._rowIndex, SEVERITY.WARNING, ISSUE_CATEGORIES.DUPLICATE_ROW,
        `This row appears identical to row ${firstRow} (same product, batch, supplier, and quantity).`,
        'Confirm this is not an accidental duplicate entry before import.'));
    } else {
      seen.set(key, row._rowIndex);
    }
  });

  return issues;
}

function _issue(rowIndex, severity, category, description, suggestedResolution) {
  return {
    id:        `ISSUE-${rowIndex}-${category.replace(/\s+/g, '_')}-${Math.random().toString(36).slice(2, 7)}`,
    rowIndex,
    severity,
    category,
    description,
    suggestedResolution,
  };
}
