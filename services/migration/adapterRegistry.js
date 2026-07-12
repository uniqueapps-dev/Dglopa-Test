/**
 * DGLOPA PLATFORM — INTELLIGENT MIGRATION ENGINE (IME)
 * Source Adapter Registry
 *
 * Every input format (spreadsheet, PDF, image, camera, clipboard) implements
 * the same interface so the pipeline never needs to know what kind of file
 * it's looking at:
 *
 *   {
 *     id:        string                — unique adapter id
 *     label:     string                — human-readable name
 *     accepts:   string[]              — file extensions this adapter handles
 *     detect(file): boolean            — quick capability check
 *     parse(file): Promise<RawSheet>   — extracts raw rows
 *   }
 *
 * RawSheet shape:
 *   {
 *     sourceFormat: string,        // 'xlsx' | 'csv' | 'gsheet' | future: 'pdf' | 'image' | 'camera' | 'clipboard'
 *     sheetName:    string|null,
 *     headers:      string[],      // raw header row as found in the file
 *     rows:         Array<object>, // one object per row, keyed by raw header text
 *     rowCount:     number,
 *   }
 *
 * Only Spreadsheet adapters (xlsx/csv/gsheet-export) are implemented in DT-003A.
 * PDF / AI Image / Camera / Clipboard are registered as stubs that throw a
 * clear "not yet supported" error — this proves the architecture accommodates
 * them without requiring speculative code now.
 */

const _adapters = new Map();

/**
 * Register a source adapter.
 * @param {object} adapter — see shape above
 */
export function registerAdapter(adapter) {
  if (!adapter?.id) throw new Error('[IME] Adapter must have an id.');
  _adapters.set(adapter.id, adapter);
}

/**
 * Find the best adapter for a given File object.
 * Tries detect() on each registered adapter; falls back to extension match.
 * @param {File} file
 * @returns {object|null} adapter or null if none match
 */
export function resolveAdapter(file) {
  const name = file.name || '';
  const ext  = name.includes('.') ? name.split('.').pop().toLowerCase() : '';

  for (const adapter of _adapters.values()) {
    try {
      if (adapter.detect && adapter.detect(file)) return adapter;
    } catch (_) { /* detect() failures fall through to extension match */ }
  }

  for (const adapter of _adapters.values()) {
    if (adapter.accepts?.includes(ext)) return adapter;
  }

  return null;
}

export function getAllAdapters() {
  return Array.from(_adapters.values());
}

export function getAdapter(id) {
  return _adapters.get(id) ?? null;
}
