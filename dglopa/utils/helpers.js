/**
 * DGLOPA PLATFORM — UTILITIES
 */

/**
 * Format a number as Nigerian Naira
 */
export function formatNaira(value) {
  if (value == null || isNaN(value)) return '₦—';
  return '₦' + Number(value).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a date to locale short string
 */
export function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-NG', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/**
 * Debounce function calls
 */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Generate a simple unique key (non-cryptographic)
 */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Safely parse JSON; return fallback on failure
 */
export function safeJSON(str, fallback = null) {
  try { return JSON.parse(str); }
  catch { return fallback; }
}

/**
 * Sleep for ms milliseconds (promise-based)
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Capitalize first letter
 */
export function capitalize(str = '') {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Clamp a number between min and max
 */
export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}
