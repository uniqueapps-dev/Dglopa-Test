/**
 * DGLOPA PLATFORM — RECEIVE SCREEN (Intelligent Migration Engine)
 * DT-003A: File picker -> pipeline -> Import Preview
 * DT-003B: -> Confirmation Screen -> Commit -> Import Summary
 *
 * Flow:
 *   Upload Zone
 *     |
 *     v
 *   Import Preview  (read-only, zero writes)
 *     |
 *     v [user taps "Commit Import"]
 *   Confirmation Screen  (collect options, explicit checkbox)
 *     |
 *     v [user checks box and taps "Commit Import"]
 *   Commit Engine  (single atomic transaction, rollback on error)
 *     |
 *     v
 *   Import Summary  (result + ImportAudit ID)
 */

import { runImportPipeline }                     from '../../services/migration/pipelineOrchestrator.js';
import { commitImport, CommitError }              from '../../services/migration/commitEngine.js';
import { buildImportPreview }                     from './importPreview.js';
import { buildConfirmationScreen, buildImportSummary } from './confirmationScreen.js';
import { toast }                                  from '../../components/toast.js';
import { LoadingOverlay }                         from '../../components/loadingOverlay.js';

const ACCEPTED = '.xlsx,.xls,.csv';

export function initMigrationScreen() {
  const container = document.getElementById('screen-receive');
  if (!container) return;
  _renderUploadState(container);
}

// ================================================================
// STAGE 1 — UPLOAD
// ================================================================

function _renderUploadState(container) {
  container.innerHTML = `
    <div class="section-title">Receive Stock</div>
    <div class="section-subtitle">Upload a workbook to begin — nothing is saved until you confirm.</div>

    <div class="ime-upload-zone" id="ime-upload-zone">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <div class="ime-upload-title">Tap to choose a file</div>
      <div class="ime-upload-sub">Excel (.xlsx), CSV (.csv), or Google Sheets export</div>
    </div>

    <input type="file" id="ime-file-input" accept="${ACCEPTED}" style="display:none">

    <div class="ime-format-note text-muted text-xs" style="margin-top:var(--sp-4)">
      PDF, AI image extraction, camera capture, and clipboard paste are planned for a future release.
    </div>
  `;

  const zone  = container.querySelector('#ime-upload-zone');
  const input = container.querySelector('#ime-file-input');

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await _handleFile(container, file);
    input.value = '';
  });
}

async function _handleFile(container, file) {
  LoadingOverlay.show('Reading file…');
  try {
    const result = await runImportPipeline(file, (stage) => {
      LoadingOverlay.setStatus(stage);
    });
    LoadingOverlay.hide();
    _renderPreviewState(container, result);
    if (result.preview.errors > 0) {
      toast(`Preview ready — ${result.preview.errors} error(s) found.`, 'warning');
    } else {
      toast('Preview ready.', 'success');
    }
  } catch (err) {
    LoadingOverlay.hide();
    console.error('[IME] Pipeline error:', err);
    toast(err.message, 'error');
  }
}

// ================================================================
// STAGE 2 — PREVIEW
// ================================================================

function _renderPreviewState(container, result) {
  container.innerHTML = `
    <div class="d-flex justify-between align-center mb-4">
      <div class="section-title" style="margin-bottom:0">Receive Stock</div>
      <button class="btn btn-secondary btn-sm" id="ime-new-upload-btn">New Upload</button>
    </div>
    ${buildImportPreview(result)}
    <div style="padding-top:var(--sp-4);padding-bottom:var(--sp-4)">
      <button class="btn btn-primary btn-full" id="ime-to-confirm-btn">
        Review &amp; Commit Import →
      </button>
    </div>
  `;

  container.querySelector('#ime-new-upload-btn').addEventListener('click', () => {
    _renderUploadState(container);
  });

  container.querySelector('#ime-to-confirm-btn').addEventListener('click', () => {
    _renderConfirmState(container, result);
  });
}

// ================================================================
// STAGE 3 — CONFIRMATION
// ================================================================

function _renderConfirmState(container, result) {
  container.innerHTML = buildConfirmationScreen(result.preview, {
    workbookName:      result.sourceFile.name,
    batchWorkbookType: 'General Inventory',
    batchSupplierName: '',
  });

  const commitBtn = container.querySelector('#ime-commit-btn');
  const cb        = container.querySelector('#ime-confirm-cb');

  // Enable commit only when checkbox is ticked
  cb.addEventListener('change', () => {
    commitBtn.disabled = !cb.checked;
  });

  container.querySelector('#ime-back-btn').addEventListener('click', () => {
    _renderPreviewState(container, result);
  });

  commitBtn.addEventListener('click', async () => {
    if (!cb.checked) return;

    const batchSupplierName   = container.querySelector('#ime-supplier-name').value.trim();
    const batchWorkbookType   = container.querySelector('#ime-workbook-type').value;
    const notes               = container.querySelector('#ime-import-notes').value.trim();

    await _handleCommit(container, result, { batchSupplierName, batchWorkbookType, notes });
  });
}

// ================================================================
// STAGE 4 — COMMIT
// ================================================================

async function _handleCommit(container, result, options) {
  LoadingOverlay.show('Committing import…');

  try {
    const commitResult = await commitImport(
      result,
      options,
      (stage, current, total) => {
        const label = total > 0 ? `${stage} (${current}/${total})` : stage;
        LoadingOverlay.setStatus(label);
      }
    );

    LoadingOverlay.hide();
    _renderSummaryState(container, commitResult, result.sourceFile.name);

    toast(
      `Import complete — ${commitResult.rowsImported} row${commitResult.rowsImported !== 1 ? 's' : ''} committed.`,
      'success'
    );

  } catch (err) {
    LoadingOverlay.hide();
    console.error('[IME] Commit error:', err);

    if (err instanceof CommitError) {
      // Rollback already happened inside Dexie; show user-friendly message
      toast('Import failed — database rolled back. No changes were saved.', 'error');
      _renderErrorState(container, err.message, result);
    } else {
      toast(err.message, 'error');
    }
  }
}

// ================================================================
// STAGE 5 — SUMMARY
// ================================================================

function _renderSummaryState(container, commitResult, workbookName) {
  container.innerHTML = buildImportSummary(commitResult, workbookName);

  container.querySelector('#ime-done-btn').addEventListener('click', () => {
    _renderUploadState(container);
  });
}

// ================================================================
// ERROR STATE (rollback occurred)
// ================================================================

function _renderErrorState(container, message, result) {
  container.innerHTML = `
    <div class="section-title">Import Failed</div>
    <div class="ime-readiness-banner blocked" style="margin-top:var(--sp-4)">
      The database was automatically rolled back. No changes were saved.
    </div>
    <div class="card" style="margin-top:var(--sp-4);border-color:var(--clr-red)">
      <div class="card-title text-red">Error Detail</div>
      <div class="text-sm" style="margin-top:var(--sp-2);color:var(--clr-text-2)">${_e(message)}</div>
    </div>
    <div class="form-actions" style="margin-top:var(--sp-5)">
      <button class="btn btn-secondary" id="ime-back-to-preview-btn">Back to Preview</button>
      <button class="btn btn-secondary" id="ime-start-over-btn">Start Over</button>
    </div>
  `;

  container.querySelector('#ime-back-to-preview-btn').addEventListener('click', () => {
    _renderPreviewState(container, result);
  });
  container.querySelector('#ime-start-over-btn').addEventListener('click', () => {
    _renderUploadState(container);
  });
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
