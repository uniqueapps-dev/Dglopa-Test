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
