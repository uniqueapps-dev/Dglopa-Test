/**
 * DGLOPA PLATFORM — IME — NORMALIZER
 * Maps arbitrary spreadsheet column headers to canonical field names,
 * and cleans up cell values (whitespace, currency symbols, date parsing).
 *
 * Output of this stage: an array of NormalizedRow objects, one per
 * workbook row, each carrying both the canonical fields AND the
 * original raw row (for traceability back to the source).
 *
 * NormalizedRow shape:
 *   {
 *     _rowIndex:      number,   // 1-based row number in the original sheet (excl. header)
 *     _raw:           object,   // original row as parsed
 *     productName:    string,
 *     genericName:    string,
 *     brand:          string,
 *     strength:       string,
 *     dosageForm:     string,
 *     category:       string,
 *     supplierName:   string,
 *     unit:           string,
 *     quantity:       number|null,
 *     unitCost:       number|null,
 *     sellingPrice:   number|null,
 *     batchNumber:    string,
 *     expiryDate:     number|null,  // epoch ms, or null if unparseable
 *     shelfLocation:  string,
 *   }
 */

// Canonical field → array of header aliases we'll recognize (case-insensitive, trimmed)
const HEADER_ALIASES = {
  productName:   ['product name', 'product', 'item name', 'item', 'drug name', 'name'],
  genericName:   ['generic name', 'generic', 'inn', 'active ingredient'],
  brand:         ['brand', 'brand name', 'manufacturer brand'],
  strength:      ['strength', 'dosage strength', 'concentration'],
  dosageForm:    ['dosage form', 'form', 'dose form'],
  category:      ['category', 'class', 'drug class', 'therapeutic class'],
  supplierName:  ['supplier', 'supplier name', 'vendor', 'distributor'],
  unit:          ['unit', 'base unit', 'uom', 'unit of measure'],
  quantity:      ['quantity', 'qty', 'qty received', 'quantity received'],
  unitCost:      ['unit cost', 'cost', 'cost price', 'buying price', 'purchase price'],
  sellingPrice:  ['selling price', 'price', 'retail price', 'sale price'],
  batchNumber:   ['batch', 'batch number', 'batch no', 'lot number', 'lot no'],
  expiryDate:    ['expiry', 'expiry date', 'exp date', 'exp', 'expiration date'],
  shelfLocation: ['shelf', 'shelf location', 'location', 'bin'],
};

/**
 * Build a header → canonical field map for a given sheet's headers.
 * @param {string[]} headers
 * @returns {object} map of rawHeader -> canonicalField
 */
export function mapHeaders(headers) {
  const map = {};
  const usedCanonical = new Set();

  for (const rawHeader of headers) {
    const cleaned = rawHeader.trim().toLowerCase();
    let matched = null;

    for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
      if (usedCanonical.has(canonical)) continue; // first match wins
      if (aliases.includes(cleaned)) { matched = canonical; break; }
    }

    if (matched) {
      map[rawHeader] = matched;
      usedCanonical.add(matched);
    }
  }

  return map;
}

/**
 * Normalize a RawSheet into an array of NormalizedRow.
 * @param {RawSheet} rawSheet
 * @returns {NormalizedRow[]}
 */
export function normalizeRows(rawSheet) {
  const { headers, rows } = rawSheet;
  const headerMap = mapHeaders(headers);

  // VL-004 fix: skip aggregate footer rows (e.g. "PAGE 1 TOTAL = 543,599.76")
  // These appear in consignment workbooks as per-page running totals.
  // Detection: productName-mapped cell contains 'total' keyword and all numeric
  // cells (quantity, cost) are blank or zero.
  const _productNameAliases = HEADER_ALIASES.productName || [];
  const filteredRows = rows.filter((row) => {
    for (const [rawH, canonical] of Object.entries(mapHeaders(headers))) {
      if (canonical === 'productName') {
        const v = String(row[rawH] ?? '').trim().toLowerCase();
        if (v.includes('total') && v.length > 10) return false; // skip totals rows
      }
    }
    return true;
  });

  return filteredRows.map((row, idx) => {
    const normalized = {
      _rowIndex: idx + 1, // 1-based, header row excluded
      _raw:      row,
      productName:   '', genericName: '', brand: '', strength: '',
      dosageForm:    '', category: '', supplierName: '', unit: '',
      quantity:      null, unitCost: null, sellingPrice: null,
      batchNumber:   '', expiryDate: null, shelfLocation: '',
    };

    for (const [rawHeader, canonical] of Object.entries(headerMap)) {
      const rawValue = row[rawHeader];
      normalized[canonical] = _cleanValue(canonical, rawValue);
    }

    return normalized;
  });
}

// ================================================================
// VALUE CLEANERS
// ================================================================

function _cleanValue(field, value) {
  if (value == null) return _emptyFor(field);
  const str = String(value).trim();
  if (str === '') return _emptyFor(field);

  switch (field) {
    case 'quantity':     return _toNumber(str);
    case 'unitCost':
    case 'sellingPrice': return _toCurrencyNumber(str);
    case 'expiryDate':   return _toDateEpoch(str);
    default:              return str;
  }
}

function _emptyFor(field) {
  if (['quantity', 'unitCost', 'sellingPrice', 'expiryDate'].includes(field)) return null;
  return '';
}

function _toNumber(str) {
  const cleaned = str.replace(/,/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function _toCurrencyNumber(str) {
  // Strip currency symbols (₦, $, £, €) and thousands separators
  const cleaned = str.replace(/[₦$£€,]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function _toDateEpoch(str) {
  // Try native Date parsing first (handles ISO and most common formats)
  const direct = new Date(str);
  if (!isNaN(direct.getTime())) return direct.getTime();

  // Try DD/MM/YYYY and MM/DD/YYYY ambiguity — prefer DD/MM/YYYY (Nigeria locale)
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    let [, d, m, y] = dmyMatch;
    if (y.length === 2) y = `20${y}`;
    const parsed = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    if (!isNaN(parsed.getTime())) return parsed.getTime();
  }

  return null;
}

export { HEADER_ALIASES };
