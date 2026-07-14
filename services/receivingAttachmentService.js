/**
 * DGLOPA PLATFORM — RECEIVING ATTACHMENT SERVICE
 * RPA-001: Receiving Persistence Architecture — future-ready placeholder
 *
 * Manages attachments for receiving sessions and individual invoice lines.
 *
 * CURRENT STATUS: Architecture only. No upload, OCR, or UI implemented.
 *
 * FUTURE CAPABILITIES (not yet implemented):
 *   - OCR invoice capture (GPT-4V via OpenRouter)
 *   - Supplier invoice photo storage
 *   - Delivery note attachment
 *   - Supplier dispute documentation
 *   - Regulatory compliance records
 *
 * TABLE SCHEMA (ReceivingAttachments, DB v10):
 *   &id              — ATT-NNNNNN primary key
 *   sessionId        — FK to ReceivingSessions
 *   lineId           — FK to ReceivingLines (null = session-level attachment)
 *   attachmentType   — 'invoice' | 'delivery_note' | 'product_label' | 'other'
 *   mimeType         — 'image/jpeg' | 'image/png' | 'application/pdf' | etc.
 *   data             — base64-encoded file content (stored inline — no server)
 *   fileName         — original file name
 *   fileSize         — bytes
 *   ocrText          — extracted text from OCR (null until processed)
 *   ocrStatus        — 'pending' | 'processing' | 'complete' | 'failed' | null
 *   notes            — pharmacist notes about this attachment
 *   createdAt        — epoch ms
 */

import { db }     from '../db/database.js';
import { nextId } from '../utils/idGenerator.js';

export const ATTACHMENT_TYPE = Object.freeze({
  INVOICE:       'invoice',
  DELIVERY_NOTE: 'delivery_note',
  PRODUCT_LABEL: 'product_label',
  OTHER:         'other',
});

export const OCR_STATUS = Object.freeze({
  PENDING:    'pending',
  PROCESSING: 'processing',
  COMPLETE:   'complete',
  FAILED:     'failed',
});

// ================================================================
// READ
// ================================================================

/**
 * Get all attachments for a session.
 */
export async function getAttachmentsForSession(sessionId) {
  return db.ReceivingAttachments
    .where('sessionId').equals(sessionId)
    .toArray();
}

/**
 * Get attachments for a specific line.
 */
export async function getAttachmentsForLine(lineId) {
  return db.ReceivingAttachments
    .where('lineId').equals(lineId)
    .toArray();
}

// ================================================================
// WRITE
// ================================================================

/**
 * Add an attachment to a session or line.
 * Future: will accept a File object and encode it.
 * Currently a clean stub — no data accepted yet.
 *
 * @param {string}      sessionId
 * @param {string|null} lineId        — null for session-level attachment
 * @param {object}      attachmentData
 * @returns {Promise<string>} ATT-NNNNNN id
 */
export async function addAttachment(sessionId, lineId, attachmentData) {
  const id  = await nextId('ReceivingAttachment');
  const now = Date.now();

  await db.ReceivingAttachments.add({
    id,
    sessionId,
    lineId:         lineId || null,
    attachmentType: attachmentData.attachmentType || ATTACHMENT_TYPE.OTHER,
    mimeType:       attachmentData.mimeType       || null,
    data:           attachmentData.data           || null,
    fileName:       attachmentData.fileName       || null,
    fileSize:       attachmentData.fileSize       || null,
    ocrText:        null,
    ocrStatus:      null,
    notes:          attachmentData.notes?.trim()  || '',
    createdAt:      now,
  });

  return id;
}

/**
 * Update OCR results for an attachment.
 * Called by the future OCR pipeline.
 */
export async function updateOCRResult(id, { ocrText, ocrStatus }) {
  await db.ReceivingAttachments.update(id, {
    ocrText:   ocrText   || null,
    ocrStatus: ocrStatus || OCR_STATUS.COMPLETE,
  });
}

/**
 * Remove a specific attachment by ID.
 * Attachments (unlike lines) may be physically deleted — they are
 * supplementary evidence, not primary financial records.
 */
export async function removeAttachment(id) {
  await db.ReceivingAttachments.delete(id);
}

/**
 * Count attachments for a session (fast — for UI badge display).
 */
export async function countAttachments(sessionId) {
  return db.ReceivingAttachments.where('sessionId').equals(sessionId).count();
}
