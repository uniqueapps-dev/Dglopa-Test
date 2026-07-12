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
import { initCockpitScreen }  from './screens/cockpit/cockpitScreen.js';
import { renderSettings }     from './screens/settings.js';
import { renderPlaceholder }  from './screens/placeholder.js';
import { initProductsScreen }   from './screens/products/productsScreen.js';
import { initInventoryScreen }   from './screens/inventory/inventoryScreen.js';
import { initReceivingScreen }   from './screens/receiving/receivingDashboard.js';
import { initSuppliersScreen }   from './screens/suppliers/suppliersScreen.js';
import { initDemandScreen }        from './screens/demand/demandScreen.js';
import { renderReviewWorkspace }    from './screens/review/reviewScreen.js';

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
  // Cockpit screen initialises itself when navigated to via the router

  // Placeholder screens (not yet built)
  ['sales'].forEach((id) => {
    const el = document.getElementById(`screen-${id}`);
    if (el) el.innerHTML = renderPlaceholder(id);
  });

  // Register all screens
  registerScreen('home', initCockpitScreen);
  registerScreen('sales');
  registerScreen('demand');
  registerScreen('suppliers');
  registerScreen('more');

  // Receive → Receiving Workflow (DT-004, wraps IME as one entry point)
  registerScreen('receive', initReceivingScreen);

  // Inventory → Live Inventory (DT-006)
  registerScreen('inventory', initInventoryScreen);

  // Products → Product Master (DT-002, accessible from within inventory or More)
  registerScreen('products', initProductsScreen);

  // Demand → Demand Log (DT-007)
  registerScreen('demand', initDemandScreen);

  // Review → Review Workspace (DT-008)
  registerScreen('review', renderReviewWorkspace);

  // Suppliers → SRM (DT-005)
  registerScreen('suppliers', initSuppliersScreen);

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
  document.getElementById('goto-review')?.addEventListener('click', () => navigate('review'));
  document.getElementById('goto-products')?.addEventListener('click', () => navigate('products'));
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
