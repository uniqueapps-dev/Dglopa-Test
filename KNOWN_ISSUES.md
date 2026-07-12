# KNOWN_ISSUES.md

## DT-003A — Intelligent Migration Engine Framework

Documented limitations of the current build. None of these block the
acceptance criteria for DT-003A (preview-only, zero writes), but should be
understood before relying on this for production receiving.

---

### Parsing

- Only the first sheet of a multi-sheet workbook is read. If a supplier sends a workbook with multiple tabs, only the first is processed. No warning is shown that other sheets exist.
- Header detection is alias-list based, not fuzzy. A column literally titled "Prod. Name" or "Item Desc" will not map to productName unless added to the alias list in normalizer.js. Unmapped columns are silently dropped.
- Date parsing assumes DD/MM/YYYY for ambiguous numeric dates (Nigeria locale convention). A workbook using MM/DD/YYYY with an ambiguous date like 03/04/2026 will be misread as 3 April rather than 4 March. Unambiguous dates (day greater than 12) parse correctly regardless of convention.
- Currency stripping is hardcoded to Naira, Dollar, Pound, Euro symbols. Any other currency symbol will cause unitCost/sellingPrice to fail parsing and be flagged as missing.

### Matching

- Fuzzy product matching is substring-based, not similarity-scored. "Paracetamol 500mg" will match "Paracetamol" by substring, but a misspelling like "Paracetmol" will not match anything and will be treated as a new product. No edit-distance matching is implemented yet.
- Supplier fuzzy matching has the same substring limitation.
- Duplicate detection is intra-workbook only. The engine does not check the uploaded workbook against existing InventoryLots already in the database — it only detects duplicates within the same upload.

### Validation

- Detection of "no expiry column present" vs "column present but blank" is approximate. The check looks for any raw column header containing "exp" or "expiry"; a sheet using a different word (e.g. "Best Before") will not trigger expiry validation at all.
- No maximum file size or row count guard. A very large workbook will be parsed in full in-browser, which may be slow on low-end Android devices. No chunking or streaming is implemented.

### UI / UX

- No inline editing. If a row has an issue, the only way to fix it today is to edit the source spreadsheet and re-upload.
- No persisted history. Closing the Receive screen discards the current preview entirely — by design, since nothing is written to the database yet.
- Large previews are not paginated. A 500-row workbook renders 500 row cards in a single scrollable list.

### Architecture / Future Format Stubs

- PDF, AI Image, Camera, and Clipboard adapters are registered but throw immediately if invoked. They exist purely to prove the SourceAdapter interface generalizes — there is no partial functionality to test yet.

---

### Not Issues (Working As Designed)

- Zero database writes is intentional per DT-003A scope, not a bug. Nothing is persisted until DT-003B implements the commit step.
- No "Confirm Import" button exists anywhere in the UI. Also intentional — DT-003A is preview-only.

---

## DT-003B — Production Commit Engine

- **ID pre-allocation generates a fixed upper-bound pool of IDs.** If fewer rows actually commit than the pool size (which is always true since the pool is sized to the maximum possible, not the actual), the unused IDs are permanently consumed from the sequence counter. This means IDs will not be perfectly contiguous across imports. The IDs are still unique and immutable — this is a cosmetic gap, not a data integrity issue.

- **`balanceAfter` field in StockMovements is always null.** A proper running-balance calculation requires reading all prior movements for a product/lot before writing the new one. This is deferred to a future stock-level service rather than computed at import time, since computing it inside the commit transaction would require additional reads that would significantly lengthen lock time for large imports.

- **Rollback works for Dexie IndexedDB writes, but not for ID sequence counters.** If a commit fails and rolls back, the pre-allocated IDs that were consumed from the Settings sequence counters are not returned. The sequence moves forward even on a failed import. IDs are gap-free within a single successful import but not across the application lifetime. This is a known limitation of pre-allocating IDs outside the main transaction (a deliberate design tradeoff to avoid deadlocks — see CHANGES.md).

- **No undo/rollback path after a successful commit.** Once ImportAudit records `overallResult: 'Success'`, there is no built-in mechanism to reverse the import. Future implementation could use the ImportAudit ID as a rollback anchor to find and delete all records written in that batch, but this is not implemented yet.

---

## DT-003BV — Validation Findings (Residual Known Issues)

- **Single-sheet import only.** The IME always reads the first sheet of any uploaded workbook. Importing a 12-sheet Migration Workbook requires 12 separate uploads (one per shelf sheet). Multi-sheet import is deferred to a future ticket (DT-003C).

- **Consignment import order dependency.** If shelf workbooks are imported before the consignment workbook, the 53 cross-workbook product matches will create duplicate Products instead of matching. The recommended import order (Consignment first, Shelf second) is documented but not enforced by the UI.

- **'Not Clear' expiry routes to Review Queue, not committed.** Shelf_01/Mixanal Tablets will always be in the Review Queue after import with an Invalid Expiry error until staff correct the expiry date in the source workbook or manually update the lot after import.

- **Supplied Qty (consignment workbook) is not stored as a canonical field.** It is preserved in row._raw but not mapped to a named field in NormalizedRow. PurchaseHistory currently records the Counted Qty as the import quantity; the supplier-claimed Supplied Qty (needed for variance reconciliation) is not yet persisted.

---

## DT-004 — Receiving Workflow

- **Lines are in-memory only until committed.** If the user navigates away from an open receiving session without committing, all entered lines are lost. The session record itself is persisted (Draft status) but the lines are not. Future: persist lines to a ReceivingLines table between saves.

- **`balanceAfter` on StockMovements is still null.** The stock level engine is deferred (DT-004/stock reconciliation). currentStock on Products is a denormalized aggregate updated at commit time, but per-movement running balances are not computed.

- **Supplier creation is not available inline.** If a supplier is not in the Suppliers table, the user must navigate to the Suppliers module (not yet built) to add them before starting a receiving session. A message guides them to do this.

- **New product creation from within the Receiving Review screen is not yet implemented.** Unresolved lines (no product match) go directly to the Review Queue. Staff can then create the product via the Product Master and re-receive. Future: add an inline "Create Product" action on the Review screen.

---

## DT-005 — Supplier Relationship Management

- **Credit utilisation always shows as pending.** Outstanding credit and available credit cannot be computed until payment tracking is implemented. The fields are scaffolded in the profile but display placeholder text.

- **Performance framework metrics are all null.** deliveryReliability, priceStability, invoiceAccuracy, availability, responseTime, and relationshipScore are stored as null placeholders. No scoring algorithm is implemented yet (deferred per spec).

- **Supplier creation is not available inline from Receiving.** The Receiving Dashboard directs users to the Suppliers module to create a supplier first. This is intentional — "never silently create suppliers" per DT-004 spec — but the user experience requires navigating away from an in-progress receiving session.

- **Duplicate supplier name check is case-sensitive exact match.** "Quicksave" and "quicksave" would be treated as different suppliers. A case-insensitive check is in findSupplierByName but only exact matches are blocked — fuzzy-similar names (e.g. "Quicksave Ltd" vs "Quicksave Limited") are not caught.

---

## DT-006 — Live Inventory

- **`currentStock` on Products may lag briefly after a receiving commit.** The receivingCommitService computes currentStock by summing all active lot quantities and writing it to the Product record inside the same transaction. If a lot is edited outside this flow (e.g. directly via a future stock adjustment), the denormalized currentStock will drift until the next receiving commit triggers a recompute. The inventory dashboard's getInventoryList computes stock live from InventoryLots, bypassing the denormalized field, so the list view is always accurate — only the Products.currentStock field itself may be slightly stale.

- **LOW_STOCK_THRESHOLD is a global constant (10 units).** Every product uses the same threshold regardless of its typical volume. A product that normally stocks 500 tablets will not show Low Stock until it drops below 10 — which may be genuinely critical for that product. Per-product reorder points are deferred to a future ticket.

- **Fast Moving and Slow Moving filter tabs exist but are placeholders.** These filters return the full unfiltered list because sales data does not yet exist. The tabs are visible to demonstrate future intent but they have no filtering effect today.

- **Health framework fields (inventoryHealth, stockQuality, expiryRisk, capitalUtilization) are all null.** These are structural placeholders in the product detail. Algorithms for computing them require sufficient transaction history and are deferred to Inventory Intelligence.

- **Retail Value and Gross Margin will show — for inventory lots with no selling price.** The estimated gross margin is computed as Retail Value − Inventory Value. If no lot has a selling price (which is common for general inventory lots imported from the shelf workbook before prices are entered), the retail value shows — and the margin calculation is not meaningful.

---

## DT-005A — Supplier Workspace

- **Outstanding Credit always shows — (dash).** Credit utilisation is a placeholder until the payment tracking module is built. The Attention Center notes this explicitly rather than showing misleading zeros.

- **Workspace re-loads on every tab navigation.** Module-level `_view` state persists within a session so switching between Workspace and Directory is instant, but navigating away to another tab and back triggers a fresh getWorkspaceSummary() load. For a pharmacy with hundreds of suppliers and thousands of purchase records this is still fast (5 parallel reads), but a future optimisation could cache the workspace payload with a short TTL.

- **"Inactive Suppliers" detection uses 90 days as a hardcoded threshold.** Suppliers with no delivery in 90+ days are flagged. This may be too sensitive or not sensitive enough depending on the pharmacy's ordering cycle. Make configurable per-supplier in a future ticket.

- **Recent Price Changes attention card is not implemented.** PriceHistory table exists but is not yet populated (no sales or price-update workflow). This attention item will surface automatically once PriceHistory data is written.

---

## DT-005B — Supplier Timeline

- **Related-record links in timeline cards are not yet navigable.** The "View session →" and "View lot →" meta-tags render correctly and have data attributes (data-nav, data-id) but click handlers to navigate to the referenced records are not wired. This requires a cross-screen navigation API that doesn't yet exist for lot and review detail views.

- **AuditLog primary key varies.** The AuditLog table uses `++_rowid` in some schema versions and `++id` in earlier ones. The timeline service uses `entry._rowid || entry.id || Math.random()` as a fallback ID for deduplication. This is safe but inelegant — a stable event ID would be cleaner.

- **ReviewQueue timeline events use `notes.includes(supplierId)` for supplier association.** This is a text search on the notes field, not a proper FK. It works because the receiving commit service writes the sessionId into the notes field, and sessions are supplier-linked. A future schema improvement would add a supplierId field to ReviewQueue directly.

---

## DT-007 — Demand Log

- **Evidence images are stored as base64 in IndexedDB with no size limit enforced.** A high-resolution camera photo can be several MB. Storing many large images will inflate the IndexedDB store and may eventually cause storage pressure on low-storage Android devices. Future: compress images to a maximum dimension (e.g. 1024px) before storing, or enforce a file size warning.

- **OCR returns null for all images.** attemptOCR() is a placeholder hook — it always returns null in DT-007. Product name and quantity from an image must be entered manually into the form fields or the evidenceNotes field. This is documented in the UI as "Transcribe any text visible in the image…"

- **Estimated lost revenue is approximate.** The estimatedPrice field is optional and manually entered. For demand entries without a price, the entry contributes to missing-unit counts but not to the revenue estimate. The estimatedLostRevenue total will undercount unless prices are consistently entered.

- **"Convert to Receiving Session" is not yet implemented.** The convertDemand() function sets status to "Converted to Purchase" and links a sessionId, but the UI does not yet offer a way to create a new session from a demand entry. This requires a cross-module navigation that is deferred to a future ticket.

---

## DT-008 — Review Workspace

- **Review Queue badge on the More tab is not implemented.** The count of open Critical items is computed in the workspace but not surfaced as a navigation badge on the bottom nav. The More tab looks identical whether there are 0 or 50 critical items pending.

- **Bulk actions are not implemented.** After an IME import that produces 100 warning-severity items (e.g. missing selling price on every row), each must be resolved individually. Bulk resolve/ignore is deferred to DT-008B.

- **assignedTo and dueDate are visible in the schema but not editable in the UI.** These fields exist in the ReviewQueue table from DT-002 but the Review Workspace does not yet provide a way to set them. Assignment requires a staff/user model; due dates require a date-picker action in the resolution modal.

- **Source inference is heuristic, not explicit.** _inferSource() guesses the originating module from the item's category string. Items with unusual or custom categories may be classified as System when they actually originated from a specific module. Future: add a source field written at creation time by each module.

- **Evidence viewer is not connected.** Demand entries with evidence (image/prescription) write to the Demand table, not to ReviewQueue. Review items generated from demand do not carry a link back to the demand evidence. The hasEvidence field on enriched items is always false.

---

## DT-008A — Event Intelligence Framework

- **assembleEvents() with no scope options loads all tables.** For a pharmacy with years of data (thousands of lots, sessions, purchases), the full unscoped assembly may become slow. Scoped calls (entityType + entityId) are always faster. Future: add server-side cursor-based pagination for very large datasets.

- **Synthetic milestone events fire for ALL crossed thresholds on every call.** If a supplier has ₦3M in total purchases, the ₦100K, ₦500K, and ₦1M synthetic events appear in every assembled timeline. This is by design (reproducibility), but means a milestone-only view should always filter `synthetic: true` events by threshold.value to show only the highest crossed milestone, not all of them.

- **reviewItems scoped load is not implemented.** The _loadReview() function always returns all ReviewQueue items regardless of entityType/entityId scope, because ReviewQueue does not have consistent entity FK fields. For a supplier-scoped assembly, this means all review items are loaded and classified, then filtered by chronological sort. Not a correctness problem; potentially a performance issue at large queue sizes.

- **The eventId sequence counter (_seq) resets on every page load.** EVT-{timestamp}-{seq} IDs are unique within a session but not globally unique across sessions. They are not persisted, so this is not a data integrity issue — but any code that stores eventId as a reference will receive a different ID for the same logical event on the next page load.

---

## DT-008A (Semantic) — Semantic Intelligence Framework

- **ReviewQueue is always fully loaded regardless of scope.** _load('ReviewQueue', ...) ignores entityType/entityId because ReviewQueue lacks consistent FK fields. For a supplier-scoped assembly, all review items are loaded, classified, and then filtered by the sort pass. Not a correctness issue; a potential performance issue if the review queue grows to thousands of items.

- **Semantic context rules are evaluated in registration order; first-match wins.** If two rules apply to the same event type, only the first registered rule's override takes effect. This is intentional (explicit precedence over emergent behaviour) but requires rule authors to be aware of ordering when using registerSemanticRule().

- **assembleSemanticEvents() is called fresh on every invocation.** There is no caching. For a pharmacy with five years of operational history and thousands of events, a full unscoped call may take several seconds on the LG G8X. Scoped calls (entityType + entityId) remain fast. Future: add a lightweight cache with a short TTL for the full-platform assembly.

- **eventId is session-unique, not globally unique.** EVT2-{timestamp}-{seq} IDs are unique within one page load session. The seq counter resets to zero on every reload. This is not a data integrity issue (events are never persisted) but means any code that stores an eventId as a cross-session reference will receive a different ID for the same logical event on the next page load.

---

## DT-008B — Context Intelligence Framework

- **O(n²) relationship discovery.** discoverChildren() and discoverParents() scan the full event array for each primary event. For an entity-scoped assembly with 100 events and 5 relationship definitions per event type, this is ~500 comparisons — negligible. For an unscoped assembly with 10,000 events, this is ~50,000 comparisons per anchor event — potentially slow. Scoped assembly (entityType + entityId) keeps this tractable.

- **Deduplication threshold is a magic number.** The 70% event overlap threshold in the EventCorrelator is a reasonable heuristic but has no theoretical justification. It should be made configurable and validated against real pharmacy data before being relied upon for production commercial intelligence.

- **matchPredicate for cross-entity relationships is probabilistic.** The RECEIVING_SESSION_CANCELLED → INVENTORY_STOCK_OUT relationship uses `() => true` because there is no reliable entity-level link from a cancelled session to the resulting stock-out (the session may not specify which products were expected). This means the relationship will fire for any cancelled session near any stock-out event, producing false positives. A future improvement would require the receiving session to carry expected product IDs.

- **Context Graph does not persist.** Like synthetic events, Context objects are computed on demand and never stored. Every call to correlate() recomputes the full graph. This is correct for the current scale but will need a caching layer as the platform accumulates years of operational history.

---

## DT-008C — Pattern Intelligence Framework

- **Pattern detection requires at least one Context object.** If no Context objects are available for an entity (e.g. a brand-new supplier with no receiving history), all detect() functions return null and the PatternGraph will be empty. This is correct behaviour — no data means no pattern — but callers should handle an empty PatternGraph gracefully.

- **Pattern evolution window-halving assumes the full analysis window has events in both halves.** If all contexts fall in the early half (e.g. a supplier who had a busy quarter three months ago and nothing since), the late half will be empty, and evolution will classify as DISAPPEARING. This is technically correct but may be confusing to users who see a VERY_HIGH strength pattern classified as DISAPPEARING.

- **Inter-pattern relationships are hardcoded combinations.** _discoverPatternRelationships() currently checks specific pattern type pairs. Adding a new pattern type that should participate in cross-pattern relationships requires adding logic to this function — it is not registry-driven. Future improvement: allow registerPattern() to declare cross-pattern relationship rules.

- **correlatePatterns() has no maximum context count guard.** Passing a very large ContextGraph[] (e.g. the full platform history across many years) will cause detect() to process a large context array in a single synchronous pass. This is bounded by JavaScript's heap limit, not by an explicit safeguard. Future improvement: add a maxContexts parameter with a reasonable default.

---

## DT-009 — Cockpit Foundation

- **Background enrichment failure is silent.** If `_enrichCockpit()` throws (e.g. the context or pattern layer encounters an error), the Cockpit remains in its initial semantic-only state with no error message shown. The pharmacist sees a functional Cockpit with basic event data but no pattern insights. Future improvement: show a subtle "Pattern intelligence unavailable" notice in the Insights section.

- **Snapshot may briefly show zero pattern count before enrichment completes.** The initial render uses semantic events only; pattern count shows 0 until background enrichment completes and updates the snapshot. On the LG G8X this typically takes 1-3 additional seconds after the initial render.

- **Activity Feed shows a maximum of 100 events, 20 per group.** For pharmacies with high transaction volume, older events may not appear in the feed without scrolling into the Older group. Future improvement: pagination or virtual scroll within each feed group.

- **Quick Action tiles navigate via `navigate()` which re-initialises the target screen.** If the pharmacist navigates from the Cockpit to Inventory and back, the Cockpit re-assembles the full cognitive stack. This is correct behaviour (always fresh data) but may feel slow. Future improvement: a TTL-based cache on the assembled events with manual invalidation on receiving commits.

---

## EPIC-001A — Commercial Intelligence Core

- **Driver rawScore computation is additive, not calibrated.** The stockout frequency driver adds a context score (0.1 per supply chain context, max 0.4) to the pattern score without cross-driver normalisation. For a pharmacy with many supply chain contexts, this could produce inflated rawScores. Future improvement: normalise driver scores against a reference dataset once sufficient operational history exists.

- **PURCHASE_COST_TREND driver uses volume as a proxy for cost pressure.** The driver interprets PURCHASE_GROWTH pattern direction (STRENGTHENING) as cost pressure, which is an approximation — growing purchase volume could mean growing operations, not rising unit costs. Unit cost trend detection requires PriceHistory data which is not yet populated. The driver will be more precise once PriceHistory is written by the receiving workflow.

- **Assessment confidence inherits from the best driver's evidenceQuality.** When multiple drivers contribute to an assessment, the assessment takes the best (not average) evidence quality. This may overstate assessment confidence when one driver is HIGH quality and others are LOW. Future improvement: compute a weighted average of driver evidence quality.

- **CommercialPosition composite score baseline is 0.6.** When no drivers are active (new pharmacy with no data), the position defaults to 0.6 (Healthy grade). This is a reasonable default for an empty system but may mislead if no data means "unknown" rather than "healthy." Future improvement: distinguish between "no data" and "healthy" in the Position grade vocabulary.

- **Pipeline timing is wall-clock only.** stageTimings in the pipeline metadata measures wall-clock milliseconds between stage calls. For synchronous in-memory computation this is accurate, but if any future stage becomes async, the measurement approach would need updating.

---

## DT-004B — Product Commercial Profile

- **Legacy dual-write period.** `Products.lastCost` and `InventoryLots.sellingPrice` continue to be written by CommercialProfileService during the migration period for backward compatibility. Removing these legacy writes requires a Dexie v9 migration that verifies all active code reads from CommercialProfile only.

- **Migration-seeded snapshots have Low confidence.** Products seeded from `Products.lastCost` during `runMigration008()` receive `confidence: 'Low'` because the original cost's supplier and date provenance are unknown. These will be upgraded to Verified automatically as receiving sessions are committed going forward.

- **CommercialPriceHistory replaces the original PriceHistory table.** The `PriceHistory` table from v1/v2 was never written to by any service. `CommercialPriceHistory` is the correct audit trail table for DM-001. The original `PriceHistory` table schema remains in the Dexie history but is not used.

- **inventoryService.js legacy fallback remains.** The `_buildInventoryRow()` function used by `getInventoryList()` still reads `sellingPrice` from InventoryLots directly (it was not updated in DT-004B). Full migration of the list view is deferred to a follow-up ticket once CommercialProfile adoption is validated in production.

---

## DT-004C — Inventory Commercial Migration

- **`supplierProfile.js` line 113** reads `p.lastCost` (a purchase history item's cost field, not `Products.lastCost`) in the supplier profile's purchase history panel. This is intentional — it is displaying the cost at which a product was purchased from that supplier, not the product's current replacement cost. No change needed. Classified as **INTENTIONAL**.

- **`getProductInventoryDetail()` sellingPrice read path** still has a legacy fallback to `InventoryLots.sellingPrice` (line 264). This is the correct pattern for the migration period — the function returns the `commercialProfile` object in full, allowing the UI to read `activeSellingPrice` directly. The fallback ensures no null price is shown on screen during the period between deployment and profile seeding.

- **`getInventoryList()` adds one `getProfiles()` bulk call** per page load. For a pharmacy with 500 products, this reads 500 CommercialProfile records in one IndexedDB query. Performance impact is minimal on Android Chrome (IndexedDB bulk reads are fast). However, this is a new DB read that did not exist before DT-004C.

---

## DT-004A — Quick Replacement Cost Update

- **Modal re-open pattern on save.** After saving, the current modal is closed and the calling screen's detail/profile function is called again to re-open with fresh data. This causes a brief visual gap (modal close → data reload → modal open). A future improvement would update the already-open modal's content in-place using `innerHTML` on a target `div`, avoiding the close/reopen cycle.

- **Source field does not map cleanly to SNAPSHOT_SOURCE constants.** The form offers "Supplier Quote", "Market Survey", "Manual Estimate". The service maps these to `source: 'manual'` in all cases (the SNAPSHOT_SOURCE.MANUAL constant). A future improvement would add `SNAPSHOT_SOURCE.SUPPLIER_QUOTE` and `SNAPSHOT_SOURCE.MARKET_SURVEY` to the constants and pass them through.

- **Confidence 'High' confirmation.** When source is "Supplier Quote", confidence auto-sets to High and `confirmed: true` is passed to the service. However, the service uses `confirmed` to choose between `SNAPSHOT_CONFIDENCE.HIGH` and `SNAPSHOT_CONFIDENCE.MEDIUM` — it cannot produce `SNAPSHOT_CONFIDENCE.VERIFIED`. Verified confidence is reserved for receiving session commits. A manual High is the maximum confidence available from this modal.
