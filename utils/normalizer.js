/**
 * DGLOPA PLATFORM — PRODUCT NORMALIZER
 * Normalizes product names for duplicate detection.
 * Strips punctuation, whitespace, casing differences.
 * Used to populate Products.normalizedName.
 */

/**
 * Normalize a product name for deduplication comparison.
 * @param {string} name
 * @returns {string} normalized form
 */
export function normalizeName(name = '') {
  return name
    .toLowerCase()
    .trim()
    // collapse whitespace
    .replace(/\s+/g, ' ')
    // remove common punctuation that users vary
    .replace(/[.\-_/\\()'",]/g, '')
    // common abbreviation expansions — extend as needed
    .replace(/\btabs?\b/g,  'tablet')
    .replace(/\bcaps?\b/g,  'capsule')
    .replace(/\binj\b/g,    'injection')
    .replace(/\bsusp?\b/g,  'suspension')
    .replace(/\bsoln?\b/g,  'solution')
    .replace(/\bcrm\b/g,    'cream')
    .replace(/\boint\b/g,   'ointment')
    .replace(/\bmg\b/g,     'mg')
    .replace(/\bml\b/g,     'ml')
    // collapse again after replacements
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a composite dedup key from name + strength + form.
 * More precise than name alone.
 */
export function buildDedupKey(productName = '', strength = '', dosageForm = '') {
  return normalizeName(`${productName} ${strength} ${dosageForm}`);
}
