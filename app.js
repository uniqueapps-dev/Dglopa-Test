/**
 * DGLOPA PLATFORM — APP BOOTSTRAP
 * Entry point. Wires all modules together.
 * DT-002: Products screen wired with onEnter lifecycle.
 */

import { openDB }             from './db/database.js';
import { initErrorHandler }   from './services/errorHandler.js';
import { LoadingOverlay }     from './components/loadingOverlay.js';
import { toast }              from './components/toast.js';
import { navigate, registerScreen, registerNavItem, initRouter } from './js/router.js';
import { renderHome }         from './screens/home.js';
import { renderSettings }     from './screens/settings.js';
import { renderPlaceholder }  from './screens/placeholder.js';
import { initProductsScreen } from './screens/products/productsScreen.js';

// ---- Boot sequence ----
async function boot() {
  initErrorHandler();
  LoadingOverlay.show('Starting Dglopa…');

  try {
    LoadingOverlay.setStatus('Opening database…');
    await openDB();

    LoadingOverlay.setStatus('Building interface…');
    await buildUI();

    registerSW();

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
  // Home
  const homeEl = document.getElementById('screen-home');
  if (homeEl) homeEl.innerHTML = renderHome();

  // Placeholder screens (not yet built)
  ['receive', 'sales', 'demand', 'suppliers', 'more'].forEach((id) => {
    const el = document.getElementById(`screen-${id}`);
    if (el) el.innerHTML = renderPlaceholder(id);
  });

  // Register all screens
  registerScreen('home');
  registerScreen('receive');
  registerScreen('sales');
  registerScreen('demand');
  registerScreen('suppliers');
  registerScreen('more');

  // Inventory → Product Master (DT-002)
  registerScreen('inventory', initProductsScreen);

  // Settings
  const settingsEl = document.getElementById('screen-settings');
  if (settingsEl) {
    registerScreen('settings');
    await renderSettings(settingsEl);
  }

  // Bottom nav items
  document.querySelectorAll('[data-nav-id]').forEach((el) => {
    const id = el.dataset.navId;
    registerNavItem(id, el);
    el.addEventListener('click', () => navigate(id));
  });

  // Command center cards
  document.querySelectorAll('[data-nav]').forEach((el) => {
    const id = el.dataset.nav;
    el.addEventListener('click', () => navigate(id));
  });

  // Settings links
  document.getElementById('goto-settings')?.addEventListener('click', () => navigate('settings'));
  document.getElementById('header-settings-btn')?.addEventListener('click', () => navigate('settings'));
}

// ---- Service Worker ----
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then((reg) => {
      console.info('[SW] Registered:', reg.scope);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Update available — close and reopen to apply.', 'info');
          }
        });
      });
    })
    .catch((err) => console.warn('[SW] Registration failed:', err));
}

// ---- Start ----
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
