/**
 * Shared SOAP request/response plumbing for the SanMar Web Services API.
 *
 * SanMar's services are SOAP 1.1 / XML, not REST — there is no single base
 * URL or auth header; each service (product info, inventory, pricing,
 * purchase orders, invoicing, notifications) has its own WSDL endpoint (see
 * config.js) and credentials are embedded in the request body per call.
 */

import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });

/**
 * Wraps a SOAP body XML fragment in a SOAP 1.1 envelope.
 * @param {string} bodyXml - the `<op>...</op>` fragment (with its own xmlns).
 */
export function buildEnvelope(bodyXml) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    ${bodyXml}
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * POSTs a SOAP envelope to a SanMar endpoint and returns the raw XML response text.
 * Throws on non-2xx HTTP responses. SanMar's own application-level errors
 * (bad style, auth failure, etc.) come back as HTTP 200 with
 * `errorOccurred`/`errorOccured` set — see assertNoSanMarError().
 */
export async function sendSoapRequest(endpointUrl, envelope, soapAction = '') {
  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: soapAction,
    },
    body: envelope,
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(
      `SanMar SOAP request to ${endpointUrl} failed: HTTP ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
    );
  }

  return text;
}

/**
 * Parses a raw SOAP XML response into a plain object and unwraps the
 * soap:Envelope/soap:Body wrapper (namespace prefixes are stripped).
 */
export function parseSoapResponse(xmlText) {
  const parsed = parser.parse(xmlText);
  const envelope = parsed.Envelope;
  if (!envelope) {
    throw new Error('SanMar SOAP response missing Envelope element.');
  }
  return envelope.Body;
}

/**
 * Extracts the `<return>` payload from a `<opNameResponse>` element, which is
 * the shape used by Product Info, Inventory, Pricing, and Purchase Order
 * services. Falls back to the response element itself if there's no nested
 * `return` (some services vary).
 */
export function extractOperationReturn(body, operationName) {
  const responseKey = `${operationName}Response`;
  const response = body?.[responseKey];
  if (!response) {
    throw new Error(`SanMar SOAP response missing ${responseKey} element.`);
  }
  return response.return ?? response;
}

/**
 * Throws if a SanMar `return` payload indicates an application-level error.
 * SanMar services return HTTP 200 with an error flag + `message` string on
 * failure — this is NOT surfaced as an HTTP error code. Note SanMar's own
 * guide is inconsistent about the field name across services: some use the
 * correctly-spelled `errorOccurred`, others the typo'd `errorOccured` — both
 * are checked here.
 */
export function assertNoSanMarError(returnPayload, context) {
  const raw = returnPayload?.errorOccurred ?? returnPayload?.errorOccured;
  const errored = raw === true || raw === 'true';
  if (errored) {
    throw new Error(`SanMar ${context} error: ${returnPayload?.message || 'unknown error'}`);
  }
}
