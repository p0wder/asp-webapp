/**
 * S&S Activewear API client.
 * API docs: https://api.ssactivewear.com/
 *
 * Requires env vars: SS_ACTIVEWEAR_USERNAME, SS_ACTIVEWEAR_PASSWORD
 */

const SS_API_BASE = 'https://api.ssactivewear.com/v2';

/**
 * How long the styles catalog cache is considered fresh.
 * After this duration, the next lookup will re-fetch /v2/styles/ from SS.
 * Default: 24 hours. Change this constant to adjust the refresh interval.
 */
export const SS_STYLES_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * In-memory styles catalog cache.
 * Populated lazily on first call to resolveStyleId() and refreshed when stale.
 *
 * _stylesCacheMap  — Map<styleName, { styleID, brandName, title }>
 * _stylesCacheTimestamp — Date.now() when the cache was last populated
 */
let _stylesCacheMap = null;
let _stylesCacheTimestamp = null;

/**
 * Returns true if the styles catalog cache is missing or older than SS_STYLES_CACHE_TTL_MS.
 * Exported so callers (e.g. an admin endpoint) can check staleness without triggering a refresh.
 */
export function isStylesCacheStale() {
  if (!_stylesCacheMap || !_stylesCacheTimestamp) return true;
  return Date.now() - _stylesCacheTimestamp > SS_STYLES_CACHE_TTL_MS;
}

/**
 * Force-invalidate the styles catalog cache so the next resolveStyleId() call
 * will re-fetch from the SS API. Useful for admin/debug endpoints.
 */
export function invalidateStylesCache() {
  _stylesCacheMap = null;
  _stylesCacheTimestamp = null;
}

/**
 * Map of style number → S&S styleID and human-readable brand/title info.
 *
 * This acts as a pre-seeded override layer on top of the dynamic styles cache.
 * Entries here are used immediately without waiting for the /v2/styles/ fetch,
 * which speeds up the first lookup for common styles.
 *
 * To add a new style manually:
 *   1. Look up the styleID from the S&S styles endpoint:
 *      GET /v2/styles/?mediaType=json  (filter by styleName)
 *   2. Add an entry here with the styleID, brandName, and title from the API.
 *
 * Verified via: GET /v2/styles/?mediaType=json (2026-05-23)
 */
export const STYLE_ID_MAP = {
  // Gildan 5000 — Unisex Heavy Cotton™ T-Shirt
  '5000': { styleID: 16, brandName: 'Gildan', title: 'Unisex Heavy Cotton™ T-Shirt' },
  // Gildan 5400 — Unisex Heavy Cotton™ Long Sleeve T-Shirt
  '5400': { styleID: 94, brandName: 'Gildan', title: 'Unisex Heavy Cotton™ Long Sleeve T-Shirt' },
  // Next Level 6210 — Unisex CVC T-Shirt
  '6210': { styleID: 3227, brandName: 'Next Level', title: 'Unisex CVC T-Shirt' },
  // Next Level 6211 — Unisex CVC Long Sleeve T-Shirt
  '6211': { styleID: 11226, brandName: 'Next Level', title: 'Unisex CVC Long Sleeve T-Shirt' },
  // Gildan 18000 — Unisex Heavy Blend™ Crewneck Sweatshirt
  '18000': { styleID: 372, brandName: 'Gildan', title: 'Unisex Heavy Blend™ Crewneck Sweatshirt' },
  // Gildan 18500 — Unisex Heavy Blend™ Hooded Sweatshirt
  '18500': { styleID: 395, brandName: 'Gildan', title: 'Unisex Heavy Blend™ Hooded Sweatshirt' },
  // Independent Trading Co. SS4500 — Unisex Midweight Hooded Sweatshirt
  'SS4500': { styleID: 1828, brandName: 'Independent Trading Co.', title: 'Unisex Midweight Hooded Sweatshirt' },
  // Richardson 112R — Snapback Trucker Cap (standard "112" trucker)
  '112R': { styleID: 4332, brandName: 'Richardson', title: 'Snapback Trucker Cap' },
  // Richardson 112FP — Five-Panel Trucker Cap
  '112FP': { styleID: 7614, brandName: 'Richardson', title: 'Five-Panel Trucker Cap' },
  // Flexfit 6277 — Cotton Blend Cap
  '6277': { styleID: 467, brandName: 'Flexfit', title: 'Cotton Blend Cap' },
  // Valucap VC400 — Mesh-Back Twill Trucker Cap
  'VC400': { styleID: 458, brandName: 'Valucap', title: 'Mesh-Back Twill Trucker Cap' },
  // NOTE: SS3000 (Independent Trading Co. Midweight Crewneck) is in the S&S catalog but its
  // styleID is not pre-seeded here — resolveStyleId() will look it up dynamically.
};

/**
 * Fetch the full SS Activewear styles catalog and return it as a Map<styleName, { styleID, brandName, title }>.
 *
 * This is the low-level fetch — use resolveStyleId() for cached access.
 *
 * @returns {Promise<Map<string, { styleID: number, brandName: string, title: string }>>}
 */
async function fetchAndBuildStylesCache() {
  const username = process.env.SS_ACTIVEWEAR_USERNAME;
  const password = process.env.SS_ACTIVEWEAR_PASSWORD;
  if (!username || !password) {
    throw new Error('SS_ACTIVEWEAR_USERNAME and SS_ACTIVEWEAR_PASSWORD are required.');
  }
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const url = `${SS_API_BASE}/styles/?mediaType=json`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`S&S Activewear styles API error ${res.status}: ${text}`);
  }
  const styles = await res.json();
  const map = new Map();
  // Seed with STYLE_ID_MAP overrides first so they take precedence
  for (const [styleName, meta] of Object.entries(STYLE_ID_MAP)) {
    map.set(styleName, meta);
  }
  // Then fill in everything from the live catalog (won't overwrite existing entries)
  for (const s of styles) {
    if (s.styleName && !map.has(s.styleName)) {
      map.set(s.styleName, { styleID: s.styleID, brandName: s.brandName || '', title: s.title || '' });
    }
  }
  console.log(`[ssActivewear] styles cache populated: ${map.size} entries`);
  return map;
}

/**
 * Resolve a style name (e.g. "112FP", "6210") to its SS Activewear styleID.
 *
 * Uses a module-level in-memory cache that is refreshed every SS_STYLES_CACHE_TTL_MS.
 * On cache miss the full /v2/styles/ catalog is fetched once and cached.
 *
 * Returns null if the style is not found in the SS catalog (e.g. Sport-Tek items
 * that SS does not carry — these should be routed to Sanmar instead).
 *
 * @param {string} styleName  Normalized style name, e.g. "112FP"
 * @returns {Promise<{ styleID: number, brandName: string, title: string } | null>}
 */
export async function resolveStyleId(styleName) {
  // Fast path: check STYLE_ID_MAP first (no async needed)
  if (STYLE_ID_MAP[styleName]) return STYLE_ID_MAP[styleName];

  // Ensure cache is fresh
  if (isStylesCacheStale()) {
    try {
      _stylesCacheMap = await fetchAndBuildStylesCache();
      _stylesCacheTimestamp = Date.now();
    } catch (err) {
      console.error('[ssActivewear] Failed to refresh styles cache:', err.message);
      // If cache refresh fails but we have a stale cache, use it rather than failing
      if (!_stylesCacheMap) return null;
    }
  }

  return _stylesCacheMap.get(styleName) || null;
}

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

  // Resolve style numbers → S&S styleIDs.
  // Fast path: STYLE_ID_MAP; fallback: full /v2/styles/ catalog (cached 24 h).
  // Styles not found in the S&S catalog (e.g. SanMar-only items like C402) are skipped.
  const resolvedByStyleID = new Map(); // Map<styleID, { brandName, title }>

  await Promise.all(
    styleKeys.map(async (key) => {
      const meta = await resolveStyleId(key);
      if (!meta) {
        console.warn(`[ssActivewear] Style "${key}" not found in S&S catalog — skipping.`);
        return;
      }
      resolvedByStyleID.set(meta.styleID, { brandName: meta.brandName, title: meta.title });
    })
  );

  if (resolvedByStyleID.size === 0) {
    throw new Error(`None of the requested styles (${styleNumbers}) were found in the S&S catalog.`);
  }

  // Fetch all variants in one request using comma-separated styleIDs
  const params = new URLSearchParams({ mediaType: 'json', styleid: [...resolvedByStyleID.keys()].join(',') });
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

  // Inject brandName + title from resolved meta into each variant
  // (the ?styleid= endpoint omits brand info from the response)
  return variants.map((v) => {
    const meta = resolvedByStyleID.get(v.styleID);
    // Fallback: match by styleName for variants where styleID is not returned
    const metaByStyleName = STYLE_ID_MAP[v.styleName] || null;
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

/**
 * Fetch payment profiles for the S&S Activewear account.
 *
 * The S&S API requires an email address associated with the account.
 * Returns an array of payment profile objects:
 *   { profileID, profileType, name, cardNumberLast4 }
 *
 * The first profile in the list is treated as the default (SS does not
 * mark a default explicitly in the API response).
 *
 * @param {string} [email]  Account email (defaults to SS_ACTIVEWEAR_ACCOUNT_EMAIL env var or 'aspmerch@gmail.com')
 * @returns {Promise<Array>}
 */
export async function fetchSSPaymentProfiles(email) {
  const username = process.env.SS_ACTIVEWEAR_USERNAME;
  const password = process.env.SS_ACTIVEWEAR_PASSWORD;
  const accountEmail = email || process.env.SS_ACTIVEWEAR_ACCOUNT_EMAIL || 'aspmerch@gmail.com';

  if (!username || !password) {
    throw new Error('SS_ACTIVEWEAR_USERNAME and SS_ACTIVEWEAR_PASSWORD are required.');
  }

  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const url = `${SS_API_BASE}/paymentprofiles/?mediaType=json&email=${encodeURIComponent(accountEmail)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`S&S Activewear payment profiles error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function createSSOrder({ shippingAddress, lines, poNumber, comments, paymentProfileId } = {}) {
  const username = process.env.SS_ACTIVEWEAR_USERNAME;
  const password = process.env.SS_ACTIVEWEAR_PASSWORD;
  // The account email is required inside the paymentProfile object by the SS API.
  const accountEmail = process.env.SS_ACTIVEWEAR_ACCOUNT_EMAIL || 'aspmerch@gmail.com';

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

  // The SS API requires paymentProfile to be an object with { profileID, email }.
  // The email must be the website user email associated with the account.
  const resolvedPaymentProfile = paymentProfileId
    ? { profileID: paymentProfileId, email: accountEmail }
    : undefined;

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
    ...(resolvedPaymentProfile ? { paymentProfile: resolvedPaymentProfile } : {}),
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
 * Normalize a Printavo itemNumber into an SS Activewear styleName.
 *
 * Printavo appends a single capital-letter suffix to numeric style codes
 * (e.g. "6210M", "5000M", "G500M") — the SS catalog uses the unsuffixed
 * form ("6210", "5000", "G500"). This strips a trailing capital letter
 * only when it's preceded by a digit, so legitimate style names ending
 * in letters (e.g. "BC3001CVC") are left untouched.
 */
export function normalizePrintavoStyleNumber(raw) {
  if (!raw) return '';
  return raw.trim().replace(/(\d)[A-Z]$/, '$1');
}

/**
 * Batch-classify a set of Printavo invoice line items against the SS Activewear catalog.
 *
 * For each unique normalized style number, resolves the SS styleID via the dynamic
 * styles catalog cache (resolveStyleId), then fetches product variants using the
 * reliable ?styleid= endpoint. Items whose style is not found in the SS catalog
 * (e.g. Sport-Tek items SS doesn't carry) are classified as 'sanmar' rather than
 * 'failed'. Items with null/empty styleNumber are also classified 'sanmar'.
 *
 * Never throws — upstream errors are tagged per-item with state: 'failed' so a single
 * bad group doesn't poison the batch.
 *
 * @param {Array<{ lineItemId: string, styleNumber?: string|null, color?: string|null }>} items
 * @returns {Promise<Array<{ lineItemId: string, state: 'matched'|'sanmar'|'failed', variants?: Array, error?: string }>>}
 */
export async function lookupVariantsForLineItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const results = new Map();
  const byStyle = new Map();

  for (const item of items) {
    const style = normalizePrintavoStyleNumber(item.styleNumber);
    if (!style) {
      // No style number — not an SS item, route to Sanmar
      results.set(item.lineItemId, { lineItemId: item.lineItemId, state: 'sanmar', variants: [] });
      continue;
    }
    if (!byStyle.has(style)) byStyle.set(style, []);
    byStyle.get(style).push(item);
  }

  await Promise.all(
    Array.from(byStyle.entries()).map(async ([style, groupItems]) => {
      try {
        // Resolve styleName → styleID via the dynamic catalog cache.
        // resolveStyleId() checks STYLE_ID_MAP first (fast path), then falls back
        // to the full /v2/styles/ catalog (fetched once and cached for 24 hours).
        const styleMeta = await resolveStyleId(style);

        if (!styleMeta) {
          // Style not found in SS catalog — not an SS item, route to Sanmar
          console.log(`[ssActivewear] Style "${style}" not found in SS catalog — routing to sanmar`);
          for (const item of groupItems) {
            results.set(item.lineItemId, { lineItemId: item.lineItemId, state: 'sanmar', variants: [] });
          }
          return;
        }

        // Fetch all variants for this style using the reliable ?styleid= endpoint
        const variants = await fetchSSProduct(String(styleMeta.styleID), { filterBy: 'styleid' });

        for (const item of groupItems) {
          const requestedColor = (item.color || '').trim().toLowerCase();
          const filtered = requestedColor
            ? variants.filter((v) => (v.colorName || '').trim().toLowerCase() === requestedColor)
            : variants;

          if (filtered.length === 0) {
            // Style exists in SS but this specific color isn't available — route to Sanmar
            console.log(`[ssActivewear] Style "${style}" color "${item.color}" not found in SS — routing to sanmar`);
            results.set(item.lineItemId, { lineItemId: item.lineItemId, state: 'sanmar', variants: [] });
          } else {
            results.set(item.lineItemId, {
              lineItemId: item.lineItemId,
              state: 'matched',
              variants: filtered.map((v) => ({
                sku: v.sku,
                sizeName: v.sizeName,
                sizeOrder: v.sizeOrder || '',
                colorName: v.colorName,
                qty: typeof v.qty === 'number' ? v.qty : 0,
                customerPrice: typeof v.customerPrice === 'number' ? v.customerPrice : 0,
                styleName: v.styleName || styleMeta.brandName || '',
                brandName: v.brandName || styleMeta.brandName || '',
              })),
            });
          }
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

/**
 * Build the Basic auth header value the SS Activewear API requires.
 * Throws when credentials are not configured.
 *
 * @returns {string}  Base64 "username:password" — caller prefixes with "Basic ".
 */
function buildSSBasicAuth() {
  const username = process.env.SS_ACTIVEWEAR_USERNAME;
  const password = process.env.SS_ACTIVEWEAR_PASSWORD;
  if (!username || !password) {
    throw new Error('SS_ACTIVEWEAR_USERNAME and SS_ACTIVEWEAR_PASSWORD are required.');
  }
  return Buffer.from(`${username}:${password}`).toString('base64');
}

/**
 * @typedef {Object} SSOrderLine
 * @property {string} sku
 * @property {string} [identifier]
 * @property {number} [qtyOrdered]
 * @property {number} [qtyShipped]
 */

/**
 * @typedef {Object} SSOrderSummary
 * @property {string} [orderNumber]
 * @property {string} [invoiceNumber]
 * @property {string} [poNumber]
 * @property {string} [orderStatus]
 * @property {Array<SSOrderLine>} [lines]
 */

/**
 * Fetch SS Activewear orders by PO number / Printavo invoice visualId.
 *
 * The existing checkout flow (`app/orders/checkout/page.jsx:229`) stamps PO as
 * `"#1234, #1235"`. The SS GET /orders/ endpoint accepts the identifier in the
 * URL path. This function normalizes the literal PO field into a
 * comma-separated list of bare visualIds:
 *   - splits on `, ` AND on `,` alone (defensive)
 *   - strips a single leading `#`
 *   - trims whitespace
 *   - URL-encodes each token
 *   - comma-joins the result for the SS endpoint identifier path
 *
 * Then issues `GET /v2/orders/{normalized}?lines=true&mediaType=json` with
 * the same Basic auth used elsewhere in this module.
 *
 * Read-only call. Logs only on error (Constitution V).
 *
 * @param {string} visualIdOrPoNumber  e.g. `"1234"`, `"#1234"`, or `"#1234, #1235"`
 * @param {Object} [opts]  (reserved for future options — currently unused)
 * @returns {Promise<{ orders: Array<SSOrderSummary>, rateLimit: { remaining: number | null } }>}
 * @throws {Error}  On non-200 responses with shape `SS Activewear HTTP <status>: <text>`.
 */
export async function getSSOrdersByPO(visualIdOrPoNumber, opts = {}) {
  void opts; // reserved for future use
  if (!visualIdOrPoNumber || typeof visualIdOrPoNumber !== 'string') {
    throw new Error('getSSOrdersByPO requires a non-empty string identifier.');
  }

  // Normalize: split on `, ` first then on `,` (defensive — handles either
  // separator the checkout flow might emit), strip leading `#`, trim, encode.
  const tokens = visualIdOrPoNumber
    .split(/, |,/)
    .map((t) => t.trim().replace(/^#/, '').trim())
    .filter((t) => t.length > 0)
    .map((t) => encodeURIComponent(t));

  if (tokens.length === 0) {
    throw new Error(`getSSOrdersByPO could not normalize identifier: "${visualIdOrPoNumber}"`);
  }

  const identifier = tokens.join(',');
  const auth = buildSSBasicAuth();
  const url = `${SS_API_BASE}/orders/${identifier}?lines=true&mediaType=json`;

  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
  } catch (err) {
    console.error(`[ssActivewear] getSSOrdersByPO network error for "${identifier}":`, err.message || err);
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[ssActivewear] getSSOrdersByPO HTTP ${res.status} for "${identifier}": ${text}`);
    throw new Error(`SS Activewear HTTP ${res.status}: ${text}`);
  }

  const remainingHeader = res.headers.get('X-Rate-Limit-Remaining');
  const remaining = remainingHeader !== null && remainingHeader !== ''
    ? Number(remainingHeader)
    : null;

  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error(`[ssActivewear] getSSOrdersByPO JSON parse failed for "${identifier}":`, err.message || err);
    throw new Error(`SS Activewear HTTP ${res.status}: invalid JSON response`);
  }

  // Normalize single object vs array — SS returns one or the other depending
  // on how many PO tokens matched.
  const orders = Array.isArray(data) ? data : (data ? [data] : []);

  return {
    orders,
    rateLimit: { remaining: Number.isFinite(remaining) ? remaining : null },
  };
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
