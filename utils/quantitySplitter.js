/**
 * DGLOPA PLATFORM — QUANTITY SPLITTER
 * DT-003B: Splits a mixed "28pkts" / "400 Tabs" / "0.7 pkt" field into
 * { quantity: number, unitHint: string } for use during commit.
 *
 * This addresses the DT-003AA audit finding that ~40% of shelf-sheet Qty
 * values embed a unit suffix as free text alongside the numeric quantity.
 *
 * CANONICAL UNIT MAP: normalizes the 28+ observed variants into the
 * platform's lookup-table unit names (must match db.Units seeds).
 */

const UNIT_MAP = {
  // Tablet/Capsule forms
  'tab': 'Tablet',  'tabs': 'Tablet',  'tablet': 'Tablet',  'tablets': 'Tablet',
  'cap': 'Capsule', 'caps': 'Capsule', 'capsule': 'Capsule', 'capsules': 'Capsule',

  // Counting units
  'cd': 'Piece',   'cds': 'Piece',   'card': 'Piece',   'cards': 'Piece',
  'pc': 'Piece',   'pcs': 'Piece',   'piece': 'Piece',  'pieces': 'Piece',
  'unit': 'Piece', 'units': 'Piece',

  // Packets / sachets
  'pkt': 'Sachet',    'pkts': 'Sachet',    'pk': 'Sachet',      'pks': 'Sachet',
  'sachet': 'Sachet', 'sachets': 'Sachet',

  // Bottles / vials / ampoules
  'bottle': 'Bottle',   'bottles': 'Bottle', 'btl': 'Bottle', 'btls': 'Bottle',
  'vial': 'Vial',       'vials': 'Vial',
  'amp': 'Ampoule',     'amps': 'Ampoule',   'ampoule': 'Ampoule', 'ampoules': 'Ampoule',

  // Boxes / packs / strips / tubes
  'box': 'Pack',   'boxes': 'Pack',  'bxs': 'Pack',
  'pack': 'Pack',  'packs': 'Pack',
  'strip': 'Strip', 'strips': 'Strip', 'strip/1 cd': 'Strip',
  'tube': 'Tube',  'tubes': 'Tube',
  'roll': 'Piece',

  // Volume / weight
  'ml': 'ml',   'mls': 'ml',   'ml drops': 'ml',
  'g': 'g',     'gm': 'g',

  // Misc
  'test': 'Piece', 'tests': 'Piece',
  'jar': 'Bottle', 'jars': 'Bottle',
  'needle': 'Piece', 'needles': 'Piece',
};

/**
 * Split a raw quantity value (which may be a number, numeric string,
 * or text like "28pkts") into a numeric quantity and an optional unit hint.
 *
 * @param {*}      raw        — value from the Qty / Counted Qty column
 * @returns {{ quantity: number|null, unitHint: string|null, parseError: boolean }}
 */
export function splitQuantity(raw) {
  if (raw == null || String(raw).trim() === '') {
    return { quantity: null, unitHint: null, parseError: false };
  }

  const str = String(raw).trim();

  // Special sentinel from consignment workbook
  if (str.toLowerCase() === 'not supplied') {
    return { quantity: null, unitHint: null, parseError: false };
  }

  // Pure number (integer or float, possibly with comma thousands separator)
  const numOnly = parseFloat(str.replace(/,/g, ''));
  if (!isNaN(numOnly) && String(numOnly) === str.replace(/,/g, '').trim()) {
    return { quantity: numOnly, unitHint: null, parseError: false };
  }

  // Pattern: <number> <optional-space> <unit> e.g. "28pkts", "400 Tabs", "0.7 pkt"
  const match = str.match(/^([\d,]+(?:\.\d+)?)\s*(.+)$/);
  if (match) {
    const qty  = parseFloat(match[1].replace(/,/g, ''));
    const rawUnit = match[2].trim().toLowerCase();
    const canonical = UNIT_MAP[rawUnit] ?? null;
    if (!isNaN(qty)) {
      return { quantity: qty, unitHint: canonical, parseError: false };
    }
  }

  return { quantity: null, unitHint: null, parseError: true };
}

/**
 * Canonical unit name from a raw unit string (used when the unit column
 * is separate from the quantity column).
 * @param {string} raw
 * @returns {string|null}
 */
export function canonicalUnit(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  return UNIT_MAP[key] ?? raw; // preserve unknown units as-is rather than losing them
}
