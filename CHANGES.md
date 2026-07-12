# CHANGES.md

## DT-003A — Intelligent Migration Engine (IME) Framework
**Date:** 2026-06-30
**Milestone:** M1 — Foundation & Migration

---

### Summary

Built the complete import pipeline — read, parse, normalize, validate, match,
queue, preview — for spreadsheet-based stock receiving. **Zero database
writes occur anywhere in this ticket.** The pipeline proves the platform can
correctly understand a supplier's spreadsheet before any commit logic exists.

---

### Added

**Adapter Layer** (`services/migration/`)
- `adapterRegistry.js` — SourceAdapter interface + registry. `resolveAdapter(file)` picks the right parser by detection or extension.
- `adapters/spreadsheetAdapter.js` — handles .xlsx, .xls, .csv via SheetJS (CDN). Covers Excel, CSV, and Google Sheets exports (Sheets exports as xlsx/csv, so no separate code path needed).
- `adapters/futureFormatStubs.js` — registered-but-not-implemented adapters for PDF, AI Image Extraction, Camera Capture, Clipboard Paste. Each throws a clear "not yet supported" error. Proves the architecture accommodates these without pipeline changes.

**Pipeline Stages** (`services/migration/`)
- `normalizer.js` — maps arbitrary column headers (40+ alias variants across 14 canonical fields) to canonical field names; cleans values (currency symbols, thousands separators, date format guessing — DD/MM/YYYY preferred for Nigeria locale).
- `validationEngine.js` — detects all 8 required issue categories: Missing Product, Missing Supplier, Missing Unit, Missing Cost, Missing Selling Price, Invalid Quantity, Invalid Expiry, Duplicate Workbook Row. Issues carry severity, category, row index, description, and suggested resolution.
- `matchingEngine.js` — read-only product matching (exact composite key, then alias resolution, then fuzzy name/brand fallback) and supplier matching (exact, then fuzzy substring). Never creates records. Resolves through merged products via mergedIntoId.
- `reviewQueueBuilder.js` — assembles validation issues into an in-memory structure matching the ReviewQueue table schema, ready for direct persistence in a future ticket. No writes to db.ReviewQueue.
- `pipelineOrchestrator.js` — runImportPipeline(file, onProgress) runs all stages in sequence and returns a complete PipelineResult. Builds the Import Preview summary.

**UI** (`screens/migration/`)
- `migrationScreen.js` — controller wired to the Receive tab. File picker, pipeline run with live progress status, preview render. No commit button exists anywhere in this UI.
- `importPreview.js` — read-only Import Preview rendering: summary stat cards, readiness banner, row-by-row breakdown showing product/supplier match status and validation issues.

**Styling**
- css/components.css — IME-specific styles appended: upload zone, summary grid, readiness banner, row cards, field grid, issue badges.

**Documentation**
- CHANGES.md, TODO.md, KNOWN_ISSUES.md (this set)

---

### Modified

- app.js — receive screen now routes to initMigrationScreen() instead of a static placeholder.
- screens/placeholder.js — receive entry removed (no longer a placeholder).
- sw.js — bumped to v5 cache; all new IME modules and the SheetJS CDN URL added to precache list.

---

### Architecture Notes

**Dependency added:** SheetJS (xlsx@0.18.5), loaded from CDN, scoped only to spreadsheetAdapter.js. This is the sole new dependency in the entire platform. Vanilla JS cannot parse the .xlsx binary/zip format; SheetJS is the standard tool for this exact task.

**Zero database writes — verified.** A grep across services/migration/ and screens/migration/ for write methods (.add, .put, .update, .delete, .bulkAdd, .bulkPut, .bulkDelete, .clear) returns only one false positive (Set.add() on a local JS object in normalizer.js, not a Dexie table call).

**Review Queue shape matches db.ReviewQueue schema** so DT-003B's persistence step is a straightforward bulkAdd() — no remapping required.

**Reference resolution through merges:** product matching follows mergedIntoId when an exact composite match lands on an already-merged product, so importing against historical product names continues to work correctly after a DT-002B merge.

---

## DT-003B — Production Commit Engine
**Date:** 2026-07-03

### Summary
Implemented the Production Commit Engine for the Intelligent Migration Engine. The full pipeline now runs from file upload through preview through explicit confirmation through atomic commit. DT-003A (the read/analyze pipeline) is untouched.

### New Files

**`services/migration/commitEngine.js`**
Full commit engine. Eight stages in one Dexie transaction: Suppliers -> Products -> ProductAliases -> InventoryLots -> StockMovements -> PurchaseHistory -> ReviewQueue -> ImportAudit. Automatic rollback on any failure. CommitError class with cause chaining. ID pre-allocation runs outside the transaction to avoid nested transaction constraints.

**`screens/migration/confirmationScreen.js`**
Confirmation screen component (buildConfirmationScreen) and Import Summary component (buildImportSummary). Collects batch-level options (WorkbookType, BatchSupplier, Notes). Requires explicit checkbox confirmation before enabling the commit button.

**`utils/quantitySplitter.js`**
Regex-based splitter for mixed quantity/unit values (e.g. "28pkts", "400 Tabs"). Addresses DT-003AA audit finding: ~40% of shelf-sheet Qty values and nearly all Supplied Qty values carry embedded unit suffixes. Maps 28+ observed variant spellings to canonical unit names from the lookup table.

**`db/migrations/005_import_audit.js`**
Migration marker for Dexie v5.

### Modified Files

**`db/database.js`** — Dexie v5 schema: ImportAudit table added. Migration 005 registered.

**`utils/idGenerator.js`** — ImportAudit (IMP-NNNNNN) prefix added.

**`screens/migration/migrationScreen.js`** — Extended from 2-stage (Upload -> Preview) to 5-stage flow: Upload -> Preview -> Confirmation -> Commit -> Summary. Error state with rollback notice and back/start-over actions. DT-003A stage untouched.

**`sw.js`** — Bumped to v6 cache; all new DT-003B files added to precache list.

**`css/components.css`** — Confirmation screen styles appended: ime-confirm-check, ime-confirm-notice, ime-confirm-label, ime-confirm-cb, ime-confirm-header.

### Engineering Judgment Applied

**DT-003AA audit blueprint respected throughout:**
- Selling price and cost absence treated as warnings (not errors) — rows with only these warnings still commit.
- Lot status recomputed from actual expiry date at commit time rather than trusting source Status field (14 Status/expiry contradictions documented in audit).
- Owner value '0' normalized to Owner type at commit time.
- Shelf code normalization applied (Shelf 04 -> S04, trailing period stripped).
- Batch-level supplier parameter added to Confirmation Screen since no supplier column exists in source workbooks.

**ID pre-allocation outside the main transaction:** idGenerator uses its own nested transaction on db.Settings; nesting that inside a large cross-table transaction would create a deadlock risk in some IndexedDB implementations. Pre-generating all needed IDs before opening the main transaction eliminates this risk entirely with no functional tradeoff.

**ProductAliases auto-created at import time:** any workbook product name that matched via alias or fuzzy (i.e. the workbook used a different name than the platform's canonical product name) is written back as a ProductAlias. This means future imports using the same workbook name match directly rather than via fuzzy fallback, improving match confidence over time without requiring a learning engine.

---

## DT-003BV — First Live Operational Validation
**Date:** 2026-07-04

### Validation outcome
Real pharmacy workbooks imported successfully through the full pipeline. All 8 IME stages verified. Two critical defects discovered and fixed during validation.

### Critical defects fixed

**VL-003 — spreadsheetAdapter.js: Shelf_07 offset-header detection**
Shelf_07 has a banner row ("SHELF_07") in row 1 and the real column headers (S/N, ITEM NAME, QTY, EXPIRY DATE, OWNER) in row 2. The adapter was reading row 1 as the header, producing unnamed columns and silently dropping all 29 Shelf_07 products on every import. Fix: detect when row 0 has exactly 1 non-empty cell and row 1 has 3 or more — automatically advance to row 1 as the header row. Validated against actual Shelf_07 data.

**VL-004 — normalizer.js: Consignment footer row filtering**
Consignment page sheets contain 8 footer rows ("PAGE 1 TOTAL = ₦543,599.76", etc.) as regular data rows. The IME was attempting to parse these as products, generating 8 spurious error-severity ReviewQueue entries per consignment import. Fix: filter rows where the productName-mapped cell contains 'total' (case-insensitive) and the string is longer than 10 characters.

### Other findings (no code changes required)
- VL-001: Amount column NOT mapped to sellingPrice in production normalizer (concern was from test code only). No defect.
- VL-002: Supplied Qty is preserved in row._raw and accessible to commitEngine for PurchaseHistory. No mapping change needed.
- VL-005: 'Not Clear' expiry on Shelf_01/Mixanal Tablets correctly flagged as Invalid Expiry. IME behavior correct.
- VL-006: 'Not Supplied ' with trailing space in Counted Qty correctly handled by .trim(). IME behavior correct.
- VL-007: True consignment product count is 240, not 248 — audit figure included 8 footer rows.
- VL-008: 53 cross-workbook exact product matches confirmed. Matching engine will correctly prevent duplicates if import order is Consignment first, Shelf second.
- VL-009: Shelf_04 5-column layout handled correctly by header-alias mapping without any special case.
- VL-010: 99.5% Warning rate on shelf sheets is expected (all-missing cost/price) — confirmed as known and correct behavior per DT-003AA blueprint.

---

## DT-004 — Receiving Workflow
**Date:** 2026-07-04

### Summary
Implemented the full invoice-first receiving workflow. A supplier delivery now follows a structured path from session creation through invoice line entry, product matching, lot creation, WAC update, and purchase history recording — all inside a single atomic transaction with automatic rollback.

### New Files

**`services/receivingSessionService.js`**
ReceivingSession lifecycle management: createSession, getSession, getAllSessions, getActiveSessions, updateSession, advanceStatus, cancelSession, incrementLineCount. Status flow: Draft → In Review → Ready to Commit → Completed / Cancelled. Mutable sessions only in Draft and In Review.

**`services/receivingLineService.js`**
Per-line validation and matching. matchProductForLine (exact normalizedName → alias → fuzzy, reuses existing services). matchSupplierForLine (exact → fuzzy). validateLine (quantity parse, cost, expiry, duplicate batch detection). sortFEFO (earliest expiry first). getLotsForProduct (active FEFO-sorted lots for a product).

**`services/receivingCommitService.js`**
Atomic commit of a receiving session. One Dexie transaction covers all 7 stages: InventoryLots, StockMovements, PurchaseHistory, Products (WAC + currentStock + lastCost + lastReceivedDate), ReviewQueue (unresolved lines), ReceivingSession (mark Completed), AuditLog. Automatic rollback on any failure. WAC recomputed from all active lots at commit time.

**`screens/receiving/receivingDashboard.js`**
Receiving Dashboard: active sessions list, recent history, New Session form, spreadsheet import entry point. Supplier selection from existing Suppliers table. Supplier-not-listed routes to a helpful message rather than silently creating one.

**`screens/receiving/receivingSession.js`**
Full session workflow screen: line list, Add/Edit line modal with live product match feedback (debounced), Review screen with commit/review split summary, Commit execution with LoadingOverlay progress, Summary result display.

**`screens/receiving/receivingHistory.js`**
Read-only detail view for completed sessions: lots created, purchase history, review queue entries, session metadata.

**`screens/receiving/imeEntry.js`**
Thin wrapper that renders the existing IME migrationScreen within the Receiving module, accessible from the dashboard. IME is unchanged.

**`db/migrations/006_receiving_workflow.js`**
Migration marker for Dexie v6.

### Modified Files

**`db/database.js`** — Dexie v6: ReceivingSessions table added. Products schema extended with weightedAvgCost, lastCost, lastReceivedDate, currentStock as plain fields (no index overhead needed on these aggregate fields).

**`utils/idGenerator.js`** — ReceivingSession (REC-NNNNNN) prefix added.

**`app.js`** — Receive tab now routes to initReceivingScreen (Receiving Dashboard) instead of directly to IME.

**`sw.js`** — Bumped to v7; all new DT-004 files added to precache list.

**`css/components.css`** — Receiving workflow styles appended.

### Engineering Judgment Applied

**WAC computed at commit time from all active lots, not just new ones.** This ensures the weighted average is always accurate even when lots from prior sessions exist. Computing it from only the new lots would give a wrong WAC whenever existing stock is present.

**Product matching in the line entry modal is debounced at 400ms with live feedback.** Staff see "✓ Matched: Paracetamol 500mg Tablet (exact)" as they type, before they even save the line. This gives them confidence they're receiving against the correct product record, not a near-duplicate.

**IME preserved as a first-class entry point within the Receiving module.** The Receiving Dashboard offers two paths: manual line entry (for single-supplier invoices) and IME spreadsheet import (for bulk deliveries). These are complementary, not competing. The IME is not degraded or hidden.

**No new matching logic written.** receivingLineService delegates to the same normalizer.js, aliasService, and the same matching chain used by the IME. Zero duplication of business logic.

---

## DT-005 — Supplier Relationship Management (SRM)
**Date:** 2026-07-04

### Summary
Suppliers are now fully operational business entities, not just reference records. Every supplier has a complete commercial profile, a live relationship summary computed from real transaction data, a performance framework scaffold for future intelligence, and a full CRUD workflow consistent with the rest of the Operational Core.

### New Files

**`services/supplierService.js`**
Full SRM service: createSupplier, updateSupplier, archiveSupplier, restoreSupplier, mergeSuppliers, getSupplier, getAllSuppliers, searchSuppliers, findSupplierByName, getPreferredSuppliers, getRelationshipSummary, getProductsForSupplier, getSupplierCounts. PAYMENT_METHODS and ORDERING_METHODS constants exported. Relationship summary computed at read time from PurchaseHistory, ReceivingSessions, and InventoryLots — no denormalized store. Supplier merge transfers child records with _originalSupplierId audit stamp (mirrors DT-002B product merge pattern).

**`screens/suppliers/suppliersScreen.js`**
Full supplier directory: search, filter tabs (Active/Archived/All), supplier cards, Add/Edit modal, Profile view with relationship summary and archive/restore actions. Preferred supplier badge. Consistent with Product Master UI patterns.

**`screens/suppliers/supplierForm.js`**
Supplier form component: identity, contact, payment policy (with dynamic credit fields shown/hidden based on payment method selection), ordering policy, preference toggle, notes. buildSupplierForm + readSupplierFormValues.

**`screens/suppliers/supplierProfile.js`**
Read-only supplier profile: contact section, commercial terms, live relationship summary (purchases, value, sessions, products, first/last dates), credit status section (placeholders for payment tracking), performance framework (6 metrics, all null/pending), products supplied list, merge record if applicable.

### Modified Files

**`app.js`** — Suppliers tab now routes to initSuppliersScreen (SRM). Removed from placeholder loop.

**`screens/placeholder.js`** — Suppliers entry removed (no longer a placeholder).

**`sw.js`** — Bumped to v8; all new DT-005 files added to precache.

### Engineering Judgment Applied

**No schema version bump.** Suppliers table exists since v2. Additional fields (tradingName, contactPerson, email, address, creditLimit, creditDays, etc.) written as plain fields — Dexie reads these as undefined on existing records, which is handled gracefully throughout. Performance framework fields stored as null — they are scaffolding for future algorithms, not current data.

**Relationship summary computed, not cached.** Purchase count, total value, products supplied, first/last purchase — all derived at read time from live tables. Fast enough for a single-profile view; avoids the risk of denormalized summary data drifting out of sync with the underlying records.

**Supplier merge mirrors DT-002B product merge exactly.** Same _originalSupplierId audit stamp, same AuditLog pattern, same FK-transfer approach across PurchaseHistory, ReceivingSessions, and InventoryLots. Dead supplier preserved — never deleted.

**Credit fields show/hide dynamically.** When payment method is not Credit, the credit limit and credit days fields are hidden — reducing cognitive load for cash/POD suppliers while keeping the fields available for credit relationships.

---

## DT-006 — Live Inventory
**Date:** 2026-07-04

### Summary
Live Inventory is now operational. The pharmacist can open the Inventory tab and instantly see total inventory value, retail value, estimated gross margin, stock alerts by category, and a full product list sorted by operational urgency — all derived live from existing Product, InventoryLot, PurchaseHistory, StockMovements, and ReceivingSession records. No new data is stored.

### New Files

**`services/inventoryService.js`**
All inventory calculations, derived from existing tables. getDashboardSummary (one pass over Products and InventoryLots — total value, retail value, gross margin, stock alerts by type). getInventoryList (filtered, searched, sorted by operational urgency: Out of Stock → Expired → Near Expiry → Low Stock → Review Required → Healthy). getProductInventoryDetail (full product view: FEFO-sorted lots, suppliers, purchase history, receiving sessions, movement history, health framework placeholders). searchByBatchNumber, getActiveCategories. INVENTORY_STATUS and FILTER_TYPES constants exported.

**`screens/inventory/inventoryScreen.js`**
Full inventory UI. Dashboard cards (inventory value, retail value, gross margin, total products), alert pills (clickable — filter the list when tapped), filter tabs, search bar, product list sorted by urgency. Product detail modal: live totals, product info, FEFO lot list with expiry colour-coding (green/amber/red by lot), supplier list, purchase history, receiving sessions, health framework scaffold. All data loaded via inventoryService — no direct db calls in the screen.

### Modified Files

**`app.js`** — Inventory tab now routes to initInventoryScreen (Live Inventory). Product Master moved to a dedicated screen registered as 'products', accessible from the More → Product Master link. Both screens registered and navigable.

**`index.html`** — screen-products slot added. More screen updated with a Product Master entry point.

**`sw.js`** — Bumped to v9; inventoryService and inventoryScreen added to precache.

**`css/components.css`** — Live Inventory styles appended: inv-stat-row, inv-big-stat, inv-mini-stat, inv-alert-row/pill, inv-product-row grid.

### Engineering Judgment Applied

**Inventory tab = Live Inventory, not Product Master.** The Product Master (DT-002) is an administrative tool for managing product records. The Inventory tab is an operational tool for the pharmacist's daily visibility. These are different workflows and now live on different screens. Product Master is accessible from More.

**Alert pills are interactive.** Tapping an alert pill (e.g. "3 Out of Stock") filters the list to that category immediately — same as tapping the corresponding filter tab. This makes the dashboard actionable, not just informational.

**Dashboard computed in one DB round-trip.** getDashboardSummary loads all Products and all InventoryLots in two parallel queries, then computes all dashboard values in a single JavaScript pass. No sequential queries, no N+1 patterns.

**Sort order reflects operational urgency.** The product list sorts Out of Stock first, then Expired, Near Expiry, Low Stock, Review Required, Healthy — so the pharmacist's most pressing issues surface without any manual filtering.

---

## DT-005A — Supplier Workspace
**Date:** 2026-07-04

### Summary
The Suppliers tab now opens with a Workspace — an operational command center that answers "what needs my attention right now?" before asking "what do you want to see?" The Directory is one tap away. No new data is stored; everything derives from existing tables via a single parallel load.

### New Files

**`services/supplierWorkspaceService.js`**
Workspace aggregation service. getWorkspaceSummary() loads Suppliers, PurchaseHistory, ReceivingSessions, InventoryLots, and ReviewQueue in five parallel queries, then computes all workspace values in a single in-memory pass — no sequential per-supplier queries. Produces: commercial summary (total purchase value, inventory value, avg invoice value, deliveries this month, products covered), attention items (pending sessions, review queue, credit suppliers, inactive suppliers, new suppliers), top supplier rankings (by purchase value, inventory value, product count, recent activity), workspace insights (largest, most active, most products, most credit, newest, longest inactive), and recent activity feed. getRecentActivity() returns the last N completed sessions enriched with supplier names.

**`screens/suppliers/supplierWorkspace.js`**
Workspace UI. Commercial summary (8 headline KPIs), Attention Center (actionable cards — tappable, navigate to relevant screen), Quick Actions (New Receiving, Add Supplier, Receiving History), Top Suppliers panel with 4 rank-switcher tabs (By Value / Inventory / Products / Recent — switches instantly in-memory, no DB re-query), Workspace Insights (6 descriptive operational summaries), Recent Activity feed.

### Modified Files

**`screens/suppliers/suppliersScreen.js`** — Entry point now shows Workspace first. Directory accessible via "Directory →" button. Workspace accessible from Directory via "← Workspace" button. View state persisted in module scope so navigation between the two is instant.

**`sw.js`** — Bumped to v10; new files added to precache.

**`css/components.css`** — Workspace styles appended: ws-quick-actions, ws-rank-badge.

### Engineering Judgment Applied

**Single parallel data load.** The key insight: getRelationshipSummary() in DT-005 runs one DB round-trip per supplier (fine for a single profile). Running it in a loop for 50 suppliers = 50 sequential queries. The workspace service instead loads all five relevant tables in parallel once, then does all computation in JavaScript. For 651 products and 50 suppliers, the total data footprint is manageable in memory and the query time is bounded to 5 parallel reads regardless of supplier count.

**Rank-switch is instant — no re-query.** All four ranking views (by purchase value, inventory value, product count, recent activity) are pre-computed and stored in the workspace payload. Switching tabs rerenders from cached data — zero latency on tap.

**Attention items are tappable.** "3 Receiving Sessions Pending" navigates directly to the Receive tab. "14 Items in Review Queue" is stubbed for the future Review Queue screen. This makes the workspace genuinely actionable rather than decorative.

---

## DT-005B — Supplier Timeline
**Date:** 2026-07-04

### Summary
Every supplier relationship now has a complete chronological story — assembled dynamically from existing operational records, presented as a readable narrative grouped by time period, filterable by event category, and searchable by invoice, product, or event type. No timeline table exists; no data is duplicated.

### New Files

**`services/supplierTimelineService.js`**
Event assembler. getSupplierTimeline() performs six parallel reads (Supplier record, ReceivingSessions, InventoryLots, PurchaseHistory, ReviewQueue, AuditLog) and one batch product name lookup, then normalises every record into a typed TimelineEvent in a single in-memory pass. Events are sorted newest-first, filtered by category and search query, and grouped into time buckets (Today / Yesterday / Earlier This Week / Earlier This Month / Older). EVENT_TYPES and CATEGORIES constants exported. Purchase events are de-duplicated per invoice (not per lot) to avoid 30 identical "Purchase Recorded" cards for a 30-line invoice.

**`screens/suppliers/supplierTimeline.js`**
Timeline UI. Search bar, 6 category filter tabs, chronological event groups, per-event cards with coloured timeline dots (green = positive, amber = caution, red = negative, accent = neutral), icon per event type, event meta-tags (invoice number, product name, linked record). Rendered into the suppliers screen container, not a modal, so the full height is available for the timeline. Back button returns to the directory.

### Modified Files

**`screens/suppliers/suppliersScreen.js`** — "Timeline" button added to the supplier profile modal action bar. Tapping opens the timeline in the screen container with a back-to-directory navigation.

**`sw.js`** — Bumped to v11; new files added to precache.

**`css/components.css`** — Timeline styles appended: tl-group, tl-event, tl-dot (green/amber/red/accent), tl-line, tl-event-content/header/desc/meta, tl-meta-tag, tl-meta-link.

### Engineering Judgment Applied

**Purchase events de-duplicated per invoice, not per lot.** A 30-line receiving session creates 30 PurchaseHistory records. Mapping each to its own timeline event would produce 30 "Purchase Recorded" cards for a single delivery — noise rather than signal. Grouping by invoiceNumber reduces this to one card per delivery with the aggregate quantity and value, which is the operationally meaningful unit.

**Product name lookup is batched, not per-event.** The assembler collects all unique productIds from lots and purchases, fetches them all in one Promise.all(), and builds a Map. Zero per-event DB queries after the initial parallel load.

**Timeline rendered in the screen container, not a modal.** Modals clip content vertically and suppress natural scrolling on Android. A timeline can have hundreds of events; it needs the full screen height and native scroll. The timeline takes over the screen container and Back returns to the directory — same pattern as the Workspace/Directory toggle.

---

## DT-007 — Demand Log
**Date:** 2026-07-04

### Summary
Every unmet customer request is now captured, structured, and surfaced as operational intelligence. The Demand tab opens with a live workspace showing open requests, missing units, estimated lost revenue, top missing products, and repeated requests. Quick capture logs a demand entry with live product matching in under 10 seconds. Evidence (photo, prescription, pack image) attaches directly to the demand record as a base64 data URL — no external storage required.

### New Files

**`services/demandService.js`**
Full demand service. captureDemand() — fast-path capture with automatic product matching (exact normalizedName → alias → fuzzy, reusing existing services). getDemandSummary() — one-pass analytics: open count, today/week/month counts, missing units, estimated lost revenue, top requested products by frequency, unmatched count, repeated count. searchDemand() — filtered, searched, date-ranged. Status transitions: resolveDemand, ignoreDemand, convertDemand. readFileAsDataURL() — browser FileReader wrapper for evidence storage. attemptOCR() — placeholder hook for future AI vision integration (returns null in DT-007; image stored as-is, OCR notes entered manually). DEMAND_STATUSES, DEMAND_REASONS, CUSTOMER_TYPES, EVIDENCE_TYPES constants exported.

**`screens/demand/demandCapture.js`**
Quick Capture component. buildQuickCaptureForm() — minimal-friction form: product name (autofocused), requested/supplied quantities, reason dropdown, optional estimated price, optional customer type, optional evidence (camera capture or file attach), optional notes. wireQuickCapture() — wires live product matching (debounced 350ms), camera/file evidence handlers (FileReader → base64), evidence preview with image display, and save logic. Design target: under 10 seconds from "tap Log Demand" to "demand logged."

**`screens/demand/demandScreen.js`**
Demand workspace and list controller. Workspace: headline KPIs (open requests, today count, missing units, est. lost revenue), alert pills, top missing products panel with repeat badges. List: status filter tabs (Open / Resolved / Ignored / Converted / All), search bar, demand cards with quantity grid, unknown-product warning, evidence indicator. Detail modal: full demand record, image evidence display, resolve/ignore actions.

**`db/migrations/007_demand_log.js`**
Migration marker for Dexie v7.

### Modified Files

**`db/database.js`** — Dexie v7: Demand table upgraded with full operational schema. Previously sparse (productId, loggedAt, source only). Now indexed on: id, productId, productName, status, reason, loggedAt, supplierId, sessionId, customerType, createdAt. Plain fields (unindexed): requestedQty, suppliedQty, missingQty, estimatedPrice, evidenceData, evidenceType, evidenceNotes, notes, resolvedAt.

**`app.js`** — Demand tab now routes to initDemandScreen. Removed from placeholder loop.

**`screens/placeholder.js`** — demand entry removed.

**`sw.js`** — Bumped to v12; all new DT-007 files and migration 007 added to precache.

**`css/components.css`** — Demand styles appended: dem-top-list, dem-top-row, qc-evidence-row, qc-evidence-card.

### Engineering Judgment Applied

**Evidence stored as base64 data URLs in IndexedDB.** No external storage, no file system access, no server required — fully offline-first. One evidence item per demand record (the primary signal — multiple images per record is a future enhancement). IndexedDB handles binary blobs natively; Dexie reads them transparently. The evidenceData field is unindexed (large binary data should never be in an index).

**OCR is a placeholder hook, not a feature.** attemptOCR() returns null in DT-007. The image is stored; manual OCR text goes in evidenceNotes. The hook exists so a future AI vision call (OpenRouter, matching the platform's existing AI integration pattern) can drop in without changing the data model or UI.

**Product matching reuses existing services with zero new logic.** captureDemand() calls the same buildDedupKey() → resolveAlias() → fuzzy-name chain used by the IME and Receiving workflow. Unknown products (no match) are stored by name only and flagged in the UI — the pharmacist sees "Unknown product — no match in Product Master" and can later create the product via the Product Master.

---

## DT-008 — Review Workspace
**Date:** 2026-07-04

### Summary
The Review Workspace is the operational inbox that spans the entire platform. Every unresolved item from the IME, Receiving workflow, Demand Log, and Supplier SRM surfaces here in a single prioritised queue. Resolution actions — Resolve, Ignore, Create Product, Create Supplier — are available inline without navigating away.

### New Files

**`services/reviewWorkspaceService.js`**
Workspace aggregation service. getWorkspacePayload() loads ReviewQueue, Products, and Suppliers in three parallel reads, enriches every item in-memory (product/supplier name resolution, severity→priority mapping, source inference). filterItems() applies status/priority/category/source/search filters entirely in-memory — no re-queries after the initial load. Resolution actions: resolveItem, ignoreItem, addNotes (each atomic: ReviewQueue update + AuditLog entry in one Dexie transaction). createProductFromItem / createSupplierFromItem — delegate to productService and supplierService, then auto-resolve the item. Attention builder: groups open items by Critical count, 7-day-old items, and source breakdown. Severity→Priority mapping: error→Critical, warning→Medium, applied at read time, no schema change.

**`screens/review/reviewScreen.js`**
Review Workspace UI. Workspace summary (6 headline stats: open, critical, high, medium, resolved today, avg resolution time). Attention Center (tappable cards that apply their filter on tap). Filter controls (status tabs, search, priority dropdown, source dropdown). Review list sorted Critical→High→Medium→Low, oldest first within tier. Item cards show category, source, description, suggested resolution, product/supplier context. Resolution modal with 5 action buttons: Resolve, Ignore, Add Notes, Create Product (shown only for Unknown/Missing Product categories), Create Supplier (shown only for Unknown/Missing Supplier categories). Create Product and Create Supplier open the existing form components inline — no duplicate form logic.

### Modified Files

**`app.js`** — review screen registered. goto-review navigation wired.

**`index.html`** — screen-review slot added. "Review Queue" link added to More screen.

**`sw.js`** — Bumped to v13; new DT-008 files added to precache.

**`css/components.css`** — Review workspace styles appended: rq-filter-row, rq-filter-select, rq-action-grid.

### Engineering Judgment Applied

**No schema change for priority.** The ReviewQueue.severity field uses error/warning strings from the IME. DT-008 introduces Critical/High/Medium/Low vocabulary. Mapping is applied at read time in the enrichment pass (_toPriority()) — no migration, no schema bump, no data modification. Existing records are untouched.

**Filter operations are all in-memory.** getWorkspacePayload() loads the full table once. filterItems() sorts and filters the in-memory array — no IndexedDB query per filter change. For a pharmacy with hundreds of review items, this is fast and appropriate. If the queue grows to thousands of items, a server-side filter would be warranted — but that scale indicates a different operational problem.

**Create Product / Create Supplier reuse the existing form components exactly.** buildProductForm() and buildSupplierForm() were already designed to be embeddable. The resolution panel opens them in a modal and delegates to createProductFromItem / createSupplierFromItem, which call the existing productService and supplierService — zero new business logic in the Review Workspace for product or supplier creation.

**Attention cards are tappable filters.** Tapping "3 Critical Items" applies priority: Critical to the filter state and rerenders the list. Tapping "5 from Migration" applies source: Migration. This makes the workspace genuinely navigable without requiring the user to find and set the dropdowns manually.

---

## DT-008A — Event Intelligence Framework
**Date:** 2026-07-04

### Summary
The Event Intelligence Framework is the translation layer between Operations and Commercial Intelligence. Every operational record — a receiving session, an inventory lot, a demand entry, a review resolution, a supplier lifecycle event — can now be transformed into a standardized BusinessEvent and consumed by any intelligence module without those modules knowing anything about the operational tables that produced the data. The framework is pure service layer: no UI, no DB writes, no schema changes.

### New Files

**`services/intelligence/eventModel.js`**
The standard event shape and factory function. Every BusinessEvent has: eventId, eventType, category, importance, timestamp, entityType, entityId, title, description, sourceModule, relatedEntities, evidence, metadata, synthetic. All events are frozen objects. Factory generates a collision-resistant ID (EVT-{timestamp}-{seq}). IMPORTANCE, CATEGORY, ENTITY_TYPE, SOURCE_MODULE constants exported.

**`services/intelligence/eventRegistry.js`**
Central registration for all event types. 28 built-in event types across Receiving, Inventory, Supplier, Demand, Review, Migration, and Synthetic Milestone categories. registerEventType() allows future modules to add new event types without modifying this file. getEventTypesByCategory(), getSyntheticEventTypes() for discovery. Open/Closed design: open for extension, closed for modification (existing registrations are frozen; duplicate keys throw).

**`services/intelligence/eventClassifier.js`**
Six pure classifier functions — one per source record type. classifySession, classifyLot, classifyPurchase, classifyDemand, classifySupplier, classifyReviewItem. Each takes a raw DB record and optional supporting data (product name, supplier name, contextual flags) and returns BusinessEvent[]. No DB calls inside classifiers — they only transform records already loaded by the assembler.

**`services/intelligence/importanceEngine.js`**
Context-driven importance override. The registry provides a default importance per event type; the engine applies context rules to override it. Built-in rules: near-expiry lots expiring within 30 days → CRITICAL; demand captured for zero-stock product → CRITICAL; first purchase from a supplier → SUCCESS; review item raised as error → CRITICAL. registerContextRule() allows future modules to add rules. reclassifyAll() processes a batch of assembled events in one pass.

**`services/intelligence/milestoneEngine.js`**
Configuration-driven synthetic event generation. Five milestone groups: purchaseValue (₦100K, ₦500K, ₦1M, ₦5M, ₦10M, ₦50M), sessionCount (10, 25, 50, 100), productCount (10, 25, 50, 100), partnershipDays (30, 90, 180, 365, 730), demandRepeat (5, 10, 25). All thresholds live in MILESTONE_CONFIG — changing a threshold is a data change, not a code change. detectSupplierMilestones() and detectDemandMilestones() compute all crossed thresholds from aggregates. registerMilestoneGroup() for future extensions.

**`services/intelligence/eventAssembler.js`**
The primary entry point. assembleEvents(options) orchestrates the full pipeline: 6 parallel data loads → lookup Map construction → single normalisation pass through all sources → running aggregate computation → synthetic milestone injection → importance reclassification → filter → sort → EventTimeline. Scoped loading: passing entityType + entityId constrains the DB queries to only the relevant records (supplier-scoped, product-scoped). Zero N+1 patterns — all enrichment from pre-built Maps.

**`services/intelligence/index.js`**
Clean public API. All consumers import from this file only. Internal structure can change without touching consumers.

### Modified Files

**`sw.js`** — Bumped to v14; all 7 intelligence framework files added to precache.

### Engineering Judgment Applied

**Open/Closed registry pattern.** The EventRegistry uses a Map. registerEventType() adds entries; existing entries are frozen. Future Sales module registers 'SALE_COMPLETED' without touching any core framework file. Future Pricing module registers 'PRICE_CHANGED'. The framework never needs to know about these in advance.

**Classifiers are pure functions — they never fetch.** All data loading happens in the assembler (one parallel batch). Classifiers receive pre-loaded records and return events. This keeps classifiers testable in isolation and prevents the N+1 pattern where each event triggers its own DB query.

**Milestones fire for all crossed thresholds, not just the first.** If a supplier's total purchases jump from ₦0 to ₦1.5M in one large delivery, the ₦100K, ₦500K, and ₦1M milestones all fire as synthetic events. This correctly represents all the commercial significance of that delivery, not just the most recent milestone crossed.

**Synthetic events are reproducible, not idempotent.** The same source data always produces the same set of synthetic events. They are not stored; they cannot drift out of sync. Every call to assembleEvents() recomputes them from scratch. This is intentional — persisting synthetic events would require a synchronisation mechanism that would add complexity without adding reliability.

---

## DT-008A (Semantic) — Semantic Intelligence Framework
**Date:** 2026-07-05

### Summary
The Semantic Intelligence Framework establishes the shared language between every operational module and every future intelligence module on the Dglopa Platform. Every operational event is translated into an immutable PlatformEvent carrying three independent semantic dimensions. Future intelligence engines never touch raw operational DB tables — they consume semantic events only. The framework is pure service layer: no UI, no DB writes, no schema changes.

### New Files — services/semantic/

**`eventConstants.js`** — All controlled vocabularies: IMPORTANCE (INFO/SUCCESS/WARNING/CRITICAL), STRATEGIC_INTENT (PROTECT/GROW/LEARN/OPERATE), OBLIGATION_TYPE (MANDATORY/ASPIRATIONAL/NONE), CATEGORY, ENTITY_TYPE, SOURCE_MODULE, FRAMEWORK_VERSION.

**`eventTypes.js`** — 31 canonical event type string constants. One file of truth. Import these rather than string-literal event types anywhere in the codebase.

**`eventFactory.js`** — Immutable PlatformEvent factory. createPlatformEvent() enforces all three semantic dimensions explicitly — throws on missing or invalid values. enrichEvent() allows consumers to add presentation-layer fields without mutating the original. isPlatformEvent() for gateway validation. Events are Object.freeze()d.

**`eventRegistry.js`** — Registry-based architecture; no switch statements. 31 built-in event type definitions, each carrying all three orthogonal dimensions plus a buildMetadata() function that extracts relevant fields from the raw record. registerEventType() for future modules. Open/Closed: existing registrations are frozen, duplicate keys throw.

**`importanceEngine.js`** — Answers one question only: "How urgent is this?" Five built-in context rules that override registry defaults: near-expiry lots expiring within 30 days → CRITICAL; demand for zero-stock product → CRITICAL; error-severity review item → CRITICAL; failed import → CRITICAL; synthetic milestones → SUCCESS. registerImportanceRule() for extension.

**`semanticEngine.js`** — Owns meaning, not urgency. Assigns strategicIntent and obligationType from context. Six built-in rules: near-expiry lot with qty ≥ 10 → PROTECT + MANDATORY; repeated demand count ≥ 3 → GROW + MANDATORY; unknown product review item with evidence → LEARN + ASPIRATIONAL; expired lot with remaining stock → PROTECT + MANDATORY; failed import → PROTECT + MANDATORY; first supplier purchase → GROW + ASPIRATIONAL. explainSemantics() produces human-readable explanations for future recommendation engines. registerSemanticRule() for extension.

**`milestoneEngine.js`** — Configuration-driven synthetic event generation. MILESTONE_CONFIG defines five groups (purchaseValue ₦100K–₦50M, sessionCount 10–100, productCount 10–100, partnershipDays 30–730, demandRepeat 5–25). Every synthetic milestone includes a generatedFrom explainability block. registerMilestoneGroup() for future extensions.

**`syntheticEventGenerator.js`** — Master synthetic event generator. generateSyntheticEvents() delegates to milestoneEngine for supplier and demand milestones, and directly generates platform-level synthetics (Review Queue Cleared). Every synthetic event includes a complete generatedFrom chain: operationalEvents[], ruleApplied, thresholdCrossed, aggregateUsed.

**`eventAssembler.js`** — The orchestrator. assembleSemanticEvents() runs the full pipeline: 6 parallel DB loads → lookup Maps → single normalisation pass (registry-driven, no switch) → running aggregate computation → synthetic generation → importance reclassification → semantic reclassification → filter → sort → SemanticTimeline metadata. Scoped options (entityType + entityId) constrain DB queries to relevant records only.

**`index.js`** — Single import point for all consumers.

### Engineering Judgment Applied

**Three dimensions, genuinely orthogonal.** The factory throws on missing or invalid values for all three dimensions — there is no fallback default that collapses two dimensions into one field. A WARNING event can have GROW intent (low stock = revenue risk) or PROTECT intent (near-expiry lot = capital risk). These are different meanings that require different responses. Collapsing them would make future decision engines unable to distinguish between them.

**Registry-driven normalisation pass eliminates switch statements.** Every event type in the assembler's normalisation pass is resolved by `getDefinition(eventType)`, which returns the full semantic definition including all three dimensions and a buildMetadata builder. Adding a new event type requires one new `reg(...)` call in eventRegistry.js — no changes to the assembler, no new switch case, no new if-else chain.

**explainSemantics() is not a UI concern.** The SemanticEngine's explainSemantics() function produces a human-readable string from the event's two non-urgency dimensions. This is not a UI label — it is the raw material that a future Recommendation Engine or Decision Engine will use to explain why a recommendation exists. It belongs in the framework, not in a presentation component.

**generatedFrom is a first-class citizen, not a debug field.** Every synthetic event's generatedFrom block names the rule applied, the aggregate used, and the threshold crossed. This is not logging — it is the explainability chain that ADR-051 (Semantic Intelligence Precedes Decision Intelligence) requires. Future intelligence engines must be able to traverse this chain to answer "Why does this recommendation exist?" without touching raw DB tables.

---

## DT-008B — Context Intelligence Framework
**Date:** 2026-07-05

### Summary
The Context Intelligence Framework teaches the platform how events relate to one another. Where DT-008A answers "What does this event mean?", DT-008B answers "How do these events influence each other?" Individual semantic events become contextual chains — supply chain disruptions, revenue impact signals, stock health patterns, demand signals, supplier behaviour — with confidence levels derived from evidence quality. All 10 files are pure service layer: no UI, no DB writes, no schema changes.

### New Files — services/context/

**`contextConstants.js`** — All controlled vocabularies: RELATIONSHIP_TYPE (8 types: CAUSES, RESULTS_IN, INFLUENCES, BLOCKS, DEPENDS_ON, RELATED_TO, REINFORCES, CONTRADICTS), CONFIDENCE (HIGH/MEDIUM/LOW), CONTEXT_TYPE (8 types), WINDOW_TYPE (9 types), framework versioning.

**`contextTypes.js`** — JSDoc type definitions for RelationshipDefinition, DiscoveredRelationship, RelationshipChain, ContextWindow, SupportingEvidence, Context. Runtime no-op; IDE type-checking only.

**`contextFactory.js`** — Immutable object factories: createContext(), enrichContext(), createRelationship(), createChain(), createWindow(), createEvidence(). All produced objects are Object.freeze()d.

**`relationshipRegistry.js`** — 20 built-in relationship definitions across the full Receiving→Inventory→Demand→Supplier→Review chain from the spec. Each definition: fromType, toType, relationship, label, matchPredicate (entity-level correlation), maxWindowMs, strength. registerRelationship() for future modules. Open/Closed: existing entries never modified.

**`relationshipEngine.js`** — Discovers relationships by scanning the event array against registry definitions. discoverChildren(), discoverParents(), traverseChain() (BFS, configurable depth), discoverRelated(). No analytics, no scoring. Time constraint enforcement: from.timestamp → to.timestamp ≤ maxWindowMs.

**`confidenceEngine.js`** — Evidence quality measurement, not probability. classifyConfidence() applies 5 rules: HIGH when 3+ corroborating events with 2+ relationship types and significant importance signals; HIGH when 5+ events; MEDIUM when 2+; MEDIUM when 1 CRITICAL event; LOW otherwise. assessChainConfidence() for multi-hop chains using intent consistency and importance.

**`contextWindowEngine.js`** — Groups events into 9 configurable window types. Entity-scoped windows (Invoice, ReceivingSession, Supplier, Product, Inventory, Demand) filter by entityId and related entity references. Time-scoped windows (Daily, Weekly, Monthly) compute bucket boundaries from the current timestamp. registerWindowType() for extension.

**`contextEngine.js`** — Transforms chains into contextual business knowledge. 8 pattern definitions detect context type from chain event types and categories (supply chain pattern, revenue impact pattern, stock health pattern, etc.) ordered by priority — no switch statements. _buildNarrative() produces plain-language summaries: "Supplier reliability is negatively impacting revenue." No recommendations. buildContext() delegates confidence to ConfidenceEngine.

**`eventCorrelator.js`** — Entry point. correlate() selects anchor events (CRITICAL first, then WARNING), traverses chains, builds Context objects, deduplicates overlapping chains (70% event overlap threshold), and returns an immutable ContextGraph with dominantType, criticalCount, highConfidence count.

**`index.js`** — Single import point for all consumers.

### Engineering Judgment Applied

**Relationships are configuration.** The relationship from INVENTORY_STOCK_OUT → DEMAND_CAPTURED is a data entry in the registry, not a code branch. The matchPredicate for this relationship checks `from.relatedEntities` for the same productId as the demand entry — entity-level correlation in a few lines of inline function. Adding the Sales module's relationship (SALE_COMPLETED → INVENTORY_LOW_STOCK) requires one `registerRelationship()` call.

**Context type detection is pattern-based, not switch-based.** The 8 context type patterns are objects with a `match(types, categories)` function and a `priority`. The engine sorts by priority and finds the first matching pattern. Adding a new context type (e.g. PAYMENT_RISK for when a credit supplier is approaching their limit) requires adding one entry to CONTEXT_PATTERNS — no engine modification.

**Deduplication threshold is explicit.** If two anchor events produce chains that share 70% or more of their events, the lower-priority one is dropped. This threshold is a named constant, not a magic number buried in logic. It should be made configurable in a future enhancement.

**Confidence is evidence quality, not probability.** The ConfidenceEngine documentation explicitly distinguishes these. HIGH means multiple independent corroborating sources — not "90% chance this is accurate." This distinction matters because future Decision Intelligence engines must not treat HIGH confidence as a license to act without human confirmation.

---

## DT-008C — Pattern Intelligence Framework
**Date:** 2026-07-05

### Summary
The Pattern Intelligence Framework completes the foundation stack for Commercial Intelligence. DT-008A taught events, DT-008B taught relationships, DT-008C teaches recurring behaviour. A ContextGraph[] input becomes a PatternGraph output — immutable, fully traceable back through contexts to operational records, with three independent dimensions per pattern (strength, confidence, evolution) and a plain-language summary for each. The PatternGraph is the primary input Commercial Intelligence will consume. Ten files, pure service layer, zero DB reads, zero DB writes.

### New Files — services/pattern/

**`patternConstants.js`** — Controlled vocabularies: PATTERN_STRENGTH (5 levels: VERY_LOW through VERY_HIGH), PATTERN_EVOLUTION (5 states: EMERGING/STABLE/STRENGTHENING/WEAKENING/DISAPPEARING), PATTERN_TYPE (10 types), PATTERN_RELATIONSHIP (9 types), PATTERN_WINDOW (9 types), CONFIDENCE. Implements ADR-057: strength and confidence are explicitly separate constants.

**`patternTypes.js`** — JSDoc type definitions: PatternDefinition, DetectionResult, PatternWindow, Pattern, PatternGraph, PatternRelationship. Runtime no-op; tracability chain documented: PatternGraph → Pattern → Context → PlatformEvent → OperationalRecord.

**`patternFactory.js`** — Immutable object factories: createPattern(), enrichPattern(), createPatternWindow(), createPatternRelationship(), createPatternGraph(). All objects are Object.freeze()d. createPatternGraph() computes dominantPatternType and dominantStrength automatically from the pattern set.

**`patternRegistry.js`** — 8 built-in pattern definitions. Each has a detect(contexts, window, now) function that operates on Context[] objects (not raw events or DB records). Patterns: RepeatedStockout, RepeatedDemand, ExpiryLoss, PurchaseGrowth, SupplierReliability, ReviewQueueCongestion, DeadStock, SupplierDelay. registerPattern() for future modules. Open/Closed.

**`patternWindowEngine.js`** — 8 built-in window types: Daily, Weekly, Monthly, Quarterly, Yearly, Rolling7, Rolling30, Rolling90. filterContextsToWindow() scopes a Context array to a window by checking generatedAt, primaryEvent.timestamp, and relatedEvent timestamps. registerPatternWindow() for extension.

**`patternStrengthEngine.js`** — Two engines in one file (related responsibilities). Strength Engine: classifyStrength() maps rawStrength 0..1 to PATTERN_STRENGTH via 5 threshold bands (config, not hardcoded). explainStrength() generates plain-language strength explanation. Evolution Engine: classifyEvolution() splits the analysis window in half, runs detect() on each half, compares rawStrength values — delta > 15% → STRENGTHENING/WEAKENING, early-only → DISAPPEARING, late-only → EMERGING, both-similar → STABLE. explainEvolution() for plain-language explanation.

**`patternEngine.js`** — Single analysis pass over all registered pattern definitions. For each: detect(), classifyStrength(), classifyEvolution(), classifyPatternConfidence(), createPattern(). Failed individual pattern detections are caught and logged without stopping the pass. Output sorted by strength descending. Pattern confidence is independent of event confidence: it measures how well the Context evidence supports the pattern.

**`patternCorrelator.js`** — Primary entry point. correlatePatterns(contextGraphs, options): flattens contexts from all graphs, builds a window, runs the engine, discovers inter-pattern relationships (6 built-in: AMPLIFIES, PRECEDES, COEXISTS_WITH, REINFORCES, FOLLOWS, ESCALATES), builds and returns an immutable PatternGraph.

**`index.js`** — Single import point for all consumers.

### Engineering Judgment Applied

**detect() lives in the registry, not the engine.** Pattern-specific detection knowledge belongs in the pattern definition, not scattered through a switch statement in the engine. The engine's job is to call detect(), classify the results, and build the Pattern object. This is strictly enforced: the Pattern Engine contains zero pattern-specific logic.

**Evolution splits the window in half.** Comparing early vs late sub-windows from the analysis period to determine STRENGTHENING/WEAKENING is the correct algorithm for reproducibility — it requires no historical state, only the current analysis window's contexts. The same input always produces the same evolution classification.

**Strength and confidence are separately computed.** Pattern strength comes from rawStrength in the detect() result. Pattern confidence comes from a separate function (_classifyPatternConfidence) that considers the number of corroborating contexts and whether required context types are present. These cannot influence each other — enforcing ADR-057.

**Pattern relationships are discovered from pattern set composition.** The PatternCorrelator's _discoverPatternRelationships() function looks at which patterns are present together and applies known interaction rules. REPEATED_STOCKOUT + REPEATED_DEMAND → AMPLIFIES is a business relationship, not a code relationship. Adding a new interaction rule when a new pattern type is registered requires one new block in this function — no registry changes, no engine changes.

---

## DT-009 — Cockpit Foundation
**Date:** 2026-07-05

### Summary
The Cockpit is the first presentation layer that consumes the Dglopa Cognitive Architecture. The Home tab is now the operational Cockpit workspace. The pharmacist's first view answers "What requires my attention?" before showing any information. Every insight is explainable and traceable back through Pattern → Context → PlatformEvent → OperationalRecord. The Cockpit queries no operational DB tables directly — it consumes understanding assembled by the semantic, context, and pattern layers.

### New Files — services/cockpit/

**`cockpitService.js`** — Single source of presentation data. buildCockpitPayload(events, contextGraphs, patternGraphs) assembles the full CockpitPayload: welcome header (greeting + day), business snapshot (critical count, high patterns, emerging patterns, today's activity), attention items (sorted Critical → Operational → Growth → Learning), insight cards (from PatternGraph, sorted by strength then evolution), activity feed groups (Today / Yesterday / This Week / This Month / Older), and quick actions. Consumes PlatformEvent[], ContextGraph[], PatternGraph[]. Zero DB reads.

**`cockpitLayoutEngine.js`** — Determines presentation order and visual class assignments. orderSections() excludes empty sections. attentionItemClass(), insightCardBorderVar(), evolutionIndicator(), strengthBadgeClass(), feedEventClass() — pure presentation mappings from semantic values to CSS classes and visual indicators.

**`cockpitConstants.js`** — ATTENTION_CATEGORY, CARD_TYPE, FEED_GROUP, ACTION_TYPE, SECTION_ORDER (Welcome → Snapshot → Attention → Insights → Feed → Actions).

**`cockpitTypes.js`** — JSDoc definitions: AttentionItem, InsightCard, FeedEvent, FeedGroup, QuickAction, BusinessSnapshot, CockpitPayload. Traceability chain documented: InsightCard → Pattern → Context → PlatformEvent → OperationalRecord.

### New Files — screens/cockpit/

**`cockpitScreen.js`** — Main orchestrator. Progressive loading strategy: (1) render skeleton immediately, (2) load semantic events and render initial Cockpit within 1-2 seconds, (3) build context graphs and pattern graph in the background, (4) update Attention Center and Insights when enrichment completes. Zero DB queries in the screen component.

**`attentionCenter.js`** — Renders attention items from payload.attention. Tappable cards navigate to the relevant screen. Colour-coded by category: Critical → red, Operational → amber, Growth → green, Learning → accent.

**`insightCards.js`** — Renders Pattern-derived insight cards. Each card includes title, summary, expandable "Why this matters" section with full explanation, supporting evidence list, and traceability IDs (patternId, contextId). Uses HTML `<details>` for the expandable section — progressive disclosure on mobile.

**`activityFeed.js`** — Chronological feed grouped by time. Module filter tabs. Shows 20 events per group with overflow count. Feed events use the timeline dot design from DT-005B.

**`quickActions.js`** — 6 navigation tiles in a 3-column grid. Review Queue tile shows a red badge when critical items exist.

### Modified Files

**`app.js`** — Home tab now routes to initCockpitScreen. Old `renderHome()` call removed.

**`sw.js`** — Bumped to v18; all Cockpit files added. Old screens/home.js removed from precache.

**`css/components.css`** — Cockpit styles appended: cockpit-header, cockpit-greeting, cockpit-snapshot, cockpit-actions-grid, cockpit-action-tile, cockpit-action-icon, cockpit-action-label, cockpit-action-badge, cockpit-skeleton, skeleton-pulse animation.

### Engineering Judgment Applied

**Progressive loading prevents a blank screen.** The Cockpit assembles the full cognitive stack (semantic → context → pattern) which may take 2-3 seconds on the LG G8X for a pharmacy with years of history. The skeleton renders immediately; the semantic layer (one parallel DB load) renders within 1-2 seconds; context and pattern enrichment updates the Attention Center and Insights in the background. The pharmacist never sees a loading spinner for the whole screen.

**Attention section is built before Insights section (ADR-060).** The `orderSections()` function enforces this: attention always precedes insights in the render order. The Attention Center answers "What requires my attention?" before the Insights section answers "What patterns have been detected?"

**Every insight card includes a "Why this matters" explanation (ADR-059).** The `_buildWhyItMatters()` function in cockpitService maps each PATTERN_TYPE to a plain-language business explanation written from the pharmacist's perspective. These explanations are never fabricated — they are authored once in the service layer and traced to specific pattern evidence. The `<details>` element provides progressive disclosure: the card is scannable at a glance; the explanation is available on tap.

**Traceability IDs are shown in the expanded card view.** patternId and contextId are visible in the expanded card detail (monospace, muted). This allows future debugging or audit tooling to trace any insight back to its origin without additional database queries.

---

## EPIC-001A — Commercial Intelligence Core (CIA Core)
**Date:** 2026-07-06

### Summary
CIA Core is the first Judgment Layer of the Dglopa Platform. It consumes the outputs of the Dglopa Cognitive Architecture (DT-008A/B/C) and produces four progressively higher layers of commercial understanding: Drivers → Assessments → Signals → Position. The pipeline is deterministic, stateless, fully traceable, and produces no recommendations. All 10 files are pure service layer: zero DB reads, zero DB writes, zero schema changes.

### New Files — services/commercial/

**`commercialConstants.js`** — All controlled vocabularies: DRIVER_TYPE (9 types: DemandPressure, StockoutFrequency, DeadStockAccumulation, ExpiryWaste, PurchaseCostTrend, SupplierReliability, SupplyChainRisk, DataQuality, PurchaseMomentum), DRIVER_DIRECTION (Positive/Negative/Neutral/Mixed), DRIVER_MAGNITUDE (5 levels: Negligible through Dominant), ASSESSMENT_TYPE (6 types), ASSESSMENT_SEVERITY (4 levels), SIGNAL_TYPE (6 types), SIGNAL_URGENCY (4 levels: Monitor/Attention/Urgent/Immediate), POSITION_GRADE (5 levels: Strong through AtRisk), EVIDENCE_QUALITY.

**`commercialTypes.js`** — JSDoc type definitions for all four output types: CommercialDriver, CommercialAssessment, CommercialSignal, CommercialPosition. Traceability chain documented: CommercialPosition → CommercialSignal → CommercialAssessment → CommercialDriver → Pattern → Context → PlatformEvent → OperationalRecord.

**`commercialFactory.js`** — Immutable typed value object factories for all four output types. All required fields are enforced at construction time — factories throw on missing values. All outputs are Object.freeze()d. enrichDriver/Assessment/Signal/Position() create new frozen copies for presentation-layer enrichment without mutation. ADR-063 enforced: `_noRecommendation: true` flag on every signal, `_snapshot: true` on every position.

**`commercialRegistry.js`** — Configuration-driven registries for Driver, Assessment, and Signal types. No switch statements, no hardcoded logic. registerDriverType(), registerAssessmentType(), registerSignalType() extend registries from future modules without modifying engine code (Open/Closed Principle). Duplicate keys throw.

**`driverEngine.js`** — Stage 1. computeDrivers(patterns, contexts, events) runs 9 driver compute functions, collects non-null results, and returns them sorted by rawScore descending. Each compute function is a pure function reading pattern and context arrays — no cross-driver references (ADR-064 enforced structurally). Magnitude mapping: rawScore 0..1 → DRIVER_MAGNITUDE via 5 threshold bands (configuration, not hardcoded). PATTERN_STRENGTH → rawScore mapping table. Failed individual computers are caught and logged without stopping the pass.

**`commercialAssessmentEngine.js`** — Stage 2. buildAssessments(drivers) runs 6 assessment registry entries, collects non-null results, sorts by severity (Critical first). Each detect() receives the full driver array and constructs an assessment from relevant drivers. No switch statements — registry pattern. Assessments inherit driverIds, patternIds, contextIds, evidenceQuality, and supportingEvidence from their source drivers for full traceability.

**`commercialSignalEngine.js`** — Stage 3. deriveSignals(assessments) maps each assessment to a CommercialSignal via a template registry. Signal language enforces ADR-062: no action verbs, no recommendations. Urgency is mapped from assessment severity (Critical → Immediate, Significant → Urgent, Moderate → Attention, Negligible → Monitor). Every signal carries assessmentId for traceability.

**`commercialScoringEngine.js`** — Stage 4. computePosition(drivers, assessments, signals, now) computes a composite score from driver rawScores (negative drivers subtract, positive drivers add) plus signal urgency penalties, maps to POSITION_GRADE, builds a position narrative from assessment and signal data. explainGrade() provides audit-friendly score decomposition. ADR-065: CommercialPosition carries `_snapshot: true` — stateless, reproducible, never persisted.

**`commercialCore.js`** — Single entry point. buildCommercialIntelligence({patternGraphs, contextGraphs, events}) orchestrates the four-stage pipeline in sequence, measures per-stage timing, and returns a frozen result object containing all four output arrays plus pipeline metadata (durationMs, stageTimings, inputSummary).

**`index.js`** — Single import point for all consumers.

### Engineering Improvements Applied (beyond bare specification)

**Four-stage pipeline with enforced dependency order.** The spec lists six engine components without specifying their relationship. The implementation enforces the natural dependency order as a structural pipeline: Stage 1 (Drivers) feeds Stage 2 (Assessments) feeds Stage 3 (Signals) feeds Stage 4 (Position). ADR-064 (commercial dimensions remain orthogonal) is enforced by this structure — drivers cannot reference assessments because assessments are not yet computed when drivers run.

**ADR-063: Typed value objects, not primitives.** Every factory function requires all semantic fields explicitly and throws on missing values. A CommercialSignal cannot exist without an `assessmentId` — the traceability chain is structurally enforced, not reliant on developer discipline.

**Pipeline timing instrumentation.** buildCommercialIntelligence() measures per-stage duration in milliseconds and returns this in the `pipeline.stageTimings` field. For the offline-first LG G8X target, this allows future performance monitoring without adding any infrastructure dependency.

**Signal language contract is structurally tagged.** Every CommercialSignal object carries `_noRecommendation: true`. This is not a runtime guard — it is a documentation marker that makes the ADR-062 contract visible in every signal object during development and debugging. Future Decision Intelligence engines that consume signals will see this flag and know they are consuming evaluations, not recommendations.

---

## DT-004B — Product Commercial Profile (DM-001)
**Date:** 2026-07-06

### Summary
Implements DM-001: Product Commercial Profile. The commercial reality of every product now lives in a dedicated `ProductCommercialProfiles` table and is owned by `CommercialProfileService`. Product Identity (what medicine is this?) and Commercial Profile (how should this medicine behave commercially today?) are now separated at the service and data layer. Migration is additive and backward-compatible — all existing screens continue working without modification.

### New Files

**`services/commercialProfileService.js`** — The single owner of commercial truth. Creates, reads, and updates CommercialProfiles. Key operations: `createProfile(productId)`, `getProfile(productId)`, `getProfiles(productIds[])`, `updateReplacementCostFromReceiving(productId, snapshotData)`, `updateReplacementCostManual(productId, amount, options)`, `setActiveSellingPrice(productId, price, options)`, `setPricingStatus(productId, status)`, `getPriceHistory(productId)`, `validateProfile(profile)`, `ensureProfilesForAllProducts()`. Every write operation creates an immutable `CommercialPriceHistory` record. Dual-write strategy: all writes to CommercialProfile also update legacy `Products.lastCost` (tagged [LEGACY-COMPAT]) for backward compatibility during the migration period.

**`db/migrations/008_product_commercial_profile.js`** — Migration marker for Dexie v8.

### Modified Files

**`db/database.js`** — Dexie v8: `ProductCommercialProfiles` table (`&id, &productId, pricingStatus, updatedAt`). `CommercialPriceHistory` table (`&id, productId, changeType, changedAt`). `runMigration008()` seeding function: seeds one CommercialProfile per existing product from `Products.lastCost` and `InventoryLots.sellingPrice`. Idempotent — safe on every startup. Migration 008 registered in `_recordMigrations()`.

**`utils/idGenerator.js`** — Added `CommercialProfile: 'CPS'` and `CommercialPriceHistory: 'CPH'` prefixes.

**`services/receivingCommitService.js`** — Added Stage 4B: after updating `Products.lastCost` (legacy), calls `updateReplacementCostFromReceiving()` to post a Verified snapshot to the CommercialProfile. Also calls `setActiveSellingPrice()` if any receiving line carries a selling price. Both calls are wrapped in `.catch()` — failure is logged as a warning but does not abort the receiving commit (non-fatal by design during migration period).

**`services/inventoryService.js`** — `getProductInventoryDetail()` now loads the CommercialProfile via `getProfile()` and reads `activeSellingPrice` from it, falling back to legacy lot-level `sellingPrice` if no profile exists. Returns `replacementCostSnapshot`, `pricingStatus`, and `commercialProfile` in the detail object. `getDashboardSummary()` bulk-loads profiles via `getProfiles()` and uses `cp.activeSellingPrice` for retail value calculations.

**`services/productService.js`** — `createProduct()` calls `createProfile(id)` after writing the product record. Non-fatal: if profile creation fails, the product is still created and the error is logged.

**`screens/products/productProfile.js`** — "Coming in Future Tickets" placeholder replaced with a real Commercial Profile section. Displays: selling price, replacement cost amount, source, supplier, timestamp, confidence (colour-coded), pricing status badge, profile version, last updated. `buildProductProfile()` accepts an optional third argument `commercialProfile`.

**`screens/products/productsScreen.js`** — `_openProfile()` now loads the CommercialProfile in parallel with the supplier lookup and passes it to `buildProductProfile()`.

**`sw.js`** — Bumped to v20. New files added to precache.

### Architectural Notes

**DM-001 boundary is enforced by service ownership.** `CommercialProfileService` is the only module that writes to `ProductCommercialProfiles`. All other modules (inventoryService, receivingCommitService) call CommercialProfileService methods — they do not write to the table directly.

**Dual-write is explicit and tagged.** Every legacy write in CommercialProfileService is marked `[LEGACY-COMPAT]`. This makes the migration debt visible during code review and searchable. `grep '[LEGACY-COMPAT]'` returns all dual-write lines.

**ReplacementCostSnapshot is a typed value object.** It carries: `amount`, `supplierId`, `supplierName`, `source`, `timestamp`, `confidence`. A receiving commit produces `confidence: 'Verified'`. A manual entry produces `confidence: 'Medium'` by default, `'High'` if the pharmacist explicitly confirms. A migration-seeded snapshot is `confidence: 'Low'` — the provenance is unknown. EPIC-001B (PIE) can use this confidence level in the Survival Floor calculation.

---

## DT-004C — Inventory Commercial Migration
**Date:** 2026-07-06

### Summary
Completes the migration of all inventory-facing commercial reads to the canonical Product Commercial Profile (DM-001). After DT-004C, no inventory screen derives selling price from `InventoryLots.sellingPrice` as a primary source. The data flow is now: Receiving → CommercialProfile → InventoryService → Inventory UI. `InventoryService` is a consumer, not an owner, of commercial data.

### Files Modified (2)

**`services/inventoryService.js`**

1. Added missing import of `getProfile`, `getProfiles`, `PRICING_STATUS` from `commercialProfileService.js` (gap left by DT-004B).
2. `_buildInventoryRow(product, lots, now, nearExpiryMs, commercialProfile = null)` — new fifth parameter. Reads `activeSellingPrice` from CommercialProfile first, falls back to `latestPricedLot?.sellingPrice` only if no profile. Reads `replacementCostSnapshot.amount` from CommercialProfile, falls back to `product.lastCost` [LEGACY-COMPAT]. Returns `pricingStatus` and `replacementCost` in the row object.
3. `getInventoryList()` — now calls `getProfiles(products.map(p => p.id))` in parallel with `db.InventoryLots.toArray()`. One bulk read for all profiles per list call. Passes `listProfileMap.get(product.id)` to each `_buildInventoryRow()` call.
4. `getDashboardSummary()` — retail value calculation already had `profileMap` from DT-004B but was still reading `latestPricedLot.sellingPrice` as the primary value. Fixed: now reads `cp?.activeSellingPrice ?? latestPricedLot?.sellingPrice ?? 0`.
5. File header updated with DT-004C legacy field audit documentation.

**`screens/inventory/inventoryScreen.js`**

1. Detail modal: replaced `_prow('Last Cost', product.lastCost …)` with `_prow('Replacement Cost', d.replacementCostSnapshot?.amount …)`. Confidence level shown inline in muted text. Falls back to `product.lastCost (legacy)` if no snapshot.
2. Detail modal: `_prow('Pricing Status', _pricingStatusBadge(d.pricingStatus))` added — only shown when a CommercialProfile exists.
3. Product list cards: `pricingStatus` badge added next to the stock status badge. `ReviewRequired` → amber "Review", `AtRisk` → red "At Risk", `ManualOverride` → accent "Manual". No badge for `Current` — no noise when pricing is healthy.
4. `_pricingStatusBadge(status)` helper added.

**`sw.js`** — Bumped to v21.

---

## DT-004A — Quick Replacement Cost Update
**Date:** 2026-07-06

### Summary
Implements the fastest possible workflow for updating a product's replacement cost from OCP-001. The modal targets ≤5 seconds from open to saved and two taps maximum. All writes go through `CommercialProfileService.updateReplacementCostManual()` — the service owns the write, this module owns only the UX.

### New Files

**`screens/products/quickCostUpdate.js`** — Shared modal component. `openQuickCostUpdate(productId, productName, { onSaved, onCancel })` is the single entry point. Loads the current CommercialProfile and active Suppliers in parallel before rendering. Form fields: Cost Amount (autofocused, full-select on focus for fast overwrite), Source (Supplier Quote / Market Survey / Manual Estimate), Supplier (optional dropdown from active suppliers), Confidence (High / Medium / Low — radio buttons with descriptions), Notes (optional). Source selection auto-updates the Confidence radio. On save: calls `updateReplacementCostManual()`, loads updated profile, fires `onSaved(updatedProfile)`. PricingStatus is set to `ReviewRequired` inside the service — this module does not set it directly. Future search-result action entry point: call `openQuickCostUpdate()` directly — no changes to this file needed.

### Modified Files

**`screens/products/productsScreen.js`** — Added import `openQuickCostUpdate`. Added "Update Cost" button to the profile modal action bar (non-merged products only). On click: closes the profile modal, opens the quick update modal, re-opens the profile modal on save to show refreshed data.

**`screens/inventory/inventoryScreen.js`** — Added import `openQuickCostUpdate`. Added "Update Replacement Cost" button in the product detail modal (after the commercial fields grid). Wired in `_openProductDetail()`: button click opens the quick update modal, re-opens the detail on save.

**`css/components.css`** — Quick Cost Update styles: qcu-product-name, qcu-prev-cost, qcu-amount-input (large mono font for fast reading), qcu-confidence-row (vertical stacked radio cards with tap target size), qcu-conf-label (full-width tap area, accent highlight when checked), qcu-actions (top border, bottom positioning for thumb reach).

**`sw.js`** — Bumped to v22. `quickCostUpdate.js` added to precache.
