/**
 * S&S Activewear API client.
 * API docs: https://api.ssactivewear.com/
 *
 * Requires env vars: SS_ACTIVEWEAR_USERNAME, SS_ACTIVEWEAR_PASSWORD
 */

const SS_API_BASE = 'https://api.ssactivewear.com/v2';

/**
 * Map of style number → S&S styleID and human-readable brand/title info.
 *
 * To add a new style:
 *   1. Look up the styleID from the S&S styles endpoint:
 *      GET /v2/styles/?mediaType=json  (filter by styleName)
 *   2. Add an entry here with the styleID, brandName, and title from the API.
 *
 * These are used by fetchSSProductsByStyleNumbers() to build the
 * ?styleid= query, and the brandName/title are returned in the
 * garment-pricing response so the UI can display them.
 *
 * Verified via: GET /v2/styles/?mediaType=json (2026-05-13)
 */
export const STYLE_ID_MAP = {
  // Gildan 5000 — Unisex Heavy Cotton™ T-Shirt
  '5000': { styleID: 16, brandName: 'Gildan', title: 'Unisex Heavy Cotton™ T-Shirt' },
  // Next Level 6210 — Unisex CVC T-Shirt
  '6210': { styleID: 3227, brandName: 'Next Level', title: 'Unisex CVC T-Shirt' },
};

/**
 * Fetch pricing for one or more style numbers using STYLE_ID_MAP.
 *
 * This is the preferred function for the garment-pricing route.
 * It resolves style numbers (e.g. "5000", "6210") to their S&S styleIDs
 * via STYLE_ID_MAP, then fetches all variants in a single ?styleid= request.
 *
 * Each returned variant is augmented with brandName and title from the map
 * so the UI can display human-readable names without a second API call.
 *
 * @param {string} styleNumbers  Comma-separated style numbers, e.g. "5000" or "5000,6210"
 * @param {object} [options]
 * @param {string} [options.fields]  Comma-separated fields to return from the API
 * @returns {Promise<Array>}  Array of product variant objects, each with brandName + title injected
 *
 * @example
 * fetchSSProductsByStyleNumbers('5000,6210')
 */
export async function fetchSSProductsByStyleNumbers(styleNumbers, { fields } = {}) {
  const username = process.env.SS_ACTIVEWEAR_USERNAME;
  const password = process.env.SS_ACTIVEWEAR_PASSWORD;

  const styleKeys = styleNumbers.split(',').map((s) => s.trim());

  if (!username || !password) {
    throw new Error(
      'SS_ACTIVEWEAR_USERNAME and SS_ACTIVEWEAR_PASSWORD are required. ' +
      'Get credentials from your S&S Activewear dealer account at ssactivewear.com.'
    );
  }

  // Resolve style numbers → styleIDs using the map
  const knownStyleIDs = [];
  const unknownStyles = [];
  for (const key of styleKeys) {
    if (STYLE_ID_MAP[key]) {
      knownStyleIDs.push(STYLE_ID_MAP[key].styleID);
    } else {
      unknownStyles.push(key);
    }
  }

  if (unknownStyles.length > 0) {
    console.warn(
      `[ssActivewear] Style(s) not found in STYLE_ID_MAP: ${unknownStyles.join(', ')}. ` +
      'Add them to STYLE_ID_MAP in lib/ssActivewear.js.'
    );
  }

  if (knownStyleIDs.length === 0) {
    throw new Error(
      `None of the requested styles (${styleNumbers}) are in STYLE_ID_MAP. ` +
      'Add them to lib/ssActivewear.js.'
    );
  }

  // Fetch all variants in one request using comma-separated styleIDs
  const params = new URLSearchParams({ mediaType: 'json', styleid: knownStyleIDs.join(',') });
  if (fields) params.set('fields', fields);
  const url = `${SS_API_BASE}/products/?${params.toString()}`;

  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`S&S Activewear API error ${res.status}: ${text}`);
  }

  const variants = await res.json();

  // Inject brandName + title from STYLE_ID_MAP into each variant
  // (the ?styleid= endpoint omits brandName from the response)
  return variants.map((v) => {
    const meta = Object.values(STYLE_ID_MAP).find((m) => m.styleID === v.styleID) ||
      styleKeys.reduce((found, key) => found || (STYLE_ID_MAP[key]?.styleID === v.styleID ? STYLE_ID_MAP[key] : null), null);
    // Match by styleName since styleID isn't always returned in the variant
    const metaByStyleName = Object.entries(STYLE_ID_MAP).find(([k]) => k === v.styleName)?.[1];
    const resolved = meta || metaByStyleName;
    return {
      ...v,
      brandName: resolved?.brandName ?? v.brandName ?? '',
      title: resolved?.title ?? v.title ?? '',
    };
  });
}

/**
 * Fetch product data from S&S Activewear API (low-level).
 *
 * For most use cases, prefer fetchSSProductsByStyleNumbers() which uses
 * STYLE_ID_MAP to resolve style numbers to styleIDs automatically.
 *
 * @param {string} identifier
 *   - For filter modes: the filter value, e.g. "Gildan 5000" or "39" or "00760"
 *
 * @param {object} [options]
 * @param {string} [options.fields]
 *   Comma-separated list of fields to return, e.g. "sku,qty,customerPrice,piecePrice"
 *
 * @param {'style'|'styleid'|'partnumber'} [options.filterBy]
 *   Filter mode — determines the URL pattern used:
 *   - 'style'      → /v2/products/?style={identifier}       (by style name/brand, e.g. "Gildan 5000")
 *   - 'styleid'    → /v2/products/?styleid={identifier}     (by numeric styleID, e.g. "16")
 *   - 'partnumber' → /v2/products/?partnumber={identifier}  (by part number, e.g. "00760")
 *
 * @returns {Promise<Array>} Array of product variant objects from S&S
 */
export async function fetchSSProduct(identifier, { fields, filterBy } = {}) {
  const username = process.env.SS_ACTIVEWEAR_USERNAME;
  const password = process.env.SS_ACTIVEWEAR_PASSWORD;

  if (!username || !password) {
    throw new Error(
      'SS_ACTIVEWEAR_USERNAME and SS_ACTIVEWEAR_PASSWORD are required. ' +
      'Get credentials from your S&S Activewear dealer account at ssactivewear.com.'
    );
  }

  // Build the URL based on filterBy mode
  let url;
  if (filterBy === 'style') {
    url = `${SS_API_BASE}/products/?style=${encodeURIComponent(identifier)}`;
  } else if (filterBy === 'styleid') {
    url = `${SS_API_BASE}/products/?styleid=${encodeURIComponent(identifier)}`;
  } else if (filterBy === 'partnumber') {
    url = `${SS_API_BASE}/products/?partnumber=${encodeURIComponent(identifier)}`;
  } else {
    url = `${SS_API_BASE}/products/?styleid=${encodeURIComponent(identifier)}`;
  }

  // Append query params
  const params = new URLSearchParams({ mediaType: 'json' });
  if (fields) params.set('fields', fields);
  url = `${url}&${params.toString()}`;

  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`S&S Activewear API error ${res.status}: ${text}`);
  }

  return res.json();
}
