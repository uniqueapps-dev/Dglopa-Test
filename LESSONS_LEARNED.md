# LESSONS LEARNED

Engineering opportunities and observations discovered during implementation.

---

## DT-005A — Supplier Workspace

**Per-entity aggregation does not scale to workspace views.**
getRelationshipSummary() in DT-005 is excellent for a single supplier profile (one DB round-trip). The moment you need the same data for all suppliers simultaneously — a workspace view — a per-entity approach becomes N sequential queries. The correct pattern is one parallel bulk load followed by in-memory aggregation. This distinction between profile-level and workspace-level data access should be a standard design consideration for every future module that has both a detail view and a dashboard view.

**Rank-switching should be pre-computed, not re-queried.**
The Top Suppliers panel supports four ranking modes (by purchase value, inventory value, product count, recent activity). Each mode is just a different sort of the same pre-loaded supplier rows. Pre-computing all four and switching between them in JavaScript is the right call — it makes tab switches feel instant and removes the temptation to add a loading spinner for what is fundamentally a trivial operation.

**Attention-first layout changes user behaviour.**
Placing actionable items at the top of the workspace (before any data exploration) means the pharmacist's first glance surfaces what needs action today, not what is most visually impressive. This is the right priority order for an operational tool. The same principle should apply to the Live Inventory dashboard and any future operational screen — surface risks before summaries.

**In-memory indexing eliminates N+1 patterns.**
The workspace service uses `_groupBy()` to build Maps (purchasesBySupplier, sessionsBySupplier, lotsBySupplier) from the flat table loads before iterating over suppliers. This pattern — load flat, index in memory, compute — should be standard for any service that crosses multiple tables. Direct db queries inside a loop (e.g. `for supplier of suppliers: await db.PurchaseHistory.where('supplierId').equals(supplier.id)...`) are an antipattern in IndexedDB since each await is a separate IDB transaction.

---

## DT-005B — Supplier Timeline

**Event de-duplication belongs in the assembler, not the UI.**
The PurchaseHistory table has one record per product line, not per invoice. Without de-duplication in the assembler, a 30-line receiving session would produce 30 "Purchase Recorded" timeline cards — all at the same timestamp, all looking identical except for the product name. The fix (groupBy invoiceNumber, emit one aggregate event per invoice) is straightforward but must happen in the service layer, not the render layer, because the render layer receives a flat list and has no context about why certain timestamps cluster.

**Parallel reads + in-memory join is the correct pattern for timeline assembly.**
The timeline needs data from six different tables. The naive implementation runs six sequential awaits — one per table, one per event within each table. The correct implementation: one Promise.all() for all six tables, one batch product-name fetch, one in-memory assembly pass. The total DB query count is 7 regardless of how many events the supplier has. This pattern should be documented as the standard for any "assembled view" that draws from multiple tables.

**The time-bucket grouping algorithm needs to be consistent with local timezone.**
JavaScript's `new Date().getDay()` returns the day-of-week in the browser's local timezone. `Date.now()` returns UTC epoch ms. If you compute `_startOfDay()` using `setHours(0,0,0,0)` on a local Date object, it is timezone-aware — which is correct for a pharmacy running in one timezone. But if this platform ever runs in a multi-timezone context, this grouping logic would produce inconsistent bucket assignments for events near midnight. Currently correct for the Nigerian single-timezone use case.

---

## DT-007 — Demand Log

**Evidence capture on mobile is a UX constraint, not a technical one.**
The `<input type="file" capture="environment">` attribute on Android Chrome opens the camera directly. However, camera access in a PWA requires either HTTPS (which GitHub Pages provides) or localhost. On the LG G8X development device, camera capture from a PWA works correctly on GitHub Pages but will not work if the app is opened from a local file:// URL. This is a deployment constraint worth documenting for any future modules that use device hardware.

**Fast-capture forms should auto-focus their primary field.**
The quick capture form uses `autofocus` on the product name input. On Android Chrome in a modal/bottom-sheet, autofocus triggers the software keyboard immediately — which is exactly right for a fast-capture workflow (the user wants to type, not tap). This is a subtle UX decision that significantly reduces friction: without autofocus, the user must tap the field before typing. Every fast-capture workflow on the platform should follow this pattern.

**Unmatched products are intelligence, not errors.**
When a customer requests a product the pharmacy doesn't stock, "no match in Product Master" is not a failure — it's a purchase signal. The demand entry stores the raw product name, flags it as unmatched, surfaces it in the "Unknown" alert pill, and makes it available in the top-missing-products panel. This is more valuable than blocking the capture. Future: the unmatched products list feeds directly into the Product Creation workflow and supplier negotiations.

---

## DT-008 — Review Workspace

**A cross-platform inbox requires a stable vocabulary, not schema coupling.**
Every module writes to ReviewQueue with its own category strings (Missing Product, Out of Stock, Receiving, etc.). The workspace must aggregate these without knowing which module wrote what. The right solution is enrichment at read time — infer the source from the category string, map severity to priority, resolve product/supplier names from the item's originalValue — rather than trying to standardise category strings across all modules at write time. Write-time standardisation creates coupling; read-time enrichment preserves module autonomy.

**Tappable attention cards replace separate navigation flows.**
The original instinct for an operational inbox is to have a sidebar or tab per source module (Migration items | Receiving items | Demand items). This fragments the user's attention across multiple screens. The better pattern: one list, sorted by urgency, with tappable filter shortcuts at the top that scope the list without changing screens. The user stays in one context; urgency governs what they see, not module affiliation.

**Inline entity creation from a review item requires dependency injection, not duplication.**
The "Create Product" action in the resolution panel opens the exact same form component (buildProductForm) used by the Product Master screen, and delegates to the exact same service (productService.createProduct). The review workspace does not know what a valid product looks like — it delegates to the system that does. The resolution panel adds one thing: after the form submits successfully, it calls resolveItem() to close the review entry. That one linkage — create then resolve — is all the workspace contributes. Every future "create entity from review item" action should follow this pattern: reuse the existing form and service, add only the auto-resolve linkage.

---

## DT-008A — Event Intelligence Framework

**ADR-001: Event Assembler Pattern**
Problem: Multiple intelligence modules need access to the same operational events (receiving, inventory, demand) but each module had its own ad-hoc query pattern against the raw tables (e.g. Supplier Timeline, Inventory Dashboard). This created duplicated query logic, inconsistent event shapes, and tight coupling between intelligence consumers and operational schemas.

Decision: Build a single Event Assembler that all intelligence modules call. The assembler owns the query pattern (parallel load + in-memory Maps + single normalisation pass). Consumers receive a typed BusinessEvent[] and never touch the raw tables.

Consequence: Adding a new intelligence consumer requires zero changes to the data layer — just call assembleEvents(). Adding a new event source requires adding one classifier function and one or more registry entries — no consumer changes. The tradeoff is that assembleEvents() loads all tables on each call; scoped options (entityType, entityId) mitigate this for per-entity views.

**ADR-002: Synthetic Event Pattern**
Problem: Commercially significant moments (₦1M purchased from a supplier, a one-year partnership) have no natural home in the operational schema — no table records them because they are derived, not captured.

Decision: Generate these as synthetic events during assembly, computed from running aggregates, never persisted. The same source data always produces the same synthetic events (reproducible). Changing a milestone threshold requires editing configuration, not the database.

Consequence: Synthetic events appear on every assembleEvents() call where the thresholds are crossed. A consumer that wants to show milestones only once (e.g. a notification system) must implement its own idempotency check against its own persistent store — the framework deliberately does not do this, because idempotency requires persistence and the framework is stateless.

**ADR-003: Importance Classification**
Problem: Event importance (how urgent is this?) depends on both event type and context. A near-expiry lot expiring in 89 days is a WARNING. The same lot expiring in 3 days is CRITICAL. The event type alone cannot determine importance.

Decision: Two-layer importance: the registry sets a default per event type; the ImportanceEngine applies context rules that can override it. Context rules are registered functions, not hard-coded branches. The UI maps importance levels to colours independently — the framework never mentions colours.

Consequence: New context rules can be added at any time without changing the event model or the classifier. The tradeoff is that importance is computed at read time (reclassifyAll runs after assembly), not at write time — there is no persisted importance on a record. This is correct: importance is a read-time interpretation of current context, not a fixed property of a historical event.

**ADR-004: Platform Event Model**
Problem: The DT-005B Supplier Timeline and earlier modules created ad-hoc event shapes for their own use. These are not interoperable — a consumer of the Supplier Timeline cannot also consume Inventory events without knowing both schemas.

Decision: One event shape for the entire platform. Every operational record that produces a business event must go through createEvent() and conform to the BusinessEvent interface. Consumers query by category, entityType, importance, and timestamp — not by raw DB fields.

Consequence: Future modules (Sales, Pricing, Forecasting) that emit events automatically integrate with every existing consumer (Supplier Intelligence, Inventory Intelligence, Platform Timeline) without any coordination. The shared vocabulary is the integration contract.

---

## DT-008A (Semantic) — Semantic Intelligence Framework

**ADR-050: Multi-Dimensional Semantic Event Modeling**

Problem: A single importance field (CRITICAL / WARNING / SUCCESS / INFO) attempted to carry both urgency information ("how urgent is this?") and business meaning ("why does this matter?"). An expired lot with no remaining stock and an expired lot with 500 units remaining both received the same CRITICAL importance — but they require completely different responses. The field was carrying two meanings and was therefore unable to express either correctly.

Decision: Three orthogonal dimensions, each answering exactly one question.
  - IMPORTANCE:       "How urgent is this?"
  - STRATEGIC_INTENT: "Why does this matter to the business?"
  - OBLIGATION_TYPE:  "What is the nature of the commitment this event implies?"

No dimension may encode information that belongs to another. The factory enforces this explicitly: all three are required, invalid values throw, no fallback defaults collapse meaning.

Consequence: Future decision engines can independently filter on any dimension without ambiguity. "Give me all CRITICAL events with PROTECT intent and MANDATORY obligation" is a precise, unambiguous query. "Give me all CRITICAL events" was always an approximation.

---

**ADR-051: Semantic Intelligence Precedes Decision Intelligence**

Problem: Future commercial intelligence modules (pricing, reordering, supplier recommendations) would naturally reach directly into operational tables to compute their signals. This creates tight coupling between intelligence modules and the operational schema — every schema change breaks multiple intelligence modules, and every intelligence module duplicates the same data loading and enrichment logic.

Decision: Intelligence modules must consume semantic events rather than raw operational records. The Semantic Intelligence Framework is the mandatory layer between Operations and Intelligence. Meaning must exist before judgment.

Consequence: The operational schema can evolve (new fields, new tables, new migrations) without touching any intelligence module, as long as the semantic layer updates its classifiers to produce the same event shapes from the new records. Intelligence modules gain access to enriched, classified, fully explained events without knowing anything about InventoryLots.expiryDate or PurchaseHistory.unitCost. This is the correct dependency direction for a platform that will accumulate intelligence modules over time.

---

**Registry pattern eliminates switch statements at the category level.**
The DT-008A (intelligence) framework used classify...() functions with if/else chains per event type. As the number of event types grew from 7 to 31, these functions would have become maintenance problems. The registry pattern — where each event type is a data record with a buildMetadata builder, not a code branch — means adding event type 50 requires zero changes to the assembler. The assembler calls `getDefinition(eventType)` and uses whatever it gets. This is the only correct architecture for a framework that must remain Open for Extension without modification.

**Semantic context rules are registered functions, not configuration.**
The importance and semantic engines both use arrays of context rule functions. This was a deliberate choice over a configuration object approach (e.g. `{ IF: { eventType: 'X', metadata: { qty: '>= 10' } }, THEN: { importance: 'CRITICAL' } }`). Rule functions have full access to the event object and can express arbitrary conditions — including cross-field logic that a simple configuration DSL could not express. The tradeoff is that rules require code deployment to change; a configuration approach would allow runtime changes. For a single-pharmacy offline PWA, code deployment is the right granularity.

---

## DT-008B — Context Intelligence Framework

**Context emerges from relationships, not from individual event types.**
The most important engineering insight from this ticket: a DEMAND_REPEAT_DETECTED event alone is a WARNING signal. The same event connected to an INVENTORY_STOCK_OUT for the same product, which connects to a RECEIVING_SESSION_CANCELLED from the same supplier — that is a supply chain context with HIGH confidence and SUPPLY_CHAIN type. The meaning is in the pattern, not in any single event. The framework is designed around this principle: the Relationship Engine discovers, the Context Engine interprets patterns, and the Confidence Engine measures how well-supported the interpretation is.

**matchPredicate is the right abstraction for entity-level correlation.**
Every relationship definition has a matchPredicate function that goes beyond event type matching. INVENTORY_STOCK_OUT → DEMAND_CAPTURED requires that the stock-out's related product matches the demand's productId — otherwise every stock-out in the database "relates to" every demand entry, which is noise rather than signal. The predicate keeps entity-level correlation in the configuration layer where it belongs, not scattered through the engine logic.

**Deduplication is necessary but imperfect.**
The 70% event overlap threshold for context deduplication is a reasonable heuristic but not a principled algorithm. Two genuinely different supply chain disruptions for two different products may share many events (the same supplier's receiving sessions, the same review queue items) and get incorrectly merged. Future improvement: use entity identity (productId, supplierId) as the primary deduplication key rather than raw event overlap ratio.

**Context windows are not just time windows.**
The initial instinct for "windows" is time-based (daily, weekly, monthly). But the most operationally useful windows for a pharmacy are entity-scoped: "all events related to this supplier" or "all events related to this product." The Context Window Engine supports both, and entity-scoped windows are the primary entry point for the Event Correlator. Time windows are secondary — they become relevant when building aggregate dashboards (weekly demand trends, monthly purchasing totals) which belong to a future analytics layer.

**The correlator should not claim the same events for multiple contexts.**
The current deduplication approach marks events as "claimed" after the first context that uses them, preventing subsequent contexts from double-counting. This is the right behaviour for a ContextGraph where each context is meant to represent a distinct business situation. If two genuinely separate situations happen to share a common event, the current approach will attribute that event to only one context. A future improvement would allow shared events with a "shared" flag rather than exclusive claiming.

---

## DT-008C — Pattern Intelligence Framework

**ADR-056: Patterns Are Emergent Properties of Contexts Across Time**

Problem: It is tempting to detect patterns directly from Platform Events — they are more granular and more numerous than Context objects, giving more data points to work with. But a pattern that emerges from raw events would carry no semantic context (no strategic intent, no obligation type, no confidence from the DT-008B layer). It would also require the pattern layer to know about event types, entity relationships, and causal chains that belong in the DT-008A and DT-008B layers.

Decision: Pattern discovery consumes Context objects from DT-008B's ContextGraph. The Semantic and Context layers have already distilled operational records into contextual business knowledge. Pattern detection begins from that distilled knowledge — not from raw events. This is the correct entry point.

Consequence: The Pattern Intelligence Framework has zero knowledge of InventoryLots, PurchaseHistory, or any other DB table. It only knows CONTEXT_TYPE values and the shapes of Context objects. Adding a new operational module (e.g. Sales) requires adding context types to DT-008B and pattern definitions to DT-008C — but the Pattern Engine itself never changes.

---

**ADR-057: Pattern Strength And Confidence Are Independent Dimensions**

Problem: In earlier iterations (DT-008A, DT-008B), importance and confidence played overlapping roles. A CRITICAL importance event was often also a HIGH confidence signal. The temptation in the Pattern layer is to derive strength from confidence or vice versa — if the evidence is HIGH confidence, the pattern must be HIGH strength.

Decision: Pattern strength and confidence are computed entirely independently.
  - Strength comes from rawStrength in the detect() result — a function of occurrences, duration, and the specific pattern definition's assessment of magnitude.
  - Confidence comes from the number of corroborating Context objects and presence of required context types.

They happen to correlate sometimes (frequent occurrences → both high strength and high confidence) but they must not infer each other. The explainability chain requires both to be independently justified.

Consequence: Future Commercial Intelligence engines can query patterns by strength independently of confidence, and vice versa. "Show me HIGH strength patterns with any confidence level" and "show me HIGH confidence patterns with any strength level" are both valid, distinct queries.

---

**detect() is the right abstraction boundary.**
The detect() function in the registry definition is a pure function: (contexts, window, now) => DetectionResult | null. It takes a Context array and returns a numeric rawStrength (0..1), occurrences count, evidence strings, and contextIds. The Pattern Engine calls it; the result shape is standard. This is the correct abstraction: each pattern knows its own detection logic, and the engine knows how to call any detection function without knowing what it does internally. Adding a new pattern is entirely self-contained in the registry.

**Evolution detection with window halving is robust to sparse data.**
An alternative approach to evolution would be to compare the current detection result against a stored historical result. But storing pattern history requires persistence, and persistence creates drift risk. The window-halving approach is reproducible: given the same contexts in the same window, the same evolution is always computed. The 15% delta threshold is an explicit named constant — change it and everything recomputes correctly.

---

## DT-009 — Cockpit Foundation

**ADR-059: Presentation Consumes Understanding**

Problem: The most natural instinct when building a pharmacy dashboard is to query the database directly — `SELECT COUNT(*) FROM InventoryLots WHERE expiryDate < NOW()` for the expired lot count, for example. This is fast to write and produces correct numbers. But it means the dashboard contains business logic that is also contained in the semantic, context, and pattern layers — the same logic in two places, with two possible divergence points.

Decision: The Cockpit queries no operational tables. It calls `assembleSemanticEvents()`, passes the result to `correlate()` and `correlatePatterns()`, then calls `buildCockpitPayload()`. The business reasoning is entirely in the framework layers. The Cockpit is a rendering layer.

Consequence: Every business rule that affects the Cockpit (e.g. "what counts as a critical item?") is defined once, in the semantic layer's importance rules, and flows through the entire stack consistently. Changing the critical-item rule changes the Cockpit display automatically, without touching any screen code. The tradeoff is latency — the framework assembly takes longer than a direct DB query. Progressive loading mitigates this for the user.

---

**ADR-060: Attention Precedes Information**

Problem: Operational dashboards traditionally lead with summary statistics (total inventory value, total products, etc.) because these numbers are easy to compute and impressive to display. But a pharmacist opening the app in the morning does not need to know that total inventory value is ₦4.2M — they need to know whether there is anything that requires action today.

Decision: The first meaningful content the pharmacist sees is the Attention Center, not the Business Snapshot. The snapshot exists but renders below the attention items. `orderSections()` enforces this ordering.

Consequence: The Cockpit communicates priority. A clean Attention Center ("No items require immediate attention. All systems operational.") is reassuring. A full Attention Center tells the pharmacist exactly what needs doing before they browse any other information. The order itself is a communication.

---

**Progressive disclosure on mobile is the right pattern for explainability.**
Insight cards use HTML `<details>` + `<summary>` for the "Why this matters" expansion. On the LG G8X's 6-inch screen, showing the full explanation for all cards at once would create an overwhelming wall of text. The progressive disclosure approach means the card is scannable (title, strength badge, evolution indicator, one-sentence summary) at the overview level and fully explainable on tap. This is the correct design for a mobile-first operational tool where the pharmacist needs to scan many cards quickly and drill into the ones that matter.

---

**The Cockpit is a consumer, not a builder.**
The distinction between `buildCockpitPayload()` (service) and `renderAttentionCenter()` (screen component) is more than a code organisation choice — it is an architectural boundary. The service produces an immutable `CockpitPayload` data object. The screen components render it. This means the service can be tested independently of any DOM, and the screen components are guaranteed to never contain business reasoning. Future Commercial Intelligence features that modify what appears in the Cockpit will modify `cockpitService.js`, not any screen component.

---

## EPIC-001A — Commercial Intelligence Core

**ADR-062: Judgment Consumes Understanding**

Problem: The most direct path to commercial intelligence would be to query the database — count expired lots, sum purchase costs, count unmet demand entries. This would produce accurate numbers quickly. But it means commercial reasoning lives in two places: once in the cognitive architecture (semantic → context → pattern) and again in the commercial layer. Two implementations of the same reasoning create two divergence points.

Decision: CIA Core reads PatternGraph, ContextGraph, and PlatformEvent objects produced by the cognitive architecture. It never reads InventoryLots, PurchaseHistory, or any operational table. The cognitive architecture has already distilled operational data into patterns with evidence, confidence, and strategic intent. CIA Core interprets those patterns commercially — it does not re-examine the raw operational data.

Consequence: When the inventory schema changes (a new expiry tracking field, for example), the semantic and context layers update to reflect it — but CIA Core requires no changes. The commercial interpretation of "expiry waste" remains: "inventory is expiring before it can be sold, representing direct capital loss." The mechanism of detection may change below the commercial layer; the commercial meaning does not.

---

**ADR-063: Commercial Assessments Are The Universal Judgment Contract**

Problem: Future intelligence engines (Pricing Intelligence, Business Intelligence, Financial Intelligence, Decision Intelligence) will all need commercial understanding. If each engine draws directly from PatternGraph and ContextGraph objects, each must reimplement the same commercial interpretation logic. Four engines, four implementations, four divergence points.

Decision: Every downstream engine shall consume CommercialAssessment objects. The CIA Core runs once and produces a set of assessments that are the shared commercial vocabulary for the entire platform. Pricing Intelligence reads assessments to understand cost pressure. Business Intelligence reads assessments to understand operational health. Decision Intelligence reads signals to understand urgency. None of them re-examine the patterns.

Consequence: Adding a new assessment type (e.g. LiquidityRisk when payment tracking is implemented) requires one new entry in the assessment registry. All downstream engines that consume CommercialAssessment[] automatically gain access to it. The contract is the type — not the implementation.

---

**ADR-064: Commercial Dimensions Remain Orthogonal**

Problem: The temptation in commercial scoring is to derive one dimension from another. "If the assessment is Critical severity, the signal must be Immediate urgency." This is sometimes true but not always — a Critical capital-at-risk assessment during a period of strong purchasing momentum may be Urgent rather than Immediate because the business has the capacity to respond. Collapsing dimensions loses this nuance.

Decision: commercialImpact, commercialConfidence, commercialUrgency, strategicIntent, and obligationType are computed independently. No field may derive from another. The scoring engine's composite score is computed from raw driver scores, not from assessment severity levels — this prevents severity from cascading into position grade in a way that bypasses the evidence.

Consequence: The pipeline is more complex (five independent dimensions rather than one composite score) but more expressive. Future Decision Intelligence can query "show me HIGH urgency signals with LOW confidence" to find situations that need action but where the evidence base is thin — a nuanced commercial risk that a single composite score would bury.

---

**ADR-065: Commercial Position Is A Point-In-Time Snapshot**

Problem: A CommercialPosition that is persisted becomes a historical record. Historical records create expectations of continuity — if yesterday's position was Stressed and today's is Healthy, was there an actual improvement or did the pattern detection window shift? Persisting positions creates a requirement for position history management, delta computation, and trend attribution that belongs in a future analytics layer.

Decision: CommercialPosition is stateless and reproducible. Given the same PatternGraph, ContextGraph, and PlatformEvent inputs, the same Position is always produced. It is never written to IndexedDB. It carries `_snapshot: true` to make this contract visible in every Position object.

Consequence: The Cockpit can call buildCommercialIntelligence() on every load and always get a fresh, current position. There is no "stale position" problem. The tradeoff is that historical comparison requires the caller to retain previous results in memory — this is correct, because the decision about what to compare and how to display the comparison belongs in the presentation layer, not the commercial layer.

---

**The four-stage pipeline with enforced dependency order is the correct architecture.**
An alternative approach would be to compute drivers, assessments, signals, and position in parallel (Promise.all style). This would be faster but would allow drivers to reference assessment state and vice versa — circular dependencies would be possible in a later refactor. The sequential pipeline enforces unidirectional data flow: each stage receives only the outputs of previous stages. No circular dependencies are possible. The performance tradeoff is negligible (all computation is synchronous in-memory, typically completing in under 5ms total) and the architectural clarity is significant.

**Signal language discipline requires active enforcement, not passive convention.**
The ADR-062 requirement "signals identify and describe, never prescribe" is easy to agree with and easy to violate. "Low stock detected — consider reordering" seems harmless but "consider reordering" is a recommendation. The enforcement mechanism here is the `_noRecommendation: true` flag on every signal object and the signal template registry which uses the vocabulary of observation ("Revenue gap is widening") rather than action ("Order more stock"). Future contributors writing new signal templates must follow this vocabulary. The flag makes the constraint visible during code review.

---

## DT-004B — Product Commercial Profile (DM-001)

**Dual-write as a migration safety mechanism, not a compromise.**
The pattern of writing to both the new `CommercialProfiles` table and the legacy `Products.lastCost` field simultaneously is sometimes called "write amplification" and treated as a cost. In this context it is a feature: it means the migration can be deployed to production immediately without touching any existing screen. The pharmacist sees the new Commercial Profile section in the product view; every other screen continues working unchanged. Confidence is built incrementally. The legacy fields are removed in a future migration once confidence is established. This is the correct pattern for schema migration in a live offline-first system where a failed migration cannot be rolled back with a server restart.

**Typed snapshots are worth the complexity.**
The specification said "Do NOT model Replacement Cost as a raw number." This is a pharmacy-domain insight: knowing that the current replacement cost of Amoxicillin 500mg is ₦342 is less useful than knowing it was ₦342 from Quicksave on 2026-07-04 with Verified confidence from a committed receiving session. The snapshot structure adds five fields to one number — but those five fields are what EPIC-001B (PIE) needs to compute a Survival Floor with meaningful provenance. A future AI recommendation engine can say "I used ₦342 as the replacement cost; this came from a Verified receiving session 2 days ago, so I have High confidence in this number." Without the snapshot structure, that sentence is impossible to produce.

**CommercialProfile auto-creation must be non-fatal.**
`productService.createProduct()` calls `createProfile(id)` with a `.catch()` wrapper. This is correct: if the CommercialProfiles table is not yet at v8 (e.g. during a browser upgrade where IndexedDB is at v7 but the app has been updated), a product creation must not fail because the commercial layer is behind. The profile will be created retroactively by `runMigration008()` on the next app open. Non-fatal hooks are the correct pattern for cross-domain dependencies in an offline-first system.

---

## DT-004C — Inventory Commercial Migration

**The function signature is the cleanest migration hook.**
`_buildInventoryRow()` is a pure function that was called from `getInventoryList()` with product and lots. Adding `commercialProfile = null` as a fifth parameter with a null default is the cleanest possible migration boundary: the function continues to work if no profile is passed (fallback path), and the caller decides how to load the profiles. This is better than loading the profile inside `_buildInventoryRow()` (which would create N DB reads inside a loop) and better than making the profile mandatory (which would require test data everywhere). The null-default fifth parameter pattern should be the standard for threading new data into existing pure functions during migration.

**Bulk read before the loop, not inside the loop.**
The natural first instinct for "add CommercialProfile to _buildInventoryRow" is to call `getProfile(product.id)` inside the loop that builds the rows. For 500 products, that is 500 sequential IndexedDB awaits — one per product. The correct pattern is `getProfiles(products.map(p => p.id))` before the loop, building a Map, then passing `profileMap.get(product.id)` to each row builder. One DB read regardless of product count. This is the same principle that drove the _groupBy() Map pattern throughout the workspace services — the architectural insight is the same; the application here is the final instance of applying it to the inventory read path.

**Legacy field audit must be a file-header comment, not a ticket comment.**
The DT-004C field audit (INTENTIONAL / LEGACY FALLBACK / MIGRATED) is written into the `inventoryService.js` file header, not only in CHANGES.md. This ensures that any future developer opening the file immediately understands the migration status of each legacy field without needing to read the change history. Migration debt that is only documented in tickets becomes invisible once the ticket is closed.
