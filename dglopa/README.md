# Dglopa Platform — DT-001 Foundation

**Milestone:** M1 – Foundation & Migration  
**Version:** 1.0.0  
**Status:** ✅ Foundation complete

---

## Overview

Offline-first pharmacy operations PWA built on vanilla HTML5, CSS3, ES2022+, Dexie.js, and a Service Worker. No framework dependencies.

---

## Folder Structure

```
dglopa/
├── index.html            # App entry point
├── app.js                # Boot sequence + wiring
├── manifest.json         # PWA manifest
├── sw.js                 # Service Worker (cache-first)
│
├── css/
│   ├── tokens.css        # Design tokens (colors, type, spacing)
│   ├── global.css        # Reset + base styles
│   └── components.css    # All reusable component styles
│
├── js/
│   └── router.js         # Hash-based screen router
│
├── db/
│   └── database.js       # Dexie.js DB — all 14 tables, versioned
│
├── components/
│   ├── toast.js          # Toast notifications
│   ├── modal.js          # Bottom-sheet modal
│   └── loadingOverlay.js # Full-screen loading overlay
│
├── screens/
│   ├── home.js           # Command Center shell (placeholder cards)
│   ├── settings.js       # Settings screen (version + DB info)
│   └── placeholder.js    # Stub renderer for all other screens
│
├── services/
│   └── errorHandler.js   # Global error + rejection handler
│
├── utils/
│   └── helpers.js        # formatNaira, formatDate, debounce, uid…
│
└── assets/
    └── icons/            # Place icon-192.png and icon-512.png here
```

---

## Build Instructions

No build step. Pure static files.

### Local development

```bash
# Python 3
python -m http.server 8080

# Node.js
npx serve .

# Then open:
# http://localhost:8080
```

### GitHub Pages deployment

1. Push the `dglopa/` folder contents to the repository root (or a `/docs` folder if configured).
2. Enable GitHub Pages in repository Settings → Pages → Branch: `main`.
3. Access via `https://uniqueapps-dev.github.io/<repo-name>/`.

### PWA Icons

Place two icon files in `assets/icons/`:
- `icon-192.png` — 192×192px
- `icon-512.png` — 512×512px

Without these, the app still functions but will not pass full PWA installability checks.

---

## Database Schema

All 14 tables initialized via Dexie.js (IndexedDB). Empty at startup.

| Table | Primary Key | Notable Indexes |
|---|---|---|
| Products | `++id` | `barcode`, `name`, `category`, `supplierId` |
| InventoryLots | `++id` | `productId`, `expiryDate`, `invoiceId` |
| Suppliers | `++id` | `code`, `name` |
| SupplierInvoices | `++id` | `supplierId`, `invoiceDate`, `status` |
| Sales | `++id` | `receiptNumber`, `saleDate`, `staffId` |
| SaleLines | `++id` | `saleId`, `productId` |
| StockMovements | `++id` | `productId`, `lotId`, `type` |
| Demand | `++id` | `productId`, `loggedAt` |
| Payments | `++id` | `referenceId`, `method`, `status` |
| PurchaseHistory | `++id` | `productId`, `supplierId` |
| PriceHistory | `++id` | `productId`, `effectiveDate` |
| ReviewQueue | `++id` | `productId`, `priority`, `status` |
| Settings | `&key` | — |
| AuditLog | `++id` | `entity`, `entityId`, `action` |

**Schema versioning:** Add new `this.version(N).stores({...})` blocks to `db/database.js`. Never modify past versions.

---

## Navigation

| Nav Item | Screen ID | Status |
|---|---|---|
| Home | `screen-home` | ✅ Command Center shell |
| Receive | `screen-receive` | 🔲 M2 placeholder |
| Sales | `screen-sales` | 🔲 M3 placeholder |
| Inventory | `screen-inventory` | 🔲 M4 placeholder |
| Demand | `screen-demand` | 🔲 M5 placeholder |
| Suppliers | `screen-suppliers` | 🔲 M6 placeholder |
| More | `screen-more` | ✅ Settings entry point |
| Settings | `screen-settings` | ✅ Version + DB info |

---

## Acceptance Criteria

| Criterion | Status |
|---|---|
| Installs as PWA | ✅ manifest.json + SW registered |
| Works offline | ✅ Cache-first SW, IndexedDB local |
| IndexedDB initializes | ✅ All 14 tables via Dexie.js |
| Navigation functions | ✅ Hash-based router, 7 nav items |
| Placeholder screens load | ✅ All stubs render |
| No console errors | ✅ Global error handler active |
| Modular folder structure | ✅ 9 directories |
| No business logic | ✅ Data layer only |

---

## Changelog

### v1.0.0 — DT-001 Foundation (2026-06-27)
- App shell: header, bottom nav, main content area
- PWA: manifest.json, Service Worker (cache-first)
- IndexedDB: 14 tables, version 1 schema via Dexie.js
- Router: hash-based, 8 registered screens
- Screens: Home Command Center, Settings, 5 placeholder stubs
- Components: Toast, Modal, LoadingOverlay
- Services: Global error handler
- Utils: formatNaira, formatDate, debounce, uid, safeJSON, sleep
- Design tokens: full color, type, spacing, radius, shadow system
- No business logic implemented
