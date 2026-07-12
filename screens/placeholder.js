/**
 * DGLOPA PLATFORM — PLACEHOLDER SCREENS
 * Stub screens for modules not yet built.
 * DT-003A: 'receive' removed — now the Intelligent Migration Engine entry point.
 */

const PLACEHOLDERS = {
  sales: {
    icon: `<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>`,
    title: 'Point of Sale',
    body:  'POS terminal, receipt generation, and daily sales summary.',
    badge: 'M3',
  },
  demand: {
    icon: `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,
    title: 'Demand Log',
    body:  'Track unmet demand, stockout logging, and reorder signals.',
    badge: 'M5',
  },
  more: {
    icon: `<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>`,
    title: 'More',
    body:  'Reports, audit log, and additional platform tools.',
    badge: 'M7',
  },
};

export function renderPlaceholder(screenId) {
  const cfg = PLACEHOLDERS[screenId];
  if (!cfg) return '<p class="text-muted">Unknown screen.</p>';
  return `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">${cfg.icon}</svg>
      <div class="empty-state-title">${cfg.title}</div>
      <div class="empty-state-body">${cfg.body}</div>
      <span class="badge badge-accent" style="margin-top:4px">Milestone ${cfg.badge}</span>
    </div>`;
}
