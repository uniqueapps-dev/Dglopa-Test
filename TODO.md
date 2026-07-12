# TODO.md

## Pending work beyond DT-003A

This document tracks what was intentionally deferred from the Intelligent
Migration Engine framework, to be picked up in DT-003B (commit logic) and
later tickets.

---

### DT-003B — Migration Commit ✅ COMPLETE

### DT-003C — Future IME Enhancements (next)

- [x] All DT-003B items implemented — see CHANGES.md for detail.
- [ ] Persist Review Queue entries to db.ReviewQueue via bulkAdd() — shape is already schema-matched, see reviewQueueBuilder.js.
- [ ] Create new Products for unmatched rows, respecting DT-002 validation (required Product Name, Dosage Form, Base Unit; duplicate detection via normalizedName).
- [ ] Create new Suppliers for unmatched supplier names.
- [ ] Create InventoryLots for each valid row (LOT-NNNNNN via idGenerator.js).
- [ ] Write StockMovements entries for each lot created.
- [ ] Write PurchaseHistory entries per row.
- [ ] Block commit if any row has unresolved error-severity issues; allow commit with warning-severity issues present given explicit user acknowledgment.
- [ ] Wrap the entire commit in a single Dexie transaction — all-or-nothing.
- [ ] Add an undo/rollback path for a completed import.

### Review & Resolution UI (not in DT-003A scope)

- [ ] Inline row editing in the Import Preview — fix a missing unit or correct a quantity without re-uploading the file.
- [ ] "Assign Supplier" / "Create New Supplier" action directly from a no-match row.
- [ ] "Link to Existing Product" picker for fuzzy/no-match rows.
- [ ] Bulk actions — apply a supplier or unit to all matching blank rows at once.

### Adapter Expansion (stubs exist, not implemented)

- [ ] PDF adapter — needs a PDF-to-table extraction approach; evaluate options before DT-004+.
- [ ] AI Image Extraction adapter — requires an LLM vision call (OpenRouter, matching the existing PBSRx AI Snap pattern).
- [ ] Camera Capture adapter — needs a capture UI component feeding into the AI Image adapter.
- [ ] Clipboard Paste adapter — needs a paste-event listener parsing tab/comma-separated clipboard text into a RawSheet.

### Matching Engine Improvements

- [ ] Multi-sheet workbook support — currently only the first sheet is read.
- [ ] Configurable fuzzy-match threshold — consider Levenshtein distance for better typo tolerance.
- [ ] More granular match confidence scoring beyond exact/alias/fuzzy/none.
- [ ] Duplicate detection against existing InventoryLots, not just within the uploaded workbook.

### Review Queue

- [ ] Persisted Review Queue UI — browse all pending ReviewQueue entries across past imports.
- [ ] AssignedTo and DueDate are currently always null — wire up once staff/user accounts exist.

### General

- [ ] Column-mapping override UI for headers that don't match any known alias (currently silently ignored).
- [ ] File size / row count limits with a friendly warning before parsing very large workbooks.
- [ ] Internationalize currency symbol stripping if multi-currency support is ever needed.

### DT-003C — Multi-sheet import (validated need)
- [ ] Allow importing all sheets from one workbook upload in a single operation.
- [ ] Sheet selection UI (checkboxes per detected sheet, with layout type shown).
- [ ] Sequential commit — each sheet is one ImportAudit record; all or nothing per sheet.

### DT-003D — Post-import price entry workflow (validated gap)
- [ ] Bulk selling price entry screen for the 401 shelf products that imported without price data.
- [ ] Bulk unit cost entry for the same set.
- [ ] Could surface directly from the ImportAudit record (filter lots with null sellingPrice).

### DT-004 — Stock level reconciliation
- [ ] Compute balanceAfter on StockMovements (currently always null).
- [ ] Real-time stock level per product/lot from StockMovements history.
- [ ] FEFO (First Expired, First Out) lot selection order for sales.

### DT-005 — Import undo
- [ ] Delete all records written in a given ImportAudit batch using IMP-NNNNNN as the rollback anchor.
- [ ] Show which lots, products, and movements were created in a given batch.

### DT-004B — Receiving enhancements (from implementation review)
- [ ] Supplier creation inline during receiving (currently routes to "use Suppliers module first" message).
- [ ] New product creation inline during receiving (currently routes to Review Queue — add "Create Product" action directly from the unresolved line in the review screen).
- [ ] Batch-import all lines from a pasted table (clipboard paste for rapid manual entry of multi-line invoices).
- [ ] Receiving session draft auto-save (currently lines are in-memory only; closing the screen loses unsaved lines).

### DT-005B — Supplier enhancements (from implementation)
- [ ] Payment tracking — record payments against supplier invoices; compute outstandingCredit and availableCredit from real data.
- [ ] Performance scoring algorithm — implement deliveryReliability, priceStability, invoiceAccuracy once sufficient transaction history exists.
- [ ] Supplier inline creation from Receiving Dashboard — currently directs user to the Suppliers module first.
- [ ] Preferred supplier auto-suggestion on Product Profile — show preferredSupplierId from Products table in the profile.
- [ ] Supplier price history — track unit cost evolution over time per supplier/product pair (seeds for pricing intelligence).

### DT-006B — Inventory enhancements (from implementation)
- [ ] Stock adjustment workflow — manually correct quantity on a lot (damaged, counted wrong, sample used).
- [ ] Reorder point per product — the LOW_STOCK_THRESHOLD is currently a global constant (10 units). Make it per-product and configurable.
- [ ] Category and supplier filter dropdowns on the inventory list screen.
- [ ] Batch number search in the inventory screen (searchByBatchNumber is implemented in the service but not surfaced in the UI yet).
- [ ] Expiry timeline visual — a simple date-sorted bar showing when lots expire (weeks/months grouping).
- [ ] Export inventory list to CSV.

### DT-005B — Timeline enhancements
- [ ] Tap-to-navigate on timeline event related links (session, lot, review) — currently rendered as styled tags but click handlers not wired to navigation.
- [ ] Pagination or virtual scroll for suppliers with 500+ timeline events.
- [ ] Export timeline as PDF or text for commercial dispute resolution.
- [ ] Payment events (when payment tracking is implemented) — hook already present in EVENT_TYPES as placeholder comment.
- [ ] Price change events (when PriceHistory is populated) — hook present.

### DT-007B — Demand Log enhancements
- [ ] AI OCR integration — wire attemptOCR() to an OpenRouter vision call to extract product name and quantity from a prescription or pack photo automatically.
- [ ] Bulk demand entry — paste a list of product names to log multiple entries at once.
- [ ] "Convert to Receiving Session" action — link a demand entry to a new ReceivingSession when the product is ordered.
- [ ] Demand trend chart — visualise request frequency over time per product.
- [ ] Configurable DEMAND_REASONS — store reasons in a lookup table (same pattern as Units, DosageForms, Categories) so pharmacist can customise them.
- [ ] Export demand log to CSV for supplier negotiation.

### DT-008B — Review Workspace enhancements
- [ ] Bulk selection and bulk resolve/ignore — for clearing large batches of IME-generated items after a successful import review.
- [ ] Assignment (assignedTo field) — assign items to named staff members once a user/staff model is implemented.
- [ ] Due date management — set and edit dueDate per item; surface overdue items in the Attention Center.
- [ ] Evidence viewer in review items — link demand evidence images to their related review queue entries.
- [ ] Review Queue badge on the More tab — show the count of open Critical items as a notification badge.
- [ ] Resolution time analytics — chart resolution time trends over time per source module.

### DT-008B — Intelligence Framework consumers
- [ ] Platform Event Dashboard — UI that calls assembleEvents() and renders the full timeline with category/importance filters.
- [ ] Supplier Intelligence Screen — calls assembleEvents({ entityType: ENTITY_TYPE.SUPPLIER, entityId }) to replace the Supplier Timeline with richer framework-powered events.
- [ ] Inventory Intelligence — calls assembleEvents({ categories: [CATEGORY.INVENTORY] }) to power expiry and stock-level analytics.
- [ ] Demand Intelligence — calls assembleEvents({ categories: [CATEGORY.DEMAND] }) to surface repeated demand signals and purchasing recommendations.
- [ ] Milestone Dashboard — surfaces all crossed milestones across all suppliers and products; calls assembleEvents({ includeSynthetic: true }).
- [ ] Sales module event types — register SALE_COMPLETED, SALE_REFUNDED, SALE_PARTIAL etc. via registerEventType() once the Sales module is built.

### DT-008B — Semantic Extensions
- [ ] SALE_COMPLETED, SALE_REFUNDED, SALE_PARTIAL event types — register via registerEventType() once the Sales module is built.
- [ ] PRICE_CHANGED event type — register once PriceHistory is written.
- [ ] PAYMENT_RECORDED event type — register once payment tracking is implemented.
- [ ] Semantic tagging — attach structured tags to events for pattern detection (deferred per spec to DT-008B).
- [ ] Event correlation — detect that a DEMAND_REPEAT_DETECTED and an INVENTORY_STOCK_OUT for the same product are related (deferred to DT-008C).

### DT-008C — Event Analytics Engine
- [ ] assembleSemanticEvents() with time-window aggregation (week, month, rolling 30-day).
- [ ] Pattern detection — detect that DEMAND_REPEAT_DETECTED appears for the same product 3 weeks in a row.
- [ ] Event relationship graph — link DEMAND_CAPTURED → INVENTORY_STOCK_OUT → RECEIVING_SESSION_COMPLETED for the same product.
- [ ] Analytics dashboard consuming CATEGORY.COMMERCIAL events only.

### DT-008C — Event Analytics Engine
- [ ] Time-window aggregation over semantic events (week/month/rolling 30-day).
- [ ] Pattern detection using Context objects — detect that SUPPLY_CHAIN context appears 3 consecutive weeks for the same supplier.
- [ ] Context relationship graph visualisation (future UI ticket).
- [ ] Deduplication improvement — use entity identity as primary deduplication key, not event overlap ratio.
- [ ] Configurable deduplication threshold (currently hardcoded at 70%).
- [ ] Register Sales module relationships once the Sales module is built: SALE_COMPLETED → INVENTORY_LOW_STOCK, SALE_REFUNDED → REVIEW_ITEM_RAISED.

### DT-009 — Operational Dashboard (first UI consumer of Pattern Intelligence)
- [ ] Dashboard screen that calls correlatePatterns() and renders the PatternGraph.
- [ ] PatternGraph summary cards (dominant type, high-strength count, emerging patterns).
- [ ] Pattern detail view (patternSummary, evolution, supportingEvidence).
- [ ] Inter-pattern relationship visualisation.

### EPIC-001 — Commercial Intelligence
- [ ] Consumes PatternGraph as primary input.
- [ ] Pricing signals from REPEATED_DEMAND + EXPIRY_LOSS patterns.
- [ ] Supplier recommendation signals from SUPPLIER_RELIABILITY + PURCHASE_GROWTH patterns.
- [ ] Stock ordering signals from REPEATED_STOCKOUT + DEAD_STOCK patterns.
- [ ] Register 'PricePressure', 'MarginCompression', 'ReplacementCostInflation' patterns via registerPattern().

### DT-009B — Cockpit Enhancements
- [ ] Pull-to-refresh gesture to reload the Cockpit with fresh event assembly.
- [ ] Cockpit personalisation — pharmacist name in the welcome header (stored in Settings).
- [ ] "Focus mode" — a minimal view showing only Attention Center and Quick Actions when the queue is large.
- [ ] Last updated timestamp with auto-refresh after 15 minutes of inactivity.
- [ ] Cockpit export — snapshot of the current Cockpit state as a PDF for management reporting.

### EPIC-001 — Commercial Intelligence (next major milestone)
- [ ] Consumes PatternGraph as primary input.
- [ ] Pricing signal generation from REPEATED_DEMAND + EXPIRY_LOSS pattern combinations.
- [ ] Supplier recommendation signals from SUPPLIER_RELIABILITY + PURCHASE_GROWTH patterns.
- [ ] Stock ordering signals from REPEATED_STOCKOUT + DEAD_STOCK combinations.
- [ ] Integration back into the Cockpit via new CARD_TYPE.COMMERCIAL_SIGNAL.

### EPIC-001B — Commercial Risk Engine (next)
- [ ] Dedicated risk scoring per DRIVER_TYPE with configurable risk thresholds.
- [ ] Risk portfolio view — all active risks ranked by commercial severity.
- [ ] Risk trend tracking — compare current risk profile against previous assessment.

### EPIC-001C — Commercial Opportunity Engine
- [ ] Opportunity scoring from GROWTH_OPPORTUNITY assessments and GROWTH_SIGNAL signals.
- [ ] Opportunity prioritisation by estimated revenue impact.

### EPIC-001D — Commercial Health Engine
- [ ] Six health dimensions: Profitability, Inventory, Supplier, Demand, Capital, Operational.
- [ ] Each dimension consumes CommercialSignal[] rather than operational tables.
- [ ] Health dimensions aggregate into an overall health score.

### EPIC-002 — Cockpit Integration
- [ ] Integrate CommercialPosition into the Cockpit Foundation (DT-009).
- [ ] New CARD_TYPE.COMMERCIAL_SIGNAL for the Cockpit Insight Cards section.
- [ ] Position grade visible in the Cockpit Business Snapshot.
- [ ] Signals sorted by urgency (Immediate first) in the Attention Center.
