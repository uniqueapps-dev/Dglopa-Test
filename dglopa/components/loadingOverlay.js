/**
 * DGLOPA PLATFORM — LOADING OVERLAY
 */

export const LoadingOverlay = {
  show(statusText = 'Loading…') {
    const overlay = document.getElementById('loading-overlay');
    const status  = document.getElementById('loading-status');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    if (status) status.textContent = statusText;
  },

  hide() {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
  },

  setStatus(text) {
    const status = document.getElementById('loading-status');
    if (status) status.textContent = text;
  },
};
