/**
 * Pure classification logic for the Printavo / SS Activewear ordering flow.
 *
 * For each Printavo invoice referenced by a cart submission, produce a verdict:
 *   - `fully-ordered`: every line on the invoice is SS-Activewear-matched AND
 *     the submitted cart qty is ≥ the invoice's requested qty for that line.
 *   - `partial`: at least one line is Sanmar OR not in the cart OR
 *     under-quantity.
 *   - `skipped-not-ready`: the invoice's current Printavo status is not
 *     `READY_TO_ORDER` — we refuse to overwrite it (FR-006).
 *
 * Pure functions only — MUST NOT import any I/O (`lib/orderAttribution.js`,
 * `lib/printavo.js`, `@vercel/blob`, network helpers). The caller pre-fetches
 * everything and passes it in.
 *
 * See .specify/specs/002-printavo-order-notification/data-model.md.
 */

import { READY_TO_ORDER_STATUS_ID } from './printavo.js';

/**
 * @typedef {Object} InvoiceLineItem
 * @property {string} id — Printavo line item ID
 * @property {string} itemNumber — style number (Printavo's column)
 * @property {string} [description]
 * @property {string} [color]
 * @property {number} items — total requested qty across all sizes (Printavo aggregate)
 * @property {Array<{ size: string, count: number }>} sizes
 */

/**
 * @typedef {Object} Invoice
 * @property {string} id
 * @property {string} visualId
 * @property {{ id: string, name: string }} status
 * @property {Array<InvoiceLineItem>} lineItems
 */

/**
 * @typedef {Object} CartLine
 * @property {string} identifier — vendor SKU
 * @property {'ss-activewear' | 'sanmar'} vendor
 * @property {number} qty
 * @property {string} sourceInvoiceId
 * @property {string} sourceInvoiceVisualId
 * @property {string} sourceLineItemId
 */

/**
 * @typedef {Object} LineItemStatus
 * @property {string} sourceLineItemId
 * @property {string} sku
 * @property {string} description
 * @property {number} invoiceQty
 * @property {number} cartQty
 * @property {number} stillNeeded
 * @property {'ss-activewear' | 'sanmar' | 'unresolved-lookup'} source
 * @property {boolean} includedInThisSubmission
 */

/**
 * @typedef {Object} InvoiceClassification
 * @property {string} sourceInvoiceId
 * @property {string} sourceInvoiceVisualId
 * @property {'fully-ordered' | 'partial' | 'skipped-not-ready'} status
 * @property {Array<LineItemStatus>} lineItems
 * @property {string | null} reason
 */

/**
 * Returns the Printavo line item's authoritative requested quantity.
 * Falls back to summing `sizes[].count` if `items` is missing.
 */
function invoiceQtyOf(lineItem) {
  if (typeof lineItem.items === 'number' && lineItem.items > 0) return lineItem.items;
  return (lineItem.sizes || []).reduce((sum, s) => sum + (s.count || 0), 0);
}

/**
 * Sum cart qty for a Printavo line item across any cart rows that reference
 * that line item. The cart may contain multiple SS SKUs per Printavo line
 * (one per size); they all count toward the same `sourceLineItemId`.
 */
function cartQtyForLineItem(cartItems, sourceLineItemId) {
  let total = 0;
  for (const c of cartItems) {
    if (c.sourceLineItemId === sourceLineItemId) total += c.qty || 0;
  }
  return total;
}

/**
 * For each line item, decide its source: the `vendor` of whichever cart row
 * (from this checkout) covers it, or 'unresolved-lookup' if no cart row
 * references it at all (e.g. the buyer never allocated/added it).
 */
function sourceOf(lineItem, cartItems) {
  const hit = cartItems.find((c) => c.sourceLineItemId === lineItem.id);
  return hit ? hit.vendor || 'unresolved-lookup' : 'unresolved-lookup';
}

/**
 * Classify every invoice in `invoices` against the submitted `cartItems`.
 *
 * @param {Object} params
 * @param {Array<CartLine>} params.cartItems
 * @param {Array<Invoice>} params.invoices
 * @param {Record<string, { id: string, name: string }>} [params.currentStatusByInvoiceId]
 *   Optional pre-fetched current status keyed by invoice id. If omitted, the
 *   `status` field on each invoice is used. Caller passes a fresh map when
 *   they want a tighter race-window check against FR-006.
 * @returns {Array<InvoiceClassification>}
 */
export function classifyInvoices({ cartItems, invoices, currentStatusByInvoiceId }) {
  return invoices.map((invoice) => {
    const currentStatus = currentStatusByInvoiceId?.[invoice.id] || invoice.status;
    const isReadyToOrder = String(currentStatus?.id) === String(READY_TO_ORDER_STATUS_ID);

    const lineItems = invoice.lineItems.map((li) => {
      const invoiceQty = invoiceQtyOf(li);
      const cartQty = cartQtyForLineItem(cartItems, li.id);
      const source = sourceOf(li, cartItems);
      return {
        sourceLineItemId: li.id,
        sku: li.itemNumber,
        description: [li.itemNumber, li.color, li.description].filter(Boolean).join(' · ') || li.itemNumber,
        invoiceQty,
        cartQty,
        stillNeeded: Math.max(invoiceQty - cartQty, 0),
        source,
        includedInThisSubmission: cartQty > 0,
      };
    });

    // skipped-not-ready takes precedence — never overwrite a non-Ready status.
    if (!isReadyToOrder) {
      return {
        sourceInvoiceId: invoice.id,
        sourceInvoiceVisualId: invoice.visualId,
        status: 'skipped-not-ready',
        lineItems,
        reason: `current Printavo status is "${currentStatus?.name || currentStatus?.id || 'unknown'}", not Ready to Order`,
      };
    }

    // A line ordered through either vendor counts as ordered — SS Activewear
    // and SanMar are submitted identically from this point on. An invoice is
    // only "fully-ordered" once every line has cart coverage meeting or
    // exceeding its requested qty, regardless of which vendor covers it.
    const allFullyOrdered = lineItems.every((li) => li.cartQty >= li.invoiceQty);

    if (allFullyOrdered) {
      return {
        sourceInvoiceId: invoice.id,
        sourceInvoiceVisualId: invoice.visualId,
        status: 'fully-ordered',
        lineItems,
        reason: null,
      };
    }

    const missing = lineItems.filter((li) => li.cartQty < li.invoiceQty).length;
    return {
      sourceInvoiceId: invoice.id,
      sourceInvoiceVisualId: invoice.visualId,
      status: 'partial',
      lineItems,
      reason: `${missing} line(s) under-quantity`,
    };
  });
}

/**
 * Compute the partial-items summary for a single invoice given the prior SS
 * Activewear submissions that referenced it. Used by /api/orders-partial-state
 * to render the persistent partial badge + drill-down on the orders page.
 *
 * Returns null when every line item has been fully covered by prior SS
 * submissions AND there are no Sanmar lines (i.e., nothing to follow up on).
 *
 * @param {Object} params
 * @param {Object} params.invoice — Has { sourceInvoiceVisualId, lineItems }
 *   where each line item has { sourceLineItemId, sku, description, invoiceQty, source }.
 * @param {Array<Object>} params.priorAttributionRecords — Order Attribution
 *   Records that touched this invoice. Each record has `lines: [{ sku, qty,
 *   sourceInvoiceId, sourceLineItemId }]`.
 * @returns {{ sourceInvoiceVisualId: string, totalItemsStillNeeded: number, lineItems: Array<Object> } | null}
 */
export function computePartialItemsSummary({ invoice, priorAttributionRecords }) {
  const alreadyOrderedByLineItem = new Map();
  for (const rec of priorAttributionRecords || []) {
    for (const line of rec.lines || []) {
      if (!line.sourceInvoiceId || line.sourceInvoiceId !== invoice.sourceInvoiceId) continue;
      const key = line.sourceLineItemId;
      alreadyOrderedByLineItem.set(key, (alreadyOrderedByLineItem.get(key) || 0) + (line.qty || 0));
    }
  }

  const lineItems = (invoice.lineItems || []).map((li) => {
    // Any resolved vendor's prior submissions count toward "already ordered" —
    // only a genuinely unresolved lookup means nothing has covered this line.
    const alreadyOrdered =
      li.source !== 'unresolved-lookup' ? (alreadyOrderedByLineItem.get(li.sourceLineItemId) || 0) : 0;
    return {
      sourceLineItemId: li.sourceLineItemId,
      sku: li.sku,
      description: li.description || li.sku,
      invoiceQty: li.invoiceQty || 0,
      alreadyOrdered,
      stillNeeded: Math.max((li.invoiceQty || 0) - alreadyOrdered, 0),
      source: li.source,
    };
  });

  const totalItemsStillNeeded = lineItems.reduce((sum, li) => sum + li.stillNeeded, 0);
  if (totalItemsStillNeeded === 0) return null;

  return {
    sourceInvoiceVisualId: invoice.sourceInvoiceVisualId,
    totalItemsStillNeeded,
    lineItems,
  };
}
