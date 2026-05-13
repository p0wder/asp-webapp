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
 * Create an order via the S&S Activewear Orders API.
 *
 * IMPORTANT: testOrder is ALWAYS true to prevent accidental real orders.
 * When you are ready to go live, remove the hardcoded testOrder override.
 *
 * emailConfirmation is hardcoded to both shop emails. The SS API accepts a
 * single String — we send a comma-separated value and will verify if it
 * delivers to both. If not, only the first address will receive it.
 *
 * Default shipping address is Americana Screen Printing (209 E29th St, South Sioux City, NE 68776).
 * Warehouse auto-selection uses "fewest" warehouses strategy with a 10-day max transit time.
 *
 * @param {object} orderPayload
 * @param {object} [orderPayload.shippingAddress]  Shipping address (defaults to ASP shop address)
 *   { name, address, city, state, zip, country }
 * @param {Array}  orderPayload.lines              Required. Array of { identifier, qty, warehouseAbbr? }
 * @param {string} [orderPayload.poNumber]         Optional PO / reference number
 * @param {string} [orderPayload.comments]         Optional order comments
 *
 * @returns {Promise<object>} The SS Activewear API response object
 *
 * @example
 * createSSOrder({
 *   shippingAddress: { name: 'ASP Merch', address: '123 Main St', city: 'Chicago', state: 'IL', zip: '60601', country: 'US' },
 *   lines: [{ identifier: 'G500-S-WHITE', qty: 12 }],
 * })
 */
/**
 * Default shipping address for all S&S Activewear orders.
 * Americana Screen Printing shop — South Sioux City, NE.
 */
export const SS_DEFAULT_SHIPPING_ADDRESS = {
  customer: 'Thread Giant',
  attn: 'Terry Jones',
  address: '209 E29th St',
  city: 'South Sioux City',
  state: 'NE',
  zip: '68776',
  country: 'US',
};

export async function createSSOrder({ shippingAddress, lines, poNumber, comments } = {}) {
  const username = process.env.SS_ACTIVEWEAR_USERNAME;
  const password = process.env.SS_ACTIVEWEAR_PASSWORD;

  if (!username || !password) {
    throw new Error(
      'SS_ACTIVEWEAR_USERNAME and SS_ACTIVEWEAR_PASSWORD are required.'
    );
  }

  if (!lines || lines.length === 0) {
    throw new Error('createSSOrder requires at least one line item.');
  }

  // Fall back to the shop address if none provided
  const resolvedShippingAddress = shippingAddress || SS_DEFAULT_SHIPPING_ADDRESS;

  const body = {
    // ⚠️  ALWAYS true — prevents accidental real orders.
    //     Only set to false when intentionally going live.
    testOrder: true,

    // ⚠️  Auto-select warehouse — SS API will pick the best warehouse automatically.
    autoselectWarehouse: true,

    // Confirmation emails — SS API accepts a single String field.
    // Sending comma-separated to attempt delivery to both addresses.
    emailConfirmation: 'aspmerch@gmail.com,gramigscott@gmail.com',

    shippingAddress: resolvedShippingAddress,
    lines,

    ...(poNumber ? { poNumber } : {}),
    ...(comments ? { comments } : {}),
  };

  // ── Verbose logging — log the exact body being sent ──────────────────────
  console.log('[createSSOrder] ▶ POST https://api.ssactivewear.com/v2/orders/');
  console.log('[createSSOrder] Request body:', JSON.stringify(body, null, 2));

  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const res = await fetch(`${SS_API_BASE}/orders/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  console.log('[createSSOrder] ◀ HTTP status:', res.status, res.statusText);

  const data = await res.json().catch(() => null);
  console.log('[createSSOrder] Response body:', JSON.stringify(data, null, 2));

  if (!res.ok) {
    const message = data?.message || res.statusText;
    const errors = data?.errors ? JSON.stringify(data.errors) : '';
    throw new Error(`S&S Activewear Orders API error ${res.status}: ${message}${errors ? ' — ' + errors : ''}`);
  }

  return data;
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
