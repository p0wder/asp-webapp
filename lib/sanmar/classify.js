/**
 * Batch-classify Printavo invoice line items against the SanMar catalog.
 * Mirrors lib/ssActivewear.js's lookupVariantsForLineItems() so both vendors'
 * lookups can be merged by lib/vendorCatalogLookup.js into one classification
 * surface with a `matched|failed` state and a `vendor` tag.
 *
 * Never throws — upstream errors are tagged per-item with state: 'failed' so a
 * single bad group doesn't poison the batch.
 */

import { fetchSanMarProduct } from './productInfo.js';
import { getSanMarPricing } from './pricing.js';
import { fetchSanMarInventory } from './inventory.js';

/**
 * Synthesizes a stable SKU for a SanMar style/color/size, since SanMar has no
 * single SKU field the way SS Activewear does. This becomes a persisted
 * identifier in cart rows and attribution records.
 */
function synthesizeSku(style, color, size) {
  return `${style}-${color}-${size}`.toUpperCase().replace(/\s+/g, '');
}

/**
 * @param {Array<{ lineItemId: string, styleNumber?: string|null, color?: string|null }>} items
 * @returns {Promise<Array<{ lineItemId: string, state: 'matched'|'no-match'|'failed', variants?: Array, error?: string }>>}
 */
export async function lookupSanMarVariantsForLineItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const results = new Map();
  const byStyle = new Map();

  for (const item of items) {
    const style = (item.styleNumber || '').trim();
    if (!style) {
      results.set(item.lineItemId, { lineItemId: item.lineItemId, state: 'no-match', variants: [] });
      continue;
    }
    if (!byStyle.has(style)) byStyle.set(style, []);
    byStyle.get(style).push(item);
  }

  await Promise.all(
    Array.from(byStyle.entries()).map(async ([style, groupItems]) => {
      try {
        const entries = await fetchSanMarProduct(style);

        if (entries.length === 0) {
          for (const item of groupItems) {
            results.set(item.lineItemId, { lineItemId: item.lineItemId, state: 'no-match', variants: [] });
          }
          return;
        }

        // Pricing is batchable — one call covers every color/size this style returned.
        let pricingByKey = new Map();
        try {
          const priced = await getSanMarPricing(
            entries.map((e) => ({ style: e.style, color: e.color, size: e.size })),
          );
          pricingByKey = new Map(priced.map((p) => [`${p.style}|${p.color}|${p.size}`, p]));
        } catch (err) {
          console.warn(`[sanmar/classify] pricing lookup failed for style "${style}":`, err.message);
        }

        // Inventory has no batch call — fetch concurrently per distinct color/size.
        const inventoryResults = await Promise.all(
          entries.map(async (e) => {
            const key = `${e.style}|${e.color}|${e.size}`;
            try {
              const warehouses = await fetchSanMarInventory(e.style, e.color, e.size);
              return [key, warehouses.reduce((sum, w) => sum + (w.qty || 0), 0)];
            } catch (err) {
              console.warn(`[sanmar/classify] inventory lookup failed for ${key}:`, err.message);
              return [key, 0];
            }
          }),
        );
        const qtyByKey = new Map(inventoryResults);

        const allVariants = entries.map((e) => {
          const key = `${e.style}|${e.color}|${e.size}`;
          const pricing = pricingByKey.get(key);
          return {
            sku: synthesizeSku(e.style, e.color, e.size),
            sizeName: e.size,
            sizeOrder: e.sizeIndex != null ? String(e.sizeIndex) : '',
            colorName: e.color,
            qty: qtyByKey.get(key) || 0,
            customerPrice: pricing?.myPrice ?? pricing?.piecePrice ?? e.piecePrice ?? 0,
            styleName: e.productTitle || e.brandName || '',
            brandName: e.brandName || '',
            inventoryKey: pricing?.inventoryKey ?? e.inventoryKey,
            sizeIndex: pricing?.sizeIndex ?? e.sizeIndex,
          };
        });

        for (const item of groupItems) {
          const requestedColor = (item.color || '').trim().toLowerCase();
          const filtered = requestedColor
            ? allVariants.filter((v) => (v.colorName || '').trim().toLowerCase() === requestedColor)
            : allVariants;

          results.set(item.lineItemId, {
            lineItemId: item.lineItemId,
            state: filtered.length === 0 ? 'no-match' : 'matched',
            variants: filtered,
          });
        }
      } catch (err) {
        for (const item of groupItems) {
          results.set(item.lineItemId, {
            lineItemId: item.lineItemId,
            state: 'failed',
            error: err.message || String(err),
          });
        }
      }
    }),
  );

  return items.map((item) => results.get(item.lineItemId));
}
