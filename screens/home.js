/**
 * DGLOPA PLATFORM — HOME SCREEN (Command Center)
 * Placeholder cards only. No calculations.
 */

export function renderHome() {
  return `
    <div class="section-title">Command Center</div>
    <div class="section-subtitle">Platform overview — data loads with each module</div>

    <div class="cc-grid">

      <!-- Inventory -->
      <div class="card" data-nav="inventory" style="cursor:pointer">
        <div class="card-header">
          <div class="card-icon accent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            </svg>
          </div>
        </div>
        <div class="card-title">Inventory</div>
        <div class="card-value text-muted">—</div>
        <div class="card-meta">Total SKUs tracked</div>
      </div>

      <!-- Receive Stock -->
      <div class="card" data-nav="receive" style="cursor:pointer">
        <div class="card-header">
          <div class="card-icon amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
        </div>
        <div class="card-title">Receive Stock</div>
        <div class="card-value text-muted">—</div>
        <div class="card-meta">Pending invoices</div>
      </div>

      <!-- Sales -->
      <div class="card" data-nav="sales" style="cursor:pointer">
        <div class="card-header">
          <div class="card-icon green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="12" y1="1" x2="12" y2="23"/>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
        </div>
        <div class="card-title">Sales</div>
        <div class="card-value text-muted">—</div>
        <div class="card-meta">Today's revenue</div>
      </div>

      <!-- Demand -->
      <div class="card" data-nav="demand" style="cursor:pointer">
        <div class="card-header">
          <div class="card-icon red">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
        </div>
        <div class="card-title">Demand</div>
        <div class="card-value text-muted">—</div>
        <div class="card-meta">Unmet demand logs</div>
      </div>

      <!-- Suppliers -->
      <div class="card" data-nav="suppliers" style="cursor:pointer">
        <div class="card-header">
          <div class="card-icon accent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="2" y="7" width="20" height="14" rx="2"/>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            </svg>
          </div>
        </div>
        <div class="card-title">Suppliers</div>
        <div class="card-value text-muted">—</div>
        <div class="card-meta">Active suppliers</div>
      </div>

      <!-- Review Queue -->
      <div class="card" style="cursor:pointer">
        <div class="card-header">
          <div class="card-icon amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
        </div>
        <div class="card-title">Review Queue</div>
        <div class="card-value text-muted">—</div>
        <div class="card-meta">Items needing attention</div>
      </div>

    </div>
  `;
}
