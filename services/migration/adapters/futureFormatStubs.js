/**
 * DGLOPA PLATFORM — IME — FUTURE FORMAT STUBS
 * DT-003A: Registered but not implemented. Proves the SourceAdapter
 * architecture accommodates future formats without pipeline changes.
 * Each throws a clear, user-facing "not yet supported" error if invoked.
 */

function _notYetSupported(label) {
  return async () => {
    throw new Error(`${label} import is not yet supported. This is planned for a future release.`);
  };
}

export const pdfAdapter = {
  id:      'pdf',
  label:   'PDF Document',
  accepts: ['pdf'],
  detect(file) {
    return (file.name || '').toLowerCase().endsWith('.pdf');
  },
  parse: _notYetSupported('PDF'),
};

export const aiImageAdapter = {
  id:      'ai-image',
  label:   'AI Image Extraction',
  accepts: ['png', 'jpg', 'jpeg', 'webp'],
  detect(file) {
    return /\.(png|jpe?g|webp)$/i.test(file.name || '');
  },
  parse: _notYetSupported('AI Image Extraction'),
};

export const cameraCaptureAdapter = {
  id:      'camera-capture',
  label:   'Camera Capture',
  accepts: [],
  detect() { return false; },
  parse: _notYetSupported('Camera Capture'),
};

export const clipboardPasteAdapter = {
  id:      'clipboard-paste',
  label:   'Clipboard Paste',
  accepts: [],
  detect() { return false; },
  parse: _notYetSupported('Clipboard Paste'),
};
