/**
 * DGLOPA PLATFORM — ERROR HANDLER
 * Catches and displays all unhandled errors.
 * Application must never crash silently.
 */

import { toast } from '../components/toast.js';

export function initErrorHandler() {
  // Unhandled JS errors
  window.addEventListener('error', (event) => {
    console.error('[ERROR]', event.error || event.message);
    toast('An unexpected error occurred. Please try again.', 'error');
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || String(event.reason) || 'Unknown error';
    console.error('[UNHANDLED REJECTION]', event.reason);

    // Suppress noisy but harmless SW fetch errors in dev
    if (msg.includes('NetworkError') || msg.includes('Failed to fetch')) return;

    toast(`Error: ${msg}`, 'error');
    event.preventDefault();
  });

  console.info('[ErrorHandler] Global error handler active');
}
