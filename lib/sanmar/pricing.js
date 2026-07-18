/**
 * SanMar Product Pricing service client.
 * SanMar Web Services Integration Guide, "Product getPricing Service".
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
import { buildStandardAuthBlock, escapeXml } from './auth.js';

const NAMESPACE = 'http://impl.webservice.integration.sanmar.com/';
const OPERATION = 'getPricing';

/**
 * Batch pricing lookup — SanMar's getPricing accepts multiple
 * {style,color,size} requests in ONE call (unlike inventory, which is
 * single-item per request). Returns piece/dozen/case/sale/myPrice
 * (customer-specific) pricing plus the inventoryKey/sizeIndex pair needed
 * later for purchase order submission.
 *
 * Read-only — logs on error only (Constitution Principle V).
 *
 * @param {Array<{ style: string, color: string, size: string }>} items
 * @returns {Promise<Array<object>>}
 */
export async function getSanMarPricing(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('getSanMarPricing requires at least one { style, color, size } item.');
  }

  const itemsXml = items
    .map(
      ({ style, color, size }) => `<arg0>
    <style>${escapeXml(style)}</style>
    <color>${escapeXml(color)}</color>
    <size>${escapeXml(size)}</size>
  </arg0>`
    )
    .join('\n');

  const bodyXml = `<impl:${OPERATION} xmlns:impl="${NAMESPACE}">
    ${itemsXml}
    ${buildStandardAuthBlock('arg1')}
  </impl:${OPERATION}>`;

  let xmlText;
  try {
    xmlText = await sendSoapRequest(sanmarEndpoint('pricing'), buildEnvelope(bodyXml));
  } catch (err) {
    console.error('[sanmar/pricing] request failed:', err.message);
    throw err;
  }

  let result;
  try {
    const body = parseSoapResponse(xmlText);
    result = extractOperationReturn(body, OPERATION);
    assertNoSanMarError(result, OPERATION);
  } catch (err) {
    console.error('[sanmar/pricing] response error:', err.message);
    throw err;
  }

  const list = Array.isArray(result.listResponse)
    ? result.listResponse
    : result.listResponse
      ? [result.listResponse]
      : [];

  return list.map((entry) => ({
    style: entry.style,
    color: entry.color,
    size: entry.size,
    inventoryKey: entry.inventoryKey != null ? Number(entry.inventoryKey) : undefined,
    sizeIndex: entry.sizeIndex != null ? Number(entry.sizeIndex) : undefined,
    piecePrice: entry.piecePrice != null ? Number(entry.piecePrice) : undefined,
    dozenPrice: entry.dozenPrice != null ? Number(entry.dozenPrice) : undefined,
    casePrice: entry.casePrice != null ? Number(entry.casePrice) : undefined,
    salePrice: entry.salePrice != null ? Number(entry.salePrice) : undefined,
    myPrice: entry.myPrice != null ? Number(entry.myPrice) : undefined,
  }));
}
