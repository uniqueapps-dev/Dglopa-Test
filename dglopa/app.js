/**
 * DGLOPA PLATFORM — APP BOOTSTRAP
 * Entry point. Wires all modules together.
 */

import { openDB }             from './db/database.js';
import { initErrorHandler }   from './services/errorHandler.js';
import { LoadingOverlay }     from './components/loadingOverlay.js';
import { toast }              from './components/toast.js';
import { navigate, registerScreen, registerNavItem, initRouter } from './js/router.js';
import { renderHome }         from './screens/home.js';
import { renderSettings }     from './screens/settings.js';
import { renderPlaceholder }  from './screens/placeholder.js';

// ---- Boot sequence ----
async function boot() {
  // 1. Error handler first — catches everything below
  initErrorHandler();

  // 2. Show loading overlay
  LoadingOverlay.show('Starting Dglopa…');

  try {
    // 3. Open database
    LoadingOverlay.setStatus('Opening database…');
    await openDB();

    // 4. Render static screens
    LoadingOverlay.setStatus('Building interface…');
    await buildUI();

    // 5. Register service worker
    registerSW();

    // 6. Hide overlay and initialize router
    LoadingOverlay.hide();
    initRouter('home');

  } catch (err) {
    console.error('[Boot] Fatal error:', err);
    LoadingOverlay.setStatus('Failed to start. Please refresh.');
    toast('Failed to start application. Please refresh.', 'error');
  }
}

// ---- Build UI ----
async function buildUI() {
  // Render home screen (sync)
  const homeEl = document.getElementById('screen-home');
  if (homeEl) homeEl.innerHTML = renderHome();

  // Render placeholder screens (sync)
  ['receive', 'sales', 'inventory', 'demand', 'suppliers', 'more'].forEach((id) => {
    const el = document.getElementById(`screen-${id}`);
    if (el) el.innerHTML = renderPlaceholder(id);
  });

  // Register screens with router
  registerScreen('home');
  registerScreen('receive');
  registerScreen('sales');
  registerScreen('inventory');
  registerScreen('demand');
  registerScreen('suppliers');
  registerScreen('more');

  // Settings screen has async content
  const settingsEl = document.getElementById('screen-settings');
  if (settingsEl) {
    registerScreen('settings');
    await renderSettings(settingsEl);
  }

  // Wire bottom nav items
  document.querySelectorAll('[data-nav-id]').forEach((el) => {
    const id = el.dataset.navId;
    registerNavItem(id, el);
    el.addEventListener('click', () => navigate(id));
  });

  // Wire command center cards to nav
  document.querySelectorAll('[data-nav]').forEach((el) => {
    const id = el.dataset.nav;
    el.addEventListener('click', () => navigate(id));
  });

  // More > Settings link
  document.getElementById('goto-settings')?.addEventListener('click', () => navigate('settings'));

  // Header settings button
  document.getElementById('header-settings-btn')?.addEventListener('click', () => navigate('settings'));
}

// ---- Service Worker ----
function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then((reg) => {
      console.info('[SW] Registered:', reg.scope);

      // Prompt user if new SW waiting
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.statechange === 'installed' && navigator.serviceWorker.controller) {
            toast('Update available — close and reopen the app to apply.', 'info');
          }
        });
      });
    })
    .catch((err) => {
      console.warn('[SW] Registration failed:', err);
    });
}

// ---- Start ----
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
