/**
 * DGLOPA PLATFORM — COCKPIT FOUNDATION
 * activityFeed.js — DT-009
 *
 * Renders the unified activity feed from CockpitPayload.feedGroups.
 * Grouped by Today / Yesterday / Earlier This Week / Earlier This Month / Older.
 * Supports filtering by module, importance, and strategic intent.
 * Pure rendering — no business logic.
 */

import { feedEventClass } from '../../services/cockpit/cockpitLayoutEngine.js';

// ---- Filter state ----
let _activeFilter = null; // null = all

export function renderActivityFeed(feedGroups, container) {
  const el = container.querySelector('#cockpit-feed');
  if (!el) return;

  if (feedGroups.length === 0) {
    el.innerHTML = `<div class="text-muted text-sm">No activity recorded yet. Activity will appear here as operations begin.</div>`;
    return;
  }

  // Filter controls
  const modules = [...new Set(
    feedGroups.flatMap((g) => g.events).map((e) => e.sourceModule)
  )].filter(Boolean).sort();

  el.innerHTML = `
    <div class="filter-tabs" id="feed-filter-tabs" style="margin-bottom:var(--sp-3)">
      <button class="filter-tab${!_activeFilter ? ' active' : ''}" data-filter="">All</button>
      ${modules.map((m) =>
        `<button class="filter-tab${_activeFilter === m ? ' active' : ''}" data-filter="${_e(m)}">${_e(m)}</button>`
      ).join('')}
    </div>
    <div id="feed-content">
      ${_renderGroups(feedGroups)}
    </div>`;

  // Filter wiring
  el.querySelector('#feed-filter-tabs').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-filter]');
    if (!btn) return;
    _activeFilter = btn.dataset.filter || null;
    el.querySelectorAll('#feed-filter-tabs .filter-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const filtered = feedGroups.map((g) => ({
      label:  g.label,
      events: _activeFilter ? g.events.filter((e) => e.sourceModule === _activeFilter) : g.events,
    })).filter((g) => g.events.length > 0);

    el.querySelector('#feed-content').innerHTML = _renderGroups(filtered);
  });
}

function _renderGroups(groups) {
  if (groups.length === 0) return `<div class="text-muted text-sm">No events match this filter.</div>`;
  return groups.map(_feedGroup).join('');
}

function _feedGroup(group) {
  return `
    <div class="tl-group">
      <div class="tl-group-label">${_e(group.label)}</div>
      <div class="tl-group-events">
        ${group.events.slice(0, 20).map(_feedEvent).join('')}
        ${group.events.length > 20 ? `<div class="text-xs text-muted" style="padding-left:30px">+${group.events.length - 20} more</div>` : ''}
      </div>
    </div>`;
}

function _feedEvent(ev) {
  const dotCls = feedEventClass(ev);
  const time   = new Date(ev.timestamp).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  const importanceIcon = ev.importance === 'CRITICAL' ? '🔴' : ev.importance === 'WARNING' ? '🟡' : ev.importance === 'SUCCESS' ? '🟢' : '⚪';

  return `
    <div class="tl-event">
      <div class="tl-event-indicator">
        <div class="tl-dot ${dotCls}"></div>
        <div class="tl-line"></div>
      </div>
      <div class="tl-event-content">
        <div class="tl-event-header">
          <span class="tl-event-type">${importanceIcon} ${_e(ev.title)}</span>
          <span class="tl-event-time">${time}</span>
        </div>
        <div class="tl-event-desc">${_e(ev.description)}</div>
        <div class="tl-meta-tag">${_e(ev.sourceModule)}</div>
      </div>
    </div>`;
}

function _e(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
