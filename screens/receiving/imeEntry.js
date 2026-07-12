/**
 * DGLOPA PLATFORM — IME ENTRY (within Receiving module)
 * DT-004: Wraps the existing IME migrationScreen within the Receiving
 * module so it is accessible from the Receiving Dashboard.
 * The IME itself is unchanged.
 */

import { initMigrationScreen } from '../migration/migrationScreen.js';

export function renderIMEEntry(container, onBack) {
  // The migration screen already manages its own state fully.
  // It owns the container — just initialise it.
  // We inject a "Back to Receiving" button on top.
  container.innerHTML = `
    <div class="d-flex justify-between align-center mb-4">
      <div class="section-title" style="margin-bottom:0">Import Spreadsheet</div>
      <button class="btn btn-secondary btn-sm" id="ime-entry-back">← Back</button>
    </div>
    <div id="ime-inner-container"></div>
  `;
  container.querySelector('#ime-entry-back').addEventListener('click', onBack);

  // Redirect initMigrationScreen to the inner container
  const innerContainer = container.querySelector('#ime-inner-container');
  innerContainer.id = 'screen-receive'; // migrationScreen looks for this id
  initMigrationScreen();
  innerContainer.id = 'ime-inner-container'; // restore
}
