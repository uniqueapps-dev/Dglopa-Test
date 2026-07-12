/**
 * DGLOPA PLATFORM — COCKPIT FOUNDATION
 * quickActions.js — DT-009
 *
 * Renders Quick Actions grid. Navigation only — no business logic.
 */

import { navigate } from '../../js/router.js';

export function renderQuickActions(quickActions, container) {
  const el = container.querySelector('#cockpit-actions');
  if (!el) return;

  el.innerHTML = `
    <div class="cockpit-actions-grid">
      ${quickActions.map(_actionTile).join('')}
    </div>`;

  el.querySelectorAll('[data-action-screen]').forEach((tile) => {
    tile.addEventListener('click', () => navigate(tile.dataset.actionScreen));
  });
}

function _actionTile(action) {
  return `
    <div class="cockpit-action-tile" data-action-screen="${_e(action.screen)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="cockpit-action-icon">
        <path d="${_e(action.icon)}" stroke-width="1.5"/>
      </svg>
      <div class="cockpit-action-label">${_e(action.label)}</div>
      ${action.badge ? `<span class="cockpit-action-badge">${_e(action.badge)}</span>` : ''}
    </div>`;
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
