/**
 * DGLOPA PLATFORM — TOAST COMPONENT
 * Usage: toast('Message', 'success' | 'error' | 'warning' | 'info')
 */

const DURATION = 3200;

export function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<span class="toast-dot"></span><span>${_escape(message)}</span>`;

  container.appendChild(el);

  const timer = setTimeout(() => _dismiss(el), DURATION);

  el.addEventListener('click', () => {
    clearTimeout(timer);
    _dismiss(el);
  });
}

function _dismiss(el) {
  el.classList.add('exiting');
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

function _escape(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
