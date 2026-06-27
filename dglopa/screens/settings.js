/**
 * DGLOPA PLATFORM — SETTINGS SCREEN
 */

import { getDBVersion } from '../db/database.js';
import { toast } from '../components/toast.js';

const APP_VERSION = '1.0.0';

export async function renderSettings(container) {
  let dbVersion = '—';
  try {
    dbVersion = String(await getDBVersion());
  } catch (_) {}

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
      <div class="settings-item" id="btn-export-db">
        <span class="settings-item-label">Export Database</span>
        <svg class="settings-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
      <div class="settings-item" id="btn-import-db">
        <span class="settings-item-label">Import Database</span>
        <svg class="settings-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    </div>
  `;

  container.querySelector('#btn-export-db').addEventListener('click', () => {
    toast('Export — coming in a future update', 'warning');
  });

  container.querySelector('#btn-import-db').addEventListener('click', () => {
    toast('Import — coming in a future update', 'warning');
  });
}
