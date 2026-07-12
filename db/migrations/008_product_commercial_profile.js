/**
 * MIGRATION 008 — product_commercial_profile (DT-004B)
 *
 * Implements DM-001 Product Commercial Profile.
 *
 * WHAT THIS MIGRATION DOES:
 *   1. Creates ProductCommercialProfiles table (Dexie v8 schema)
 *   2. Creates PriceHistory table (replaces the empty v1/v2 stub)
 *   3. Seeds one CommercialProfile per existing product:
 *      - ReplacementCostSnapshot seeded from Products.lastCost
 *        (source: 'migration', confidence: 'Low')
 *      - activeSellingPrice seeded from the most recent
 *        InventoryLots.sellingPrice for that product
 *      - pricingStatus: 'Current' for all seeded profiles
 *      - placeholder fields (marginQuality etc.) remain null
 *   4. Does NOT delete or modify any existing field
 *   5. Legacy Products.lastCost and InventoryLots.sellingPrice remain
 *
 * NEVER MODIFY THIS FILE AFTER IT HAS BEEN DEPLOYED.
 * Any corrections must come through a subsequent migration.
 */

export const MIGRATION_008 = {
  id:          '008_product_commercial_profile',
  dexieVersion: 8,
  description: 'DM-001 — ProductCommercialProfiles table and initial seeding.',
};
