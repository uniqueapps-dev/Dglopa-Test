/**
 * DGLOPA PLATFORM — ROUTER
 * Hash-based navigation. Screens registered by ID.
 */

const _screens    = new Map();  // id → { el, onEnter? }
const _navItems   = new Map();  // id → navEl
let   _current    = null;

export function registerScreen(id, onEnter = null) {
  const el = document.getElementById(`screen-${id}`);
  if (!el) {
    console.warn(`[Router] Screen element #screen-${id} not found`);
    return;
  }
  _screens.set(id, { el, onEnter });
}

export function registerNavItem(id, el) {
  _navItems.set(id, el);
}

export function navigate(id) {
  if (!_screens.has(id)) {
    console.warn(`[Router] Unknown screen: ${id}`);
    return;
  }

  // Deactivate current
  if (_current) {
    _screens.get(_current)?.el.classList.remove('active');
    _navItems.get(_current)?.classList.remove('active');
  }

  // Activate target
  const { el, onEnter } = _screens.get(id);
  el.classList.add('active');
  _navItems.get(id)?.classList.add('active');
  _current = id;

  // Update hash silently
  history.replaceState(null, '', `#${id}`);

  // Fire lifecycle hook
  if (typeof onEnter === 'function') {
    try { onEnter(); } catch (e) { console.error(`[Router] onEnter error for ${id}:`, e); }
  }

  // Scroll content to top
  const main = document.getElementById('main-content');
  if (main) main.scrollTop = 0;
}

export function initRouter(defaultScreen = 'home') {
  // Resolve initial screen from hash or default
  const hash = location.hash.replace('#', '') || defaultScreen;
  const target = _screens.has(hash) ? hash : defaultScreen;
  navigate(target);

  // Handle browser back/forward
  window.addEventListener('popstate', () => {
    const h = location.hash.replace('#', '') || defaultScreen;
    if (_screens.has(h)) navigate(h);
  });

  console.info('[Router] Initialized — active:', target);
}

export function getCurrentScreen() {
  return _current;
}
