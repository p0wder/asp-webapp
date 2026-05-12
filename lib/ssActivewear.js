/**
 * S&S Activewear API client.
 * API docs: https://api.ssactivewear.com/
 *
 * Requires env vars: SS_ACTIVEWEAR_USERNAME, SS_ACTIVEWEAR_PASSWORD
 */

const SS_API_BASE = 'https://api.ssactivewear.com/v2';

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
// TODO: Remove this mock data once SS_ACTIVEWEAR_USERNAME + SS_ACTIVEWEAR_PASSWORD
// are configured in .env.local. These are approximate wholesale prices for
// Gildan 5000 and Next Level 6210 based on typical S&S Activewear pricing tiers.
// customerPrice field is used as the unit wholesale cost.
//
// Real S&S response shape (relevant fields):
//   sku, styleName, brandName, colorName, sizeName, customerPrice, qty, warehouses
//
// To remove: delete this MOCK_SS_PRODUCTS block and the useMock logic in fetchSSProduct.
const MOCK_SS_PRODUCTS = {
  '5000': [
    // Gildan 5000 Heavy Cotton T-Shirt — approximate S&S wholesale price tiers
    // Single-unit price ~$3.11, quantity breaks reduce cost
    { sku: '5000-BLK-S',  styleName: '5000', brandName: 'Gildan', colorName: 'Black', sizeName: 'S',  customerPrice: 3.11, qty: 5000 },
    { sku: '5000-BLK-M',  styleName: '5000', brandName: 'Gildan', colorName: 'Black', sizeName: 'M',  customerPrice: 3.11, qty: 5000 },
    { sku: '5000-BLK-L',  styleName: '5000', brandName: 'Gildan', colorName: 'Black', sizeName: 'L',  customerPrice: 3.11, qty: 5000 },
    { sku: '5000-BLK-XL', styleName: '5000', brandName: 'Gildan', colorName: 'Black', sizeName: 'XL', customerPrice: 3.11, qty: 5000 },
    { sku: '5000-WHT-S',  styleName: '5000', brandName: 'Gildan', colorName: 'White', sizeName: 'S',  customerPrice: 2.89, qty: 8000 },
    { sku: '5000-WHT-M',  styleName: '5000', brandName: 'Gildan', colorName: 'White', sizeName: 'M',  customerPrice: 2.89, qty: 8000 },
    { sku: '5000-WHT-L',  styleName: '5000', brandName: 'Gildan', colorName: 'White', sizeName: 'L',  customerPrice: 2.89, qty: 8000 },
    { sku: '5000-WHT-XL', styleName: '5000', brandName: 'Gildan', colorName: 'White', sizeName: 'XL', customerPrice: 2.89, qty: 8000 },
  ],
  '6210': [
    // Next Level 6210 CVC Crew — approximate S&S wholesale price tiers
    // Premium blank, higher cost than Gildan 5000
    { sku: '6210-BLK-S',  styleName: '6210', brandName: 'Next Level', colorName: 'Black', sizeName: 'S',  customerPrice: 5.49, qty: 2000 },
    { sku: '6210-BLK-M',  styleName: '6210', brandName: 'Next Level', colorName: 'Black', sizeName: 'M',  customerPrice: 5.49, qty: 2000 },
    { sku: '6210-BLK-L',  styleName: '6210', brandName: 'Next Level', colorName: 'Black', sizeName: 'L',  customerPrice: 5.49, qty: 2000 },
    { sku: '6210-BLK-XL', styleName: '6210', brandName: 'Next Level', colorName: 'Black', sizeName: 'XL', customerPrice: 5.49, qty: 2000 },
    { sku: '6210-WHT-S',  styleName: '6210', brandName: 'Next Level', colorName: 'White', sizeName: 'S',  customerPrice: 5.29, qty: 2000 },
    { sku: '6210-WHT-M',  styleName: '6210', brandName: 'Next Level', colorName: 'White', sizeName: 'M',  customerPrice: 5.29, qty: 2000 },
    { sku: '6210-WHT-L',  styleName: '6210', brandName: 'Next Level', colorName: 'White', sizeName: 'L',  customerPrice: 5.29, qty: 2000 },
    { sku: '6210-WHT-XL', styleName: '6210', brandName: 'Next Level', colorName: 'White', sizeName: 'XL', customerPrice: 5.29, qty: 2000 },
  ],
};
// ─── END MOCK DATA ────────────────────────────────────────────────────────────

/**
 * Fetch product data from S&S Activewear API.
 *
 * @param {string} identifier
 *   - For direct lookup: style number or comma-separated list, e.g. "5000" or "5000,6210"
 *   - For filter modes: the filter value, e.g. "Gildan 5000" or "39" or "00760"
 *
 * @param {object} [options]
 * @param {string} [options.fields]
 *   Comma-separated list of fields to return, e.g. "sku,qty,customerPrice,piecePrice"
 *   Full field list: sku, gtin, qty, customerPrice, piecePrice, dozenPrice, casePrice,
 *   retailPrice, mapPrice, salePrice, brandName, styleName, colorName, sizeName, warehouses, etc.
 *
 * @param {'style'|'styleid'|'partnumber'} [options.filterBy]
 *   Filter mode — determines the URL pattern used:
 *   - 'style'      → /v2/products/?style={identifier}       (by style name/brand, e.g. "Gildan 5000")
 *   - 'styleid'    → /v2/products/?styleid={identifier}     (by numeric styleID, e.g. "39")
 *   - 'partnumber' → /v2/products/?partnumber={identifier}  (by part number, e.g. "00760")
 *   - omitted      → /v2/products/{identifier}              (direct SKU/style lookup, default)
 *
 * @returns {Promise<Array>} Array of product variant objects from S&S
 *
 * @example
 * // Direct lookup (default)
 * fetchSSProduct('5000,6210')
 *
 * // Direct lookup with specific fields only
 * fetchSSProduct('5000', { fields: 'sku,qty,customerPrice,piecePrice' })
 *
 * // Filter by style name
 * fetchSSProduct('Gildan 5000', { filterBy: 'style' })
 *
 * // Filter by styleID with fields
 * fetchSSProduct('39', { filterBy: 'styleid', fields: 'sku,qty,customerPrice' })
 *
 * // Filter by part number
 * fetchSSProduct('00760', { filterBy: 'partnumber' })
 */
export async function fetchSSProduct(identifier, { fields, filterBy } = {}) {
  const username = process.env.SS_ACTIVEWEAR_USERNAME;
  const password = process.env.SS_ACTIVEWEAR_PASSWORD;

  // TODO: Remove mock fallback once SS_ACTIVEWEAR_USERNAME + SS_ACTIVEWEAR_PASSWORD are set.
  // When credentials are missing, return mock data for supported styles (5000, 6210).
  if (!username || !password) {
    const styleKeys = identifier.split(',').map((s) => s.trim());
    const mockResults = [];
    for (const key of styleKeys) {
      if (MOCK_SS_PRODUCTS[key]) {
        mockResults.push(...MOCK_SS_PRODUCTS[key]);
      }
    }
    if (mockResults.length > 0) {
      console.warn(`[ssActivewear] Using MOCK data for styles: ${identifier}. Set SS_ACTIVEWEAR_USERNAME + SS_ACTIVEWEAR_PASSWORD to use real pricing.`);
      return mockResults;
    }
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
    // Default: direct lookup by SKU/style number (supports comma-separated)
    url = `${SS_API_BASE}/products/${encodeURIComponent(identifier)}`;
  }

  // Append query params
  const params = new URLSearchParams({ mediaType: 'json' });
  if (fields) params.set('fields', fields);
  url = `${url}${url.includes('?') ? '&' : '?'}${params.toString()}`;

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
