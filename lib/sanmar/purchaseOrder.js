/**
 * SanMar Purchase Order service client.
 * SanMar Purchase Order Integration Guide v16.3, "Web Services Purchase Order Services".
 *
 * Requires env vars: SANMAR_CUSTOMER_NUMBER, SANMAR_USERNAME, SANMAR_PASSWORD
 */

import { sanmarEndpoint, SANMAR_ENDPOINT_MODE } from './config.js';
import {
  buildEnvelope,
  sendSoapRequest,
  parseSoapResponse,
  extractOperationReturn,
  assertNoSanMarError,
} from './soapClient.js';
import { buildStandardAuthBlock, escapeXml } from './auth.js';

const NAMESPACE = 'http://webservice.integration.sanmar.com/';

const REQUIRED_FIELDS = ['poNum', 'shipAddress1', 'shipCity', 'shipState', 'shipZip'];

function validatePayload(payload) {
  const missing = REQUIRED_FIELDS.filter((f) => !payload?.[f]);
  if (missing.length > 0) {
    throw new Error(`SanMar PO payload is missing required fields: ${missing.join(', ')}`);
  }
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    throw new Error('SanMar PO payload requires at least one line item.');
  }
  for (const line of payload.lines) {
    const byKey = line.inventoryKey != null && line.sizeIndex != null;
    const byStyle = line.style && line.color && line.size;
    if (!byKey && !byStyle) {
      throw new Error(
        'Every SanMar PO line requires either { inventoryKey, sizeIndex } or { style, color, size }.'
      );
    }
    if (!line.quantity || line.quantity < 1) {
      throw new Error('Every SanMar PO line requires a quantity >= 1.');
    }
  }
}

function buildPoDetailListXml(lines) {
  return lines
    .map((line) => {
      const byKey = line.inventoryKey != null && line.sizeIndex != null;
      return `<webServicePoDetailList>
      <inventoryKey>${byKey ? escapeXml(line.inventoryKey) : ''}</inventoryKey>
      <sizeIndex>${byKey ? escapeXml(line.sizeIndex) : ''}</sizeIndex>
      <style>${!byKey ? escapeXml(line.style) : ''}</style>
      <color>${!byKey ? escapeXml(line.color) : ''}</color>
      <size>${!byKey ? escapeXml(line.size) : ''}</size>
      <quantity>${escapeXml(line.quantity)}</quantity>
      <whseNo>${line.whseNo != null ? escapeXml(line.whseNo) : ''}</whseNo>
    </webServicePoDetailList>`;
    })
    .join('\n');
}

function buildPoRequestXml(operation, payload) {
  const {
    poNum, attention, shipTo, shipAddress1, shipAddress2, shipCity, shipState, shipZip,
    shipMethod, shipEmail, residence, department, notes, lines,
  } = payload;

  return `<web:${operation} xmlns:web="${NAMESPACE}">
    <arg0>
      <attention>${escapeXml(attention || '')}</attention>
      <notes>${escapeXml(notes || '')}</notes>
      <poNum>${escapeXml(poNum)}</poNum>
      <shipTo>${escapeXml(shipTo || '')}</shipTo>
      <shipAddress1>${escapeXml(shipAddress1)}</shipAddress1>
      <shipAddress2>${escapeXml(shipAddress2 || '')}</shipAddress2>
      <shipCity>${escapeXml(shipCity)}</shipCity>
      <shipState>${escapeXml(shipState)}</shipState>
      <shipZip>${escapeXml(shipZip)}</shipZip>
      <shipMethod>${escapeXml(shipMethod || 'UPS')}</shipMethod>
      <shipEmail>${escapeXml(shipEmail || '')}</shipEmail>
      <residence>${escapeXml(residence || 'N')}</residence>
      <department>${escapeXml(department || '')}</department>
      ${buildPoDetailListXml(lines)}
    </arg0>
    ${buildStandardAuthBlock('arg1')}
  </web:${operation}>`;
}

async function callPoOperation(operation, payload) {
  validatePayload(payload);
  const envelope = buildEnvelope(buildPoRequestXml(operation, payload));

  const isSubmit = operation === 'submitPO';
  if (isSubmit) {
    // ⚠️ Mutating call — verbose logging per Constitution Principle V.
    console.log(`[sanmar/purchaseOrder] ▶ submitPO (SANMAR_ENDPOINT_MODE=${SANMAR_ENDPOINT_MODE})`);
    console.log('[sanmar/purchaseOrder] Request envelope:', envelope);
  }

  let xmlText;
  try {
    xmlText = await sendSoapRequest(sanmarEndpoint('purchaseOrder'), envelope);
  } catch (err) {
    console.error(`[sanmar/purchaseOrder] ${operation} request failed:`, err.message);
    throw err;
  }

  if (isSubmit) {
    console.log('[sanmar/purchaseOrder] ◀ Response:', xmlText);
  }

  const body = parseSoapResponse(xmlText);
  const result = extractOperationReturn(body, operation);
  assertNoSanMarError(result, operation);
  return result;
}

/**
 * Dry-run availability check — same request shape as submitPO but does NOT
 * submit an order. Confirms whether the requested quantity is available from
 * the closest warehouse to the ship-to destination.
 *
 * Read-only — logs on error only (Constitution Principle V).
 *
 * @returns {Promise<object>} the raw `response` payload, including a
 *   per-line `webServicePoDetailList` with an availability message.
 */
export async function getSanMarPOPreSubmit(payload) {
  return callPoOperation('getPreSubmitInfo', payload);
}

/**
 * Submits a real SanMar purchase order via submitPO.
 *
 * ⚠️ ALWAYS uses SANMAR_ENDPOINT_MODE === 'stage' (see lib/sanmar/config.js)
 * — this is the SanMar analog of createSSOrder's `testOrder: true`. SanMar's
 * payload has no per-request test-order flag; the endpoint selection itself
 * is the safety gate (Constitution Principle VI). Flipping
 * SANMAR_ENDPOINT_MODE to 'production' is a deliberate, reviewable code edit
 * — call it out explicitly in the PR description if that ever happens.
 *
 * Verbosely logs the full request/response (mutating call, Principle V).
 *
 * @param {Object} payload
 * @param {string} payload.poNum
 * @param {string} [payload.attention]
 * @param {string} [payload.shipTo]
 * @param {string} payload.shipAddress1
 * @param {string} [payload.shipAddress2]
 * @param {string} payload.shipCity
 * @param {string} payload.shipState
 * @param {string} payload.shipZip
 * @param {string} [payload.shipMethod]
 * @param {string} [payload.shipEmail]
 * @param {string} [payload.residence]
 * @param {string} [payload.notes]
 * @param {Array<{style,color,size,quantity,whseNo?}|{inventoryKey,sizeIndex,quantity,whseNo?}>} payload.lines
 * @returns {Promise<{ message: string }>}
 */
export async function submitSanMarPO(payload) {
  const result = await callPoOperation('submitPO', payload);
  return { message: result?.message || 'PO Submission successful' };
}
