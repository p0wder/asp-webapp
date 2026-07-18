/**
 * SanMar Product Inventory service client.
 * SanMar Web Services Integration Guide, "Product Inventory Services".
 *
 * Requires env vars: SANMAR_CUSTOMER_NUMBER, SANMAR_USERNAME, SANMAR_PASSWORD
 */

import { sanmarEndpoint } from './config.js';
import {
  buildEnvelope,
  sendSoapRequest,
  parseSoapResponse,
  extractOperationReturn,
  assertNoSanMarError,
} from './soapClient.js';
import { buildInventoryAuthArgs, escapeXml } from './auth.js';

const NAMESPACE = 'http://webservice.integration.sanmar.com/';

/**
 * SanMar warehouse numbers, in the fixed order the inventory service returns
 * quantities — the response has no warehouse identifier per entry, only a
 * flat ordered list that must be zipped against this table. See SanMar Web
 * Services Integration Guide, "Warehouse Location Designations". Warehouse
 * 12 (Phoenix, AZ) is out of numeric order due to SanMar's internal virtual
 * warehouse assignments (8-11 are not customer-facing).
 */
export const SANMAR_WAREHOUSES = [
  { whseNo: 1, city: 'Seattle', state: 'WA' },
  { whseNo: 2, city: 'Cincinnati', state: 'OH' },
  { whseNo: 3, city: 'Dallas', state: 'TX' },
  { whseNo: 4, city: 'Reno', state: 'NV' },
  { whseNo: 5, city: 'Robbinsville', state: 'NJ' },
  { whseNo: 6, city: 'Jacksonville', state: 'FL' },
  { whseNo: 7, city: 'Minneapolis', state: 'MN' },
  { whseNo: 12, city: 'Phoenix', state: 'AZ' },
];

/**
 * Returns available quantity (capped at 500 by SanMar — "500" can mean
 * "500 or more") for a style/color/size, either across all warehouses or
 * from a single warehouse if `warehouseNo` is given.
 *
 * Read-only — logs on error only (Constitution Principle V).
 *
 * @param {string} style
 * @param {string} color
 * @param {string} size
 * @param {{ warehouseNo?: number }} [options]
 * @returns {Promise<Array<{ whseNo: number, city: string, state: string, qty: number }>>}
 */
export async function fetchSanMarInventory(style, color, size, { warehouseNo } = {}) {
  const singleWarehouse = warehouseNo != null;
  const operation = singleWarehouse
    ? 'getInventoryQtyForStyleColorSizeByWhse'
    : 'getInventoryQtyForStyleColorSize';

  const bodyXml = `<web:${operation} xmlns:web="${NAMESPACE}">
    ${buildInventoryAuthArgs()}
    <arg3>${escapeXml(style)}</arg3>
    <arg4>${escapeXml(color)}</arg4>
    <arg5>${escapeXml(size)}</arg5>
    ${singleWarehouse ? `<arg6>${escapeXml(warehouseNo)}</arg6>` : ''}
  </web:${operation}>`;

  let xmlText;
  try {
    xmlText = await sendSoapRequest(sanmarEndpoint('inventory'), buildEnvelope(bodyXml));
  } catch (err) {
    console.error('[sanmar/inventory] request failed:', err.message);
    throw err;
  }

  let result;
  try {
    const body = parseSoapResponse(xmlText);
    result = extractOperationReturn(body, operation);
    assertNoSanMarError(result, operation);
  } catch (err) {
    console.error('[sanmar/inventory] response error:', err.message);
    throw err;
  }

  if (singleWarehouse) {
    const warehouse = SANMAR_WAREHOUSES.find((w) => w.whseNo === Number(warehouseNo));
    return [{ ...warehouse, qty: Number(result.response ?? 0) }];
  }

  const list = Array.isArray(result.listResponse) ? result.listResponse : [result.listResponse];
  return SANMAR_WAREHOUSES.map((warehouse, i) => ({
    ...warehouse,
    qty: Number(list[i] ?? 0),
  }));
}
