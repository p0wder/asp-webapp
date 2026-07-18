/**
 * SanMar Web Services endpoint configuration.
 *
 * ⚠️  SANMAR_ENDPOINT_MODE is ALWAYS 'stage' — flip to 'production' only as a
 *     deliberate, reviewable code edit when going live. SanMar's SOAP API has
 *     no per-request "test order" flag (unlike S&S Activewear's `testOrder:
 *     true` in lib/ssActivewear.js) — every service (product info, inventory,
 *     pricing, purchase orders, invoicing, notifications) is split into a
 *     separate stage vs. production WSDL endpoint, so the endpoint selection
 *     itself IS the safety gate for this integration (Constitution Principle
 *     VI — Safety Defaults for Real-World Side Effects). If this is ever
 *     changed to 'production', call that out explicitly in the PR description.
 */
export const SANMAR_ENDPOINT_MODE = 'stage'; // 'stage' | 'production'

const ENDPOINTS = {
  stage: {
    productInfo: 'https://stage-ws.sanmar.com:8080/SanMarWebService/SanMarProductInfoServicePort',
    inventory: 'https://stage-ws.sanmar.com:8080/SanMarWebService/SanMarWebServicePort',
    pricing: 'https://stage-ws.sanmar.com:8080/SanMarWebService/SanMarPricingServicePort',
    purchaseOrder: 'https://stage-ws.sanmar.com:8080/SanMarWebService/SanMarPOServicePort',
    notification: 'https://stage-ws.sanmar.com:8080/SanMarWebService/SanMarNotificationServicePort',
    invoice: 'https://stage-ws.sanmar.com:8080/SanMarWebService/InvoicePort',
  },
  production: {
    productInfo: 'https://ws.sanmar.com:8080/SanMarWebService/SanMarProductInfoServicePort',
    inventory: 'https://ws.sanmar.com:8080/SanMarWebService/SanMarWebServicePort',
    pricing: 'https://ws.sanmar.com:8080/SanMarWebService/SanMarPricingServicePort',
    purchaseOrder: 'https://ws.sanmar.com:8080/SanMarWebService/SanMarPOServicePort',
    notification: 'https://ws.sanmar.com:8080/SanMarWebService/SanMarNotificationServicePort',
    invoice: 'https://ws.sanmar.com:8080/SanMarWebService/InvoicePort',
  },
};

/**
 * Returns the SOAP endpoint URL for a given SanMar service, honoring
 * SANMAR_ENDPOINT_MODE.
 *
 * `service` is one of:
 *   'productInfo' | 'inventory' | 'pricing' | 'purchaseOrder' | 'notification' | 'invoice'
 *
 * Note: SanMar's published WSDL discovery URLs append `?wsdl` (e.g.
 * `.../SanMarProductInfoServicePort?wsdl`) — that query param is only for
 * fetching the schema in a browser or SoapUI. Actual SOAP operation calls
 * POST to the same URL without the `?wsdl` suffix.
 */
export function sanmarEndpoint(service) {
  const url = ENDPOINTS[SANMAR_ENDPOINT_MODE]?.[service];
  if (!url) {
    throw new Error(`Unknown SanMar service "${service}".`);
  }
  return url;
}

/**
 * Reads and validates the standard SanMar account credentials from env vars.
 * Used by every service in this Phase (Product Info, Inventory, Pricing).
 * Invoicing uses differently-named request fields (CustomerNo/UserName/
 * Password) for the same underlying sanmar.com login — handled separately
 * where that service is implemented.
 */
export function readSanMarCredentials() {
  const customerNumber = process.env.SANMAR_CUSTOMER_NUMBER;
  const username = process.env.SANMAR_USERNAME;
  const password = process.env.SANMAR_PASSWORD;

  if (!customerNumber || !username || !password) {
    throw new Error(
      'SANMAR_CUSTOMER_NUMBER, SANMAR_USERNAME, and SANMAR_PASSWORD are required.'
    );
  }

  return { customerNumber, username, password };
}
