/**
 * DGLOPA PLATFORM — IME — PIPELINE ORCHESTRATOR
 * DT-003A: Runs the full import pipeline up to Import Preview.
 *
 *   Read Spreadsheet -> Parse -> Normalize -> Validate ->
 *   Duplicate Detection -> Product Matching -> Supplier Matching ->
 *   Review Queue -> Import Preview -> STOP
 *
 * GUARANTEE: This module performs zero writes to db.* tables.
 * Every db access here is read-only (matching engine queries).
 * No .add/.put/.update/.delete calls anywhere in this file or any
 * module it imports for the pipeline itself.
 */

import { resolveAdapter, registerAdapter, getAllAdapters } from './adapterRegistry.js';
import { spreadsheetAdapter } from './adapters/spreadsheetAdapter.js';
import { pdfAdapter, aiImageAdapter, cameraCaptureAdapter, clipboardPasteAdapter } from './adapters/futureFormatStubs.js';
import { normalizeRows } from './normalizer.js';
import { validateRows } from './validationEngine.js';
import { matchProducts, matchSuppliers } from './matchingEngine.js';
import { buildReviewQueue, summarizeQueue } from './reviewQueueBuilder.js';

let _registered = false;
function _ensureAdaptersRegistered() {
  if (_registered) return;
  registerAdapter(spreadsheetAdapter);
  registerAdapter(pdfAdapter);
  registerAdapter(aiImageAdapter);
  registerAdapter(cameraCaptureAdapter);
  registerAdapter(clipboardPasteAdapter);
  _registered = true;
}

/**
 * Run the full pipeline against a File object.
 * Performs zero database writes — read-only matching only.
 *
 * @param {File} file
 * @param {function} [onProgress] — optional callback(stageName: string)
 * @returns {Promise<PipelineResult>}
 */
export async function runImportPipeline(file, onProgress = () => {}) {
  _ensureAdaptersRegistered();

  if (!file) throw new Error('[IME] No file provided.');

  onProgress('Reading spreadsheet…');
  const adapter = resolveAdapter(file);
  if (!adapter) {
    const supported = getAllAdapters().filter((a) => a.accepts.length).map((a) => a.accepts.join(', ')).join(', ');
    throw new Error(`No adapter found for file "${file.name}". Supported formats: ${supported}`);
  }

  let rawSheet;
  try {
    rawSheet = await adapter.parse(file);
  } catch (err) {
    throw new Error(`Failed to parse "${file.name}": ${err.message}`);
  }

  if (rawSheet.rowCount === 0) {
    throw new Error(`"${file.name}" contains no data rows. Check the file and try again.`);
  }

  onProgress('Normalizing data…');
  const normalizedRows = normalizeRows(rawSheet);

  onProgress('Validating rows…');
  const validationIssues = validateRows(normalizedRows);

  onProgress('Matching products…');
  const productMatches = await matchProducts(normalizedRows);

  onProgress('Matching suppliers…');
  const supplierMatches = await matchSuppliers(normalizedRows);

  onProgress('Building review queue…');
  const reviewQueue = buildReviewQueue(validationIssues);

  onProgress('Preparing preview…');
  const preview = _buildPreviewSummary({ rawSheet, normalizedRows, productMatches, supplierMatches, reviewQueue });

  onProgress('Done.');

  return {
    sourceFile: { name: file.name, size: file.size, type: file.type },
    rawSheet,
    normalizedRows,
    validationIssues,
    productMatches,
    supplierMatches,
    reviewQueue,
    preview,
  };
}

// ================================================================
// PREVIEW SUMMARY
// ================================================================

function _buildPreviewSummary({ rawSheet, normalizedRows, productMatches, supplierMatches, reviewQueue }) {
  const productsMatched = productMatches.filter((m) => m.matched).length;
  const newProducts     = productMatches.filter((m) => !m.matched).length;

  const suppliersMatched = supplierMatches.filter((m) => m.matched).length;
  const newSuppliers     = supplierMatches.filter((m) => !m.matched && m.supplierName !== null).length;

  // Rows with a parseable quantity > 0 — these would become inventory lots if imported
  const inventoryLotsDetected = normalizedRows.filter((r) => r.quantity != null && r.quantity > 0).length;

  const queueSummary = summarizeQueue(reviewQueue);

  return {
    totalRows:        normalizedRows.length,
    sourceFormat:      rawSheet.sourceFormat,
    sheetName:         rawSheet.sheetName,
    productsMatched,
    newProducts,
    suppliersMatched,
    newSuppliers,
    inventoryLotsDetected,
    warnings:          queueSummary.warningCount,
    errors:            queueSummary.errorCount,
    issuesByCategory:  queueSummary.byCategory,
    readyToImport:     queueSummary.errorCount === 0,
  };
}

export { getAllAdapters };
