/**
 * DGLOPA PLATFORM — COCKPIT FOUNDATION
 * insightCards.js — DT-009
 *
 * Renders InsightCards from CockpitPayload.insights.
 * Every card is explainable and traceable to its originating Pattern.
 * Pure rendering — no business logic.
 */

import {
  insightCardBorderVar, evolutionIndicator, strengthBadgeClass,
} from '../../services/cockpit/cockpitLayoutEngine.js';

export function renderInsightCards(insights, container) {
  const el = container.querySelector('#cockpit-insights');
  if (!el) return;

  if (insights.length === 0) {
    el.innerHTML = `<div class="text-muted text-sm">No operational patterns detected yet. Insights will appear as transaction history grows.</div>`;
    return;
  }

  el.innerHTML = insights.map(_insightCard).join('');
}

function _insightCard(card) {
  const border = insightCardBorderVar(card);
  const badge  = strengthBadgeClass(card.patternStrength);
  const evo    = evolutionIndicator(card.evolution);

  return `
    <div class="card" style="margin-bottom:var(--sp-3);border-left:3px solid ${border}">
      <!-- Header -->
      <div class="d-flex justify-between align-center">
        <div class="fw-medium">${_e(card.title)}</div>
        <div class="d-flex gap-2 align-center">
          <span class="badge ${badge}" style="font-size:0.6rem">${_e(card.patternStrength)}</span>
          <span class="badge badge-accent" style="font-size:0.6rem">${_e(card.confidence)}</span>
        </div>
      </div>

      <!-- Evolution indicator -->
      <div class="text-xs text-muted" style="margin-top:2px">${_e(evo)}</div>

      <!-- Summary -->
      <div class="text-sm" style="margin-top:var(--sp-2);color:var(--clr-text-2)">${_e(card.summary)}</div>

      <!-- Why it matters (expandable) -->
      <details style="margin-top:var(--sp-2)">
        <summary class="text-xs text-accent" style="cursor:pointer;list-style:none">Why this matters ↓</summary>
        <div class="text-sm" style="margin-top:var(--sp-2);color:var(--clr-text-2)">${_e(card.whyItMatters)}</div>

        <!-- Supporting evidence -->
        ${card.supportingEvidence.length > 0 ? `
        <div class="text-xs text-muted" style="margin-top:var(--sp-2)">
          <div class="fw-medium" style="margin-bottom:4px">Evidence:</div>
          ${card.supportingEvidence.map((e) => `<div style="padding-left:var(--sp-2)">· ${_e(e)}</div>`).join('')}
        </div>` : ''}

        <!-- Traceability -->
        <div class="text-mono text-xs" style="color:var(--clr-text-3);margin-top:var(--sp-2)">
          Pattern: ${_e(card.patternId)} ${card.contextId ? `· Context: ${_e(card.contextId)}` : ''}
        </div>
      </details>
    </div>`;
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
