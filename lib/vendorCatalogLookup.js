/**
 * Cross-vendor catalog lookup orchestrator.
 *
 * Runs the S&S Activewear lookup first (cheap, in-memory cached styles
 * catalog), then routes only the misses to a real SanMar lookup. This
 * replaces the old placeholder where any S&S miss was simply labeled
 * 'sanmar' with no actual SanMar API call — both vendors are now real,
 * orderable catalog sources, distinguished only by the `vendor` tag.
 *
 * I/O module — calls both vendor clients. See lib/ssActivewear.js and
 * lib/sanmar/classify.js for the per-vendor implementations.
 */

import { lookupVariantsForLineItems } from './ssActivewear.js';
import { lookupSanMarVariantsForLineItems } from './sanmar/classify.js';

/**
 * @param {Array<{ lineItemId: string, styleNumber?: string|null, color?: string|null }>} items
 * @returns {Promise<Array<{ lineItemId: string, state: 'matched'|'failed', vendor: 'ss-activewear'|'sanmar'|null, variants?: Array, error?: string }>>}
 */
export async function lookupVariantsAcrossVendors(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const ssResults = await lookupVariantsForLineItems(items);
  const ssByLineItemId = new Map(ssResults.map((r) => [r.lineItemId, r]));

  const misses = items.filter((item) => ssByLineItemId.get(item.lineItemId)?.state === 'ss-miss');

  let sanmarByLineItemId = new Map();
  if (misses.length > 0) {
    const sanmarResults = await lookupSanMarVariantsForLineItems(misses);
    sanmarByLineItemId = new Map(sanmarResults.map((r) => [r.lineItemId, r]));
  }

  return items.map((item) => {
    const ss = ssByLineItemId.get(item.lineItemId);

    if (ss?.state === 'matched') {
      return { lineItemId: item.lineItemId, state: 'matched', vendor: 'ss-activewear', variants: ss.variants };
    }
    if (ss?.state === 'failed') {
      return { lineItemId: item.lineItemId, state: 'failed', vendor: null, error: ss.error };
    }

    // ss.state === 'ss-miss' — fall through to the SanMar result.
    const sanmar = sanmarByLineItemId.get(item.lineItemId);
    if (sanmar?.state === 'matched') {
      return { lineItemId: item.lineItemId, state: 'matched', vendor: 'sanmar', variants: sanmar.variants };
    }

    return {
      lineItemId: item.lineItemId,
      state: 'failed',
      vendor: null,
      error: sanmar?.error || 'Not found in either S&S Activewear or SanMar catalog.',
    };
  });
}
