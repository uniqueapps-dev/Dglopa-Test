# Dglopa Platform

**Version:** 1.1.0 (DT-002)  
**Status:** M1 complete — Foundation + Product Master

---

## Overview

Offline-first pharmacy operations PWA. Vanilla HTML5/CSS3/ES2022+, Dexie.js IndexedDB, Service Worker. No framework dependencies.

---

## Folder Structure

```
dglopa/
├── index.html
├── app.js
├── manifest.json
├── sw.js
│
├── css/
│   ├── tokens.css
│   ├── global.css
│   └── components.css
│
├── js/
│   └── router.js
│
├── db/
│   ├── database.js              ← Dexie schema v1 + v2
│   └── migrations/
│       ├── 001_initial.js
│       └── 002_product_master.js
│
├── components/
│   ├── toast.js
│   ├── modal.js
│   └── loadingOverlay.js
│
├── screens/
│   ├── home.js
│   ├── settings.js
│   ├── placeholder.js
│   └── products/
│       ├── productsScreen.js    ← DPM controller
│       ├── productForm.js       ← Add / Edit form
│       └── productProfile.js   ← Read-only profile view
│
├── services/
│   ├── errorHandler.js
│   └── productService.js       ← CRUD, search, validation, dedup
│
├── utils/
│   ├── helpers.js
│   ├── idGenerator.js          ← PRD-000001, SUP-000001, etc.
│   └── normalizer.js           ← Duplicate detection
│
└── assets/icons/
    ├── icon-192.png  ← required for PWA install
    └── icon-512.png
```

---

## Build & Deploy

No build step. Static files only.

```bash
# Local dev
python -m http.server 8080
# or
npx serve .
```

**GitHub Pages:** Push folder contents to repo root. Enable Pages → main branch.

**Icons:** Place `icon-192.png` (192×192) and `icon-512.png` (512×512) in `assets/icons/`.

---

## Database Schema

### Migration History

| Migration | Dexie Version | Description |
|---|---|---|
| 001_initial | v1 | Foundation — 14 empty tables |
| 002_product_master | v2 | Full schema upgrade, immutable IDs |

### ID Format

All primary keys are app-generated immutable strings:

| Prefix | Entity |
|---|---|
| PRD-NNNNNN | Products |
| SUP-NNNNNN | Suppliers |
| LOT-NNNNNN | InventoryLots |
| INV-NNNNNN | SupplierInvoices |
| SAL-NNNNNN | Sales |
| DEM-NNNNNN | Demand |
| PAY-NNNNNN | Payments |
| MOV-NNNNNN | StockMovements |
| PUR-NNNNNN | PurchaseHistory |
| REV-NNNNNN | ReviewQueue |

Sequences stored in `Settings` table as `seq_PRD`, `seq_SUP`, etc.

### Products (v2)

| Field | Type | Notes |
|---|---|---|
| id | &string | PRD-NNNNNN, immutable |
| productName | string | Required |
| normalizedName | string | Dedup key, indexed |
| genericName | string | |
| brand | string | |
| strength | string | |
| dosageForm | string | Required |
| category | string | |
| baseUnit | string | Required |
| receivingUnits | string | |
| sellingUnits | string | |
| lifecycleStatus | string | Active / Discontinued / Archived |
| healthScore | null | Reserved |
| preferredSupplierId | string\|null | |
| notes | string | |
| createdAt / updatedAt | timestamp | |

### Suppliers (v2)

Full schema: SupplierName, ContactPerson, Phone, WhatsApp, Email, PaymentMethod, AdvancePaymentPercentage, CreditDays, SettlementDay, CreditLimit, PreferredOrderingMethod, MinimumOrderValue, LeadTime, Status, Notes.

### Barcodes (v2 — new table)

Empty. Future multi-barcode per product support. No unique constraint on barcode column (intentional).

---

## Product Master (DPM)

**Screen:** Inventory tab → Product Master

| Feature | Status |
|---|---|
| Add Product | ✅ |
| Edit Product | ✅ |
| Archive / Restore | ✅ |
| View Profile | ✅ |
| Search (name/generic/brand/strength/form/category) | ✅ |
| Filter by lifecycle status | ✅ |
| Duplicate detection (normalizedName composite key) | ✅ |
| Validation (name, dosage form, base unit) | ✅ |
| Immutable IDs (PRD-NNNNNN) | ✅ |
| Future sections placeholder | ✅ |

---

## Navigation

| Tab | Screen | Status |
|---|---|---|
| Home | Command Center | ✅ DT-001 |
| Receive | Stub | 🔲 M2 |
| Sales | Stub | 🔲 M3 |
| **Inventory** | **Product Master** | ✅ **DT-002** |
| Demand | Stub | 🔲 M5 |
| Suppliers | Stub | 🔲 M6 |
| More → Settings | Settings | ✅ DT-001 |

---

## Changelog

### v1.1.0 — DT-002 Product Master (2026-06-28)

**Part A — Foundation Upgrade**
- Immutable app-generated IDs (PRD/SUP/LOT/INV/SAL/DEM/PAY/MOV/PUR/REV-NNNNNN)
- `idGenerator.js` — atomic sequence via IndexedDB transaction
- Migration framework: `db/migrations/` — 001_initial, 002_product_master markers
- Dexie schema v2 applied; v1 preserved verbatim
- Unique barcode constraint removed; `Barcodes` table created for future multi-barcode support
- `normalizer.js` — product name normalization for duplicate detection

**Parts B–G — Schema Upgrades**
- Products: full 14-field schema + `normalizedName` dedup index
- Suppliers: full schema (payment policy, ordering policy, delivery policy, performance)
- InventoryLots: QuantityReceived, QuantityAvailable, UnitCost, SellingPrice, OwnerType, BatchNumber, ExpiryDate, ShelfLocation, Status
- StockMovements: MovementID, Quantity, BalanceAfter, MovementType, Reason, Timestamp
- PurchaseHistory: PurchaseID, InvoiceNumber, Quantity, UnitCost, PurchaseDate
- ReviewQueue: ReviewID, Category, Severity, AssignedTo, DueDate, Status, Notes

**Part H — Dglopa Product Master (DPM)**
- `productService.js` — createProduct, updateProduct, archiveProduct, restoreProduct, getProduct, getAllProducts, searchProducts, findDuplicate, validateProduct
- `productsScreen.js` — list, search, filter tabs, add modal, edit modal, profile view, archive/restore
- `productForm.js` — reusable add/edit form with dropdowns (16 dosage forms, 20 categories, 12 units)
- `productProfile.js` — read-only profile with future-section placeholders
- Product Master CSS: filter tabs, form sections, profile grid, form error banner
- No regression from DT-001

### v1.0.0 — DT-001 Foundation (2026-06-27)
- App shell, PWA, Service Worker, IndexedDB, Router, Home CC, Settings, placeholder screens, Toast, Modal, LoadingOverlay, global error handler

### v1.2.0 — DT-002A Product Master Enhancements (2026-06-29)

**Enhancement 1 — Product Aliases**
- `ProductAliases` table: `&id (ALI-NNNNNN), productId, alias, source, createdAt`
- `aliasService.js`: addAlias, bulkAddAliases, getAliasesForProduct, resolveAlias, searchAliases, removeAlias, removeAllAliasesForProduct
- `ALI` prefix added to idGenerator
- Source field is free-text string (manual/import/drug_db/etc.) — forward compatible

**Enhancement 2 — Lookup Tables**
- `Units` table: `++id, &name, symbol, status` — seeded with 14 units
- `DosageForms` table: `++id, &name, status` — seeded with 20 forms
- `Categories` table: `++id, &name, status` — seeded with 23 categories
- `lookupService.js`: getActiveUnits, getAllUnits, addUnit, getActiveDosageForms, addDosageForm, getActiveCategories, addCategory, loadLookups (bulk fetch)
- Seeding is idempotent — `runMigration003()` checks count before inserting
- `productForm.js` updated to load from `loadLookups()` — no hardcoded arrays remain
- `productsScreen.js` updated — lookups loaded in parallel with suppliers on modal open

**Enhancement 3 — Product Images**
- `imageURL` and `thumbnailURL` fields added to Products schema (no index)
- Preserved through create/update cycle
- No UI, no processing — reserved for AI Receiving module

**Enhancement 4 — Product Lifecycle**
- Extended to 6 canonical values: Trial, Active, Slow Moving, Sleeping, Discontinued, Archived
- `LIFECYCLE_STATUSES` constant exported from both `productService.js` and `productForm.js`
- Filter tabs in Product Master updated to show all 6 values + All
- Badge colours: Active=green, Trial=accent, Slow Moving/Sleeping=amber, Discontinued/Archived=red
- Backward compatible — existing Active/Archived/Discontinued records remain valid

**Migration**
- Dexie version 3 schema applied
- `db/migrations/003_product_master_enhancements.js` marker added
- `_recordMigrations()` updated to track migration 003

### v1.3.0 — DT-002B Product Master Final Enhancements (2026-06-30)

**Enhancement 1 — Product Merge Framework**
- `productMergeService.js`: full merge infrastructure, no UI
  - `mergeProducts(deadId, survivorId, reason, actor)` — atomic transaction across all child tables
  - `dryRunMerge(deadId, survivorId)` — validation + transfer count preview, no writes
  - `getMergeHistory(productId)` — AuditLog entries where product was either side of a merge
  - `resolveProductId(productId)` — walks merge chain to find current survivor (max 10 hops, cycle-safe)
- Child table registry (`CHILD_TABLES`) — currently covers InventoryLots, PurchaseHistory, PriceHistory, StockMovements, Demand, ProductAliases, ReviewQueue. Extensible for future modules (SaleLines, Barcodes).
- **Reference preservation strategy (engineering recommendation, approved by default):** each transferred child record is stamped with `_originalProductId` (set once, never overwritten on subsequent merges) and `_transferredAt`. This preserves full audit history while keeping live queries simple — no joins required, foreign keys always point to the current survivor.
- Dead product's name, generic name, and brand are auto-absorbed into the survivor's `ProductAliases` (source: `'merge'`) so it remains searchable under its old name.
- Dead product is preserved (never deleted): `lifecycleStatus: 'Merged'`, `mergedIntoId`, `mergedDate`, `mergedReason` recorded.
- Survivor must have lifecycle status Trial/Active/Slow Moving/Sleeping — merging into a Discontinued/Archived/Merged product is blocked.
- `productService.js`: `updateProduct()`, `archiveProduct()`, `restoreProduct()` now reject merged products with a clear error.
- `productsScreen.js`: merged products render as read-only in the profile view (shows "Merged into PRD-XXXXXX" instead of Edit/Archive buttons); excluded from the "All" filter view but visible under the dedicated "Merged" tab.

**Enhancement 2 — Global Soft Delete Policy**
- `softDelete.js`: platform-wide reusable utility
  - `archiveRecord(table, id, actor)` — sets status → Archived
  - `restoreRecord(table, id, actor)` — sets status → Active
  - `deactivateRecord(table, id, actor)` — sets status → Inactive
  - `markMerged(table, id, mergedIntoId, reason, actor)` — sets status → Merged, generic version usable beyond Products
  - `cancelRecord(table, id, reason, actor)` — sets status → Cancelled
  - `registerSoftDeleteTable(table, statusField, hasUpdatedAt)` — lets future modules self-register without editing this file
- `SOFT_DELETE_STATUSES` constant: Active, Inactive, Archived, Merged, Cancelled
- Every status change writes a corresponding `AuditLog` entry (`STATUS_CHANGE:<status>`) inside the same Dexie transaction — fully atomic
- Pre-registered tables: Products, Suppliers, InventoryLots, SupplierInvoices, Sales, Demand, ReviewQueue, Payments
- `productService.js` archive/restore now delegate to `softDelete.js` instead of direct table writes — single source of truth for audit logging

**Schema (Dexie v4)**
- `Products.mergedIntoId` — indexed, enables direct queries for merge chain resolution
- `AuditLog.action` — indexed, enables fast lookup of MERGE / STATUS_CHANGE history without full table scans
- No data migration required — existing records get `null`/`undefined` merge fields by default (treated correctly as "not merged")

**No regression:** all DT-002 and DT-002A functionality (CRUD, search, validation, duplicate detection, lookup tables, aliases) verified unaffected. No UI changes beyond the read-only merged-product profile state and the new "Merged" filter tab.

### v1.4.0 — DT-003A Intelligent Migration Engine Framework (2026-06-30)

See `CHANGES.md` for full detail. Summary:

- Full import pipeline built: Read → Parse → Normalize → Validate → Duplicate Detection → Product Matching → Supplier Matching → Review Queue → Import Preview → STOP.
- **Zero database writes** — verified by code audit, documented in CHANGES.md.
- Spreadsheet adapter (xlsx/xls/csv) via SheetJS — the platform's only new dependency, scoped to one file.
- Stub adapters registered for PDF, AI Image Extraction, Camera Capture, Clipboard Paste — architecture proven extensible without implementing them yet.
- Validation engine detects all 8 required issue categories with severity, category, row index, description, and suggested resolution.
- Matching engine: exact composite key → alias resolution → fuzzy fallback for products; exact → fuzzy for suppliers. Read-only, never creates records. Resolves through DT-002B merged products.
- Review Queue built in-memory, schema-matched to db.ReviewQueue for direct persistence in DT-003B.
- Import Preview screen: summary stat cards, readiness banner, row-by-row detail with match status and issues.
- "Receive" tab now hosts the IME entry point (file picker → pipeline → preview). No commit action exists in this build.
- See `TODO.md` for DT-003B scope and `KNOWN_ISSUES.md` for documented limitations.
