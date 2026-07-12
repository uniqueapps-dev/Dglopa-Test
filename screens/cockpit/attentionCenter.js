/**
 * DGLOPA PLATFORM — COCKPIT FOUNDATION
 * attentionCenter.js — DT-009
 *
 * Renders the Attention Center from CockpitPayload.attention.
 * Pure rendering — no business logic. No DB queries.
 */

import { navigate } from '../../js/router.js';
import { attentionItemClass } from '../../services/cockpit/cockpitLayoutEngine.js';

export function renderAttentionCenter(attention, container) {
  const el = container.querySelector('#cockpit-attention');
  if (!el) return;

  if (attention.length === 0) {
    el.innerHTML = `
      <div class="card" style="border-color:var(--clr-green)">
        <div class="text-green fw-medium">✓ No items require immediate attention.</div>
        <div class="text-muted text-xs" style="margin-top:2px">All systems operational.</div>
      </div>`;
    return;
  }

  el.innerHTML = attention.map(_attentionCard).join('');

  // Wire tappable cards
  el.querySelectorAll('[data-screen]').forEach((card) => {
    card.addEventListener('click', () => navigate(card.dataset.screen));
  });
}

function _attentionCard(item) {
  const cls    = attentionItemClass(item);
  const border = {
    critical:     'var(--clr-red)',
    operational:  'var(--clr-amber)',
    growth:       'var(--clr-green)',
    learn:        'var(--clr-accent)',
  }[cls] || 'var(--clr-border-2)';

  const badge = {
    critical:    'badge-red',
    operational: 'badge-amber',
    growth:      'badge-green',
    learn:       'badge-accent',
  }[cls] || 'badge-accent';

  const clickAttr = item.screen ? `data-screen="${_e(item.screen)}" style="cursor:pointer"` : '';

  return `
    <div class="card" ${clickAttr} style="margin-bottom:var(--sp-2);border-left:3px solid ${border}">
      <div class="d-flex justify-between align-center">
        <div class="fw-medium text-sm">${_e(item.title)}</div>
        <span class="badge ${badge}">${item.count}</span>
      </div>
      <div class="text-muted text-xs" style="margin-top:2px">${_e(item.body)}</div>
      ${item.screen ? `<div class="text-xs text-accent" style="margin-top:var(--sp-2)">Tap to view →</div>` : ''}
    </div>`;
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
