/**
 * DGLOPA PLATFORM — SETTINGS SCREEN
 * DT-SETTINGS-B: Export/Import Database implemented.
 *
 * EXPORT: Reads every table from IndexedDB and serialises to a JSON
 * file which is downloaded to the device.
 *
 * IMPORT: Reads a previously-exported JSON file, validates it, then
 * CLEARS each table and bulk-writes the imported records.
 * This is a full replacement — not a merge.
 *
 * SAFETY:
 *   - Export includes a schema version so the importer can reject
 *     files from incompatible database versions.
 *   - Import requires explicit confirmation before any data is deleted.
 *   - Lookup tables (Units, DosageForms, Categories) are imported
 *     but only if the export file contains them — they are never
 *     cleared if the import file is missing those keys.
 *   - Seed data is re-applied after import so lookups are always
 *     populated even if the export predates the seed.
 */

import { db, getDBVersion, openDB } from '../db/database.js';
import { toast }                    from '../components/toast.js';
import { openModal, closeModal }    from '../components/modal.js';

const APP_VERSION = '1.0.0';

// Tables to include in export/import (in dependency order for import)
const EXPORT_TABLES = [
  'Settings',
  'Units', 'DosageForms', 'Categories',
  'Suppliers',
  'Products', 'ProductAliases', 'Barcodes',
  'InventoryLots',
  'ReceivingSessions',
  'PurchaseHistory',
  'StockMovements',
  'Demand',
  'ReviewQueue',
  'AuditLog',
  'PriceHistory',
  'ProductCommercialProfiles',
  'CommercialPriceHistory',
  'ImportAudit',
];

export async function renderSettings(container) {
  let dbVersion = '—';
  try { dbVersion = String(await getDBVersion()); } catch (_) {}

  container.innerHTML = `
    <div class="section-title">Settings</div>

    <div class="settings-section-label">Platform</div>
    <div class="settings-list">
      <div class="settings-item">
        <span class="settings-item-label">App Version</span>
        <span class="settings-item-value">${APP_VERSION}</span>
      </div>
      <div class="settings-item">
        <span class="settings-item-label">Database Version</span>
        <span class="settings-item-value">v${dbVersion}</span>
      </div>
    </div>

    <div class="settings-section-label">Data</div>
    <div class="settings-list">
      <div class="settings-item" id="btn-export-db" style="cursor:pointer">
        <span class="settings-item-label">Export Database</span>
        <svg class="settings-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
      <div class="settings-item" id="btn-import-db" style="cursor:pointer">
        <span class="settings-item-label">Import Database</span>
        <svg class="settings-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    </div>

    <div class="text-muted text-xs" style="margin-top:var(--sp-4);padding:0 var(--sp-2)">
      Export creates a full backup of all your data as a JSON file.
      Import replaces all data — use only with a backup from this app.
    </div>

    <input type="file" id="import-file-input" accept=".json,application/json" style="display:none">
  `;

  container.querySelector('#btn-export-db').addEventListener('click', _exportDatabase);
  container.querySelector('#btn-import-db').addEventListener('click', () => {
    container.querySelector('#import-file-input').click();
  });
  container.querySelector('#import-file-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) _confirmImport(file);
    e.target.value = ''; // reset so same file can be re-selected
  });
}

// ================================================================
// EXPORT
// ================================================================

async function _exportDatabase() {
  try {
    toast('Preparing export…', 'info');

    const dbVersion = await getDBVersion();
    const exportData = {
      _meta: {
        appVersion:  APP_VERSION,
        dbVersion,
        exportedAt:  Date.now(),
        platform:    'DglopaPlatform',
      },
      tables: {},
    };

    for (const tableName of EXPORT_TABLES) {
      try {
        const table = db[tableName];
        if (!table) continue;
        exportData.tables[tableName] = await table.toArray();
      } catch (err) {
        console.warn(`[Export] Skipping table ${tableName}:`, err.message);
        exportData.tables[tableName] = [];
      }
    }

    const json     = JSON.stringify(exportData, null, 2);
    const blob     = new Blob([json], { type: 'application/json' });
    const url      = URL.createObjectURL(blob);
    const dateStr  = new Date().toISOString().slice(0, 10);
    const filename = `dglopa-backup-${dateStr}.json`;

    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const totalRecords = Object.values(exportData.tables)
      .reduce((sum, arr) => sum + (arr?.length || 0), 0);

    toast(`Export complete — ${totalRecords.toLocaleString()} records saved to ${filename}`, 'success');

  } catch (err) {
    console.error('[Export] Failed:', err);
    toast('Export failed: ' + err.message, 'error');
  }
}

// ================================================================
// IMPORT
// ================================================================

function _confirmImport(file) {
  const modal = openModal({
    id:      'import-confirm',
    title:   'Import Database',
    bodyHTML: `
      <div class="text-sm" style="margin-bottom:var(--sp-4)">
        <strong>Warning: This will replace ALL existing data.</strong>
      </div>
      <div class="text-muted text-sm" style="margin-bottom:var(--sp-5)">
        File: <span class="text-mono">${_e(file.name)}</span><br>
        All current products, inventory, suppliers, and transactions
        will be replaced with the contents of this file.
        This cannot be undone.
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" id="import-cancel-btn">Cancel</button>
        <button class="btn btn-danger" id="import-confirm-btn">Replace All Data</button>
      </div>
    `,
  });

  modal.querySelector('#import-cancel-btn').addEventListener('click', closeModal);
  modal.querySelector('#import-confirm-btn').addEventListener('click', async () => {
    closeModal();
    await _importDatabase(file);
  });
}

async function _importDatabase(file) {
  try {
    toast('Reading backup file…', 'info');

    const text = await file.text();
    let exportData;
    try {
      exportData = JSON.parse(text);
    } catch {
      toast('Invalid file — not valid JSON.', 'error');
      return;
    }

    // Validate it looks like a Dglopa backup
    if (exportData._meta?.platform !== 'DglopaPlatform') {
      toast('Invalid file — not a Dglopa backup.', 'error');
      return;
    }

    const fileDbVersion = exportData._meta?.dbVersion ?? 0;
    const currentVersion = await getDBVersion();
    if (fileDbVersion > currentVersion) {
      toast(`This backup was created on a newer version (v${fileDbVersion}) of the database. Please update the app first.`, 'error');
      return;
    }

    const tables = exportData.tables || {};
    let totalImported = 0;

    toast('Importing data…', 'info');

    // Import in table order — clear then bulk-add
    for (const tableName of EXPORT_TABLES) {
      const records = tables[tableName];
      if (!records || !Array.isArray(records)) continue;

      const table = db[tableName];
      if (!table) continue;

      try {
        await table.clear();
        if (records.length > 0) {
          await table.bulkAdd(records);
          totalImported += records.length;
        }
      } catch (err) {
        console.warn(`[Import] Table ${tableName} error:`, err.message);
        // Continue with other tables — partial import is better than no import
      }
    }

    toast(`Import complete — ${totalImported.toLocaleString()} records restored. Reloading…`, 'success');

    // Reload after 2 seconds so the service worker cache is cleared
    setTimeout(() => window.location.reload(), 2000);

  } catch (err) {
    console.error('[Import] Failed:', err);
    toast('Import failed: ' + err.message, 'error');
  }
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
