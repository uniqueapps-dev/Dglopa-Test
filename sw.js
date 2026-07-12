/**
 * DGLOPA PLATFORM — SERVICE WORKER v9
 * DT-006: Live Inventory modules added to precache.
 */

const CACHE_NAME = 'dglopa-v23';

const PRECACHE = [
  './',
  './index.html',
  './css/tokens.css',
  './css/global.css',
  './css/components.css',
  './app.js',
  './js/router.js',
  './db/database.js',
  './db/migrations/001_initial.js',
  './db/migrations/002_product_master.js',
  './db/migrations/003_product_master_enhancements.js',
  './db/migrations/004_merge_framework_soft_delete.js',
  './db/migrations/005_import_audit.js',
  './db/migrations/006_receiving_workflow.js',
  './db/migrations/007_demand_log.js',
  './components/toast.js',
  './components/modal.js',
  './components/loadingOverlay.js',
  './screens/settings.js',
  './screens/placeholder.js',
  './screens/products/productsScreen.js',
  './screens/products/productForm.js',
  './screens/products/productProfile.js',
  './screens/migration/migrationScreen.js',
  './screens/migration/importPreview.js',
  './screens/migration/confirmationScreen.js',
  './screens/receiving/receivingDashboard.js',
  './screens/receiving/receivingSession.js',
  './screens/receiving/receivingHistory.js',
  './screens/receiving/imeEntry.js',
  './screens/suppliers/suppliersScreen.js',
  './screens/suppliers/supplierForm.js',
  './screens/suppliers/supplierWorkspace.js',
  './screens/suppliers/supplierTimeline.js',
  './screens/demand/demandScreen.js',
  './screens/demand/demandCapture.js',
  './screens/review/reviewScreen.js',
  './screens/suppliers/supplierProfile.js',
  './screens/inventory/inventoryScreen.js',
  './services/errorHandler.js',
  './services/productService.js',
  './services/aliasService.js',
  './services/lookupService.js',
  './services/softDelete.js',
  './services/productMergeService.js',
  './services/receivingSessionService.js',
  './services/receivingLineService.js',
  './services/receivingCommitService.js',
  './services/supplierService.js',
  './services/supplierWorkspaceService.js',
  './services/supplierTimelineService.js',
  './services/demandService.js',
  './services/reviewWorkspaceService.js',
  './services/intelligence/index.js',
  './services/intelligence/eventModel.js',
  './services/intelligence/eventRegistry.js',
  './services/intelligence/eventClassifier.js',
  './services/intelligence/importanceEngine.js',
  './services/intelligence/milestoneEngine.js',
  './services/intelligence/eventAssembler.js',
  './services/semantic/index.js',
  './services/semantic/eventConstants.js',
  './services/semantic/eventTypes.js',
  './services/semantic/eventFactory.js',
  './services/semantic/eventRegistry.js',
  './services/semantic/importanceEngine.js',
  './services/semantic/semanticEngine.js',
  './services/semantic/milestoneEngine.js',
  './services/semantic/syntheticEventGenerator.js',
  './services/semantic/eventAssembler.js',
  './services/context/index.js',
  './services/context/contextConstants.js',
  './services/context/contextTypes.js',
  './services/context/contextFactory.js',
  './services/context/relationshipRegistry.js',
  './services/context/relationshipEngine.js',
  './services/context/confidenceEngine.js',
  './services/context/contextWindowEngine.js',
  './services/context/contextEngine.js',
  './services/context/eventCorrelator.js',
  './services/pattern/index.js',
  './services/pattern/patternConstants.js',
  './services/pattern/patternTypes.js',
  './services/pattern/patternFactory.js',
  './services/pattern/patternRegistry.js',
  './services/pattern/patternWindowEngine.js',
  './services/pattern/patternStrengthEngine.js',
  './services/pattern/patternEngine.js',
  './services/pattern/patternCorrelator.js',
  './services/cockpit/cockpitService.js',
  './services/cockpit/cockpitLayoutEngine.js',
  './services/cockpit/cockpitConstants.js',
  './services/cockpit/cockpitTypes.js',
  './screens/cockpit/cockpitScreen.js',
  './screens/cockpit/attentionCenter.js',
  './screens/cockpit/insightCards.js',
  './screens/cockpit/activityFeed.js',
  './screens/cockpit/quickActions.js',
  './services/commercial/index.js',
  './services/commercialProfileService.js',
  './screens/products/quickCostUpdate.js',
  './db/migrations/008_product_commercial_profile.js',
  './services/commercial/commercialConstants.js',
  './services/commercial/commercialTypes.js',
  './services/commercial/commercialFactory.js',
  './services/commercial/commercialRegistry.js',
  './services/commercial/driverEngine.js',
  './services/commercial/commercialAssessmentEngine.js',
  './services/commercial/commercialSignalEngine.js',
  './services/commercial/commercialScoringEngine.js',
  './services/commercial/commercialCore.js',
  './services/inventoryService.js',
  './services/migration/adapterRegistry.js',
  './services/migration/adapters/spreadsheetAdapter.js',
  './services/migration/adapters/futureFormatStubs.js',
  './services/migration/normalizer.js',
  './services/migration/validationEngine.js',
  './services/migration/matchingEngine.js',
  './services/migration/reviewQueueBuilder.js',
  './services/migration/pipelineOrchestrator.js',
  './services/migration/commitEngine.js',
  './utils/helpers.js',
  './utils/idGenerator.js',
  './utils/normalizer.js',
  './utils/quantitySplitter.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/dexie@3.2.7/dist/dexie.mjs',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension://')) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') return caches.match('./index.html');
        });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
