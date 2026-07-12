/**
 * DGLOPA PLATFORM — IME — SPREADSHEET ADAPTER
 * Handles .xlsx, .csv, .xls — covers Excel, CSV, and Google Sheets exports
 * (Google Sheets exports as .xlsx or .csv, so no separate code path is needed).
 *
 * Uses SheetJS (xlsx) loaded from CDN. This is the only third-party dependency
 * in the IME — vanilla JS cannot parse the .xlsx binary/zip format natively,
 * and SheetJS is the de facto standard for this exact task.
 */

import * as XLSX from 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm';

const ACCEPTED_EXTENSIONS = ['xlsx', 'xls', 'csv'];

function _readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse a spreadsheet file (xlsx/xls/csv) into a RawSheet.
 * Always reads the first sheet — multi-sheet support is a future enhancement.
 *
 * @param {File} file
 * @returns {Promise<RawSheet>}
 */
async function parse(file) {
  const buffer   = await _readFileAsArrayBuffer(file);
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('No sheets found in workbook.');

  const sheet = workbook.Sheets[sheetName];

  // Get raw 2D array first to extract headers reliably (handles blank cells)
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

  if (grid.length === 0) {
    return { sourceFormat: _formatFromName(file.name), sheetName, headers: [], rows: [], rowCount: 0 };
  }

  // --- Offset-header detection (VL-003 fix) ---
  // Some sheets have a banner row before the real header (e.g. SHELF_07 has
  // "SHELF_07" in cell A1 with 4 blank cells, then the real header on row 2).
  // Detect by checking if row 0 has only 1 non-empty cell while row 1 has 3+.
  let headerRowIdx = 0;
  const row0NonEmpty = grid[0].filter((c) => String(c ?? '').trim() !== '').length;
  const row1NonEmpty = grid.length > 1 ? grid[1].filter((c) => String(c ?? '').trim() !== '').length : 0;
  if (row0NonEmpty === 1 && row1NonEmpty >= 3) {
    headerRowIdx = 1;
    console.info('[SpreadsheetAdapter] Offset header detected — using row 2 as header.');
  }

  const headers  = grid[headerRowIdx].map((h) => String(h ?? '').trim());
  const dataRows = grid.slice(headerRowIdx + 1);

  const rows = dataRows
    .filter((r) => r.some((cell) => String(cell ?? '').trim() !== ''))
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h || `Column${i + 1}`] = r[i] !== undefined ? String(r[i]).trim() : '';
      });
      return obj;
    });

  return {
    sourceFormat: _formatFromName(file.name),
    sheetName,
    headers,
    rows,
    rowCount: rows.length,
  };
}

function _formatFromName(name = '') {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (ext === 'csv') return 'csv';
  if (ext === 'xls') return 'xls';
  return 'xlsx';
}

export const spreadsheetAdapter = {
  id:      'spreadsheet',
  label:   'Spreadsheet (Excel / CSV / Google Sheets export)',
  accepts: ACCEPTED_EXTENSIONS,
  detect(file) {
    const ext = (file.name || '').split('.').pop()?.toLowerCase();
    return ACCEPTED_EXTENSIONS.includes(ext);
  },
  parse,
};
