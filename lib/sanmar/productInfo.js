/**
 * SanMar Product Info service client.
 * SanMar Web Services Integration Guide, "Product Information Services".
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
const OPERATION = 'getProductInfoByStyleColorSize';

/**
 * Looks up SanMar product info for a style, optionally filtered by color
 * and/or size. Mirrors lib/ssActivewear.js's fetchSSProduct() as the
 * on-demand per-style lookup primitive.
 *
 * Read-only — logs on error only (Constitution Principle V).
 *
 * @param {string} style
 * @param {{ color?: string, size?: string }} [filters]
 * @returns {Promise<Array<object>>} one entry per matching style/color/size variant
 */
export async function fetchSanMarProduct(style, { color, size } = {}) {
  const bodyXml = `<impl:${OPERATION} xmlns:impl="${NAMESPACE}">
    <arg0>
      <style>${escapeXml(style)}</style>
      ${color ? `<color>${escapeXml(color)}</color>` : ''}
      ${size ? `<size>${escapeXml(size)}</size>` : ''}
    </arg0>
    ${buildStandardAuthBlock('arg1')}
  </impl:${OPERATION}>`;

  let xmlText;
  try {
    xmlText = await sendSoapRequest(sanmarEndpoint('productInfo'), buildEnvelope(bodyXml));
  } catch (err) {
    console.error('[sanmar/productInfo] request failed:', err.message);
    throw err;
  }

  let result;
  try {
    const body = parseSoapResponse(xmlText);
    result = extractOperationReturn(body, OPERATION);
    assertNoSanMarError(result, OPERATION);
  } catch (err) {
    console.error('[sanmar/productInfo] response error:', err.message);
    throw err;
  }

  const list = result.listResponse;
  const entries = Array.isArray(list) ? list : list ? [list] : [];

  return entries.map(normalizeProductEntry);
}

function normalizeProductEntry(entry) {
  const basic = entry.productBasicInfo || {};
  const price = entry.productPriceInfo || {};
  return {
    style: basic.style,
    color: basic.catalogColor || basic.color,
    size: basic.size,
    brandName: basic.brandName,
    productTitle: basic.productTitle,
    productStatus: basic.productStatus,
    caseSize: basic.caseSize != null ? Number(basic.caseSize) : undefined,
    inventoryKey: basic.inventoryKey != null ? Number(basic.inventoryKey) : undefined,
    sizeIndex: basic.sizeIndex != null ? Number(basic.sizeIndex) : undefined,
    piecePrice: price.piecePrice != null ? Number(price.piecePrice) : undefined,
    dozenPrice: price.dozenPrice != null ? Number(price.dozenPrice) : undefined,
    casePrice: price.casePrice != null ? Number(price.casePrice) : undefined,
  };
}
