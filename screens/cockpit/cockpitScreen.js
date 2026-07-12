/**
 * DGLOPA PLATFORM — COCKPIT FOUNDATION
 * cockpitScreen.js — DT-009
 *
 * The Cockpit is the pharmacist's operational window.
 * It is workspace-first, not menu-first.
 *
 * Loading strategy (progressive):
 *   1. Render skeleton shell immediately (no waiting)
 *   2. Load semantic events (fast — one parallel DB read per table)
 *   3. Build basic CockpitPayload from events only (no context/pattern)
 *   4. Render initial Cockpit
 *   5. In background: build context graphs and pattern graph
 *   6. Update Attention Center and Insights when ready
 *
 * This ensures the pharmacist sees something useful within 1-2 seconds
 * even on the LG G8X, while the richer pattern intelligence loads
 * progressively in the background.
 *
 * ADR-059: Cockpit never queries operational DB tables directly.
 * ADR-060: Attention precedes information.
 */

import { assembleSemanticEvents }  from '../../services/semantic/index.js';
import { correlate }               from '../../services/context/index.js';
import { correlatePatterns }       from '../../services/pattern/index.js';
import { buildCockpitPayload }     from '../../services/cockpit/cockpitService.js';
import { orderSections }           from '../../services/cockpit/cockpitLayoutEngine.js';
import { renderAttentionCenter }   from './attentionCenter.js';
import { renderInsightCards }      from './insightCards.js';
import { renderActivityFeed }      from './activityFeed.js';
import { renderQuickActions }      from './quickActions.js';
import { ENTITY_TYPE }             from '../../services/semantic/eventConstants.js';
import { WINDOW_TYPE }             from '../../services/context/contextConstants.js';
import { PATTERN_WINDOW }          from '../../services/pattern/patternConstants.js';
import { formatNaira }             from '../../utils/helpers.js';

// ================================================================
// ENTRY POINT
// ================================================================

export async function initCockpitScreen() {
  const container = document.getElementById('screen-home');
  if (!container) return;

  // ---- Immediate skeleton ----
  _renderSkeleton(container);

  try {
    // ---- Phase 1: Semantic events (fast) ----
    const { events, timeline } = await assembleSemanticEvents({ limit: 300 });

    // Initial payload with no context/pattern data
    const initialPayload = buildCockpitPayload({ events });
    _renderCockpit(container, initialPayload, timeline);

    // ---- Phase 2: Context + Pattern (progressive enrichment) ----
    // Run in background — don't block the rendered UI
    _enrichCockpit(container, events).catch((err) => {
      console.warn('[Cockpit] Background enrichment failed:', err.message);
    });

  } catch (err) {
    console.error('[Cockpit] Load error:', err);
    container.innerHTML = `
      <div class="section-title">Cockpit</div>
      <div class="card" style="border-color:var(--clr-red);margin-top:var(--sp-4)">
        <div class="text-red fw-medium">Failed to load Cockpit</div>
        <div class="text-muted text-xs" style="margin-top:2px">${err.message}</div>
      </div>`;
  }
}

// ================================================================
// SKELETON (renders immediately)
// ================================================================

function _renderSkeleton(container) {
  container.innerHTML = `
    <div class="cockpit-header">
      <div class="cockpit-greeting text-muted text-sm">Loading…</div>
      <div class="section-title">Cockpit</div>
    </div>
    <div class="cockpit-skeleton">
      <div class="skeleton-block" style="height:80px;margin-bottom:var(--sp-3)"></div>
      <div class="skeleton-block" style="height:60px;margin-bottom:var(--sp-2)"></div>
      <div class="skeleton-block" style="height:60px;margin-bottom:var(--sp-2)"></div>
    </div>`;
}

// ================================================================
// FULL RENDER
// ================================================================

function _renderCockpit(container, payload, timeline) {
  const sections = orderSections(payload);

  container.innerHTML = `
    <!-- Welcome Header -->
    <div class="cockpit-header" id="cockpit-welcome">
      <div class="cockpit-greeting">${_e(payload.welcome.greeting)}</div>
      <div class="section-title" style="margin-bottom:2px">${_e(payload.welcome.pharmacyName)}</div>
      <div class="text-muted text-xs">${_e(payload.welcome.dayLabel)}</div>
    </div>

    <!-- Business Snapshot -->
    ${sections.includes('snapshot') ? `
    <div class="cockpit-snapshot" id="cockpit-snapshot">
      ${_snapshotHTML(payload.snapshot, timeline)}
    </div>` : ''}

    <!-- Attention Center (renders first per ADR-060) -->
    ${sections.includes('attention') ? `
    <div class="settings-section-label">Attention</div>
    <div id="cockpit-attention"></div>` : ''}

    <!-- Operational Insights -->
    ${sections.includes('insights') ? `
    <div class="settings-section-label" style="margin-top:var(--sp-5)">Operational Insights</div>
    <div id="cockpit-insights"></div>` : ''}

    <!-- Activity Feed -->
    ${sections.includes('feed') ? `
    <div class="settings-section-label" style="margin-top:var(--sp-5)">Activity</div>
    <div id="cockpit-feed"></div>` : ''}

    <!-- Quick Actions -->
    ${sections.includes('actions') ? `
    <div class="settings-section-label" style="margin-top:var(--sp-5)">Quick Actions</div>
    <div id="cockpit-actions"></div>` : ''}

    <div class="text-mono text-xs" style="color:var(--clr-text-3);margin-top:var(--sp-6);text-align:center">
      Cockpit v${payload.cockpitVersion} · ${new Date(payload.generatedAt).toLocaleTimeString('en-NG')}
    </div>
  `;

  // Wire sub-components
  renderAttentionCenter(payload.attention, container);
  renderInsightCards(payload.insights, container);
  renderActivityFeed(payload.feedGroups, container);
  renderQuickActions(payload.quickActions, container);
}

function _snapshotHTML(snapshot, timeline) {
  return `
    <div class="inv-stat-row">
      <div class="inv-big-stat">
        <div class="inv-big-value text-${snapshot.critical > 0 ? 'red' : 'green'}">${snapshot.critical}</div>
        <div class="inv-big-label">Critical Items</div>
      </div>
      <div class="inv-big-stat">
        <div class="inv-big-value text-accent">${snapshot.activityToday}</div>
        <div class="inv-big-label">Events Today</div>
      </div>
    </div>
    <div class="inv-stat-row" style="margin-top:var(--sp-2)">
      <div class="inv-big-stat">
        <div class="inv-big-value text-${snapshot.highPatterns > 0 ? 'amber' : 'green'}">${snapshot.highPatterns}</div>
        <div class="inv-big-label">High Patterns</div>
      </div>
      <div class="inv-big-stat">
        <div class="inv-big-value text-accent">${snapshot.patternCount}</div>
        <div class="inv-big-label">Patterns Detected</div>
      </div>
    </div>`;
}

// ================================================================
// BACKGROUND ENRICHMENT (adds context + pattern intelligence)
// ================================================================

async function _enrichCockpit(container, events) {
  // Build context graphs — scoped to available entities
  const contextGraphs = [];

  // Supplier context graph
  const supplierContextGraph = correlate(events, { windowType: WINDOW_TYPE.SUPPLIER });
  if (supplierContextGraph.contexts?.length > 0) contextGraphs.push(supplierContextGraph);

  // Product / inventory context graph
  const inventoryContextGraph = correlate(events, { windowType: WINDOW_TYPE.INVENTORY });
  if (inventoryContextGraph.contexts?.length > 0) contextGraphs.push(inventoryContextGraph);

  // Demand context graph
  const demandContextGraph = correlate(events, { windowType: WINDOW_TYPE.DEMAND });
  if (demandContextGraph.contexts?.length > 0) contextGraphs.push(demandContextGraph);

  // Build pattern graph from all contexts
  const patternGraph = contextGraphs.length > 0
    ? correlatePatterns(contextGraphs, { windowType: PATTERN_WINDOW.ROLLING_90 })
    : null;

  // Rebuild payload with enriched data
  const enrichedPayload = buildCockpitPayload({
    events,
    contextGraphs,
    patternGraphs: patternGraph ? [patternGraph] : [],
  });

  // Update only the sections that benefit from enrichment
  // (Attention Center and Insights — feed and snapshot don't change)
  const attentionEl = container.querySelector('#cockpit-attention');
  const insightsEl  = container.querySelector('#cockpit-insights');

  if (attentionEl) renderAttentionCenter(enrichedPayload.attention, container);
  if (insightsEl)  renderInsightCards(enrichedPayload.insights, container);

  // Update snapshot if pattern data is now available
  const snapshotEl = container.querySelector('#cockpit-snapshot');
  if (snapshotEl) {
    const { timeline } = await assembleSemanticEvents({ limit: 1 }); // get timeline meta only
    snapshotEl.innerHTML = _snapshotHTML(enrichedPayload.snapshot, {});
  }
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
