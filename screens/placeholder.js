/**
 * DGLOPA PLATFORM — PLACEHOLDER SCREENS
 * Stub screens for modules not yet built.
 * Inventory (DT-002) is now a real screen — removed from this list.
 */

const PLACEHOLDERS = {
  receive: {
    icon: `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`,
    title: 'Receive Stock',
    body:  'Stock receiving, invoice management, and FEFO lot creation.',
    badge: 'M2',
  },
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
  suppliers: {
    icon: `<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>`,
    title: 'Suppliers',
    body:  'Supplier directory, balance tracking, and purchasing intelligence.',
    badge: 'M6',
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
