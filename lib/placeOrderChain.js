/**
 * Server-side orchestration for /api/place-order. Encapsulates the FR-021
 * chain so the route handler stays a thin adapter per Principle III:
 *
 *   1. split lines by vendor and submit each vendor's order independently
 *      (S&S Activewear via createSSOrder, SanMar via submitSanMarPO) —
 *      Promise.allSettled so one vendor's failure never blocks the other's
 *      already-placed order
 *   2. fetch full invoice details for the source invoices covered by
 *      whichever vendor submission(s) succeeded
 *   3. classify each source invoice (pure)
 *   4. for fully-ordered invoices in "Ready to Order", call Printavo
 *      `setInvoiceStatus` (per-invoice independent, Promise.allSettled)
 *   5. persist one Order Attribution Record per vendor that succeeded
 *   6. return an aggregated result the route can JSON-serialize
 *
 * Spec 002-printavo-order-notification.
 */

import { createSSOrder } from './ssActivewear.js';
import { submitSanMarPO } from './sanmar/purchaseOrder.js';
import {
  getInvoicesByIds,
  setInvoiceStatus,
  GOODS_IN_TRANSIT_STATUS_ID,
  READY_TO_ORDER_STATUS_ID,
} from './printavo.js';
import { classifyInvoices } from './orderClassification.js';
import { writeRecord } from './orderAttribution.js';

/**
 * @param {Object} params
 * @param {Object} [params.shippingAddress] — S&S Activewear ship-to
 * @param {Object} [params.sanmarShipTo] — SanMar ship-to: { attention, shipTo,
 *   shipAddress1, shipAddress2, shipCity, shipState, shipZip, shipMethod,
 *   shipEmail, residence, notes }. Required if any line has vendor 'sanmar'.
 * @param {Array<{ identifier: string, vendor: 'ss-activewear'|'sanmar', qty: number, styleNumber?: string, color?: string, size?: string, sourceInvoiceId: string, sourceInvoiceVisualId: string, sourceLineItemId: string, warehouseAbbr?: string }>} params.lines
 * @param {string} [params.poNumber]
 * @param {string} [params.comments]
 * @param {string} [params.paymentProfileId]
 * @param {string} params.submittedBy — admin session email for audit only
 * @returns {Promise<{ ssOrder: Object|null, sanmarOrder: Object|null, perInvoice: Array<Object>, attributionRecords: Array<Object>, errors: { ss?: string, sanmar?: string } }>}
 */
export async function placeOrderChain({
  shippingAddress,
  sanmarShipTo,
  lines,
  poNumber,
  comments,
  paymentProfileId,
  submittedBy,
}) {
  const ssLines = lines.filter((l) => l.vendor === 'ss-activewear');
  const sanmarLines = lines.filter((l) => l.vendor === 'sanmar');

  // 1. Submit each vendor independently. One vendor's failure must not roll
  // back or block the other's already-placed order.
  const [ssSettled, sanmarSettled] = await Promise.allSettled([
    ssLines.length > 0
      ? createSSOrder({
          shippingAddress,
          lines: ssLines.map((l) => ({
            identifier: l.identifier,
            qty: l.qty,
            ...(l.warehouseAbbr ? { warehouseAbbr: l.warehouseAbbr } : {}),
          })),
          poNumber,
          comments,
          paymentProfileId,
        })
      : Promise.resolve(null),
    sanmarLines.length > 0
      ? submitSanMarPO({
          poNum: poNumber || `PO-${Date.now()}`,
          attention: sanmarShipTo?.attention,
          shipTo: sanmarShipTo?.shipTo,
          shipAddress1: sanmarShipTo?.shipAddress1,
          shipAddress2: sanmarShipTo?.shipAddress2,
          shipCity: sanmarShipTo?.shipCity,
          shipState: sanmarShipTo?.shipState,
          shipZip: sanmarShipTo?.shipZip,
          shipMethod: sanmarShipTo?.shipMethod,
          shipEmail: sanmarShipTo?.shipEmail,
          residence: sanmarShipTo?.residence,
          notes: comments,
          lines: sanmarLines.map((l) => ({
            style: l.styleNumber,
            color: l.color,
            size: l.size,
            quantity: l.qty,
          })),
        })
      : Promise.resolve(null),
  ]);

  const ssOrder = ssSettled.status === 'fulfilled' ? ssSettled.value : null;
  const ssError = ssSettled.status === 'rejected' ? (ssSettled.reason?.message || String(ssSettled.reason)) : null;
  const sanmarOrder = sanmarSettled.status === 'fulfilled' ? sanmarSettled.value : null;
  const sanmarError =
    sanmarSettled.status === 'rejected' ? (sanmarSettled.reason?.message || String(sanmarSettled.reason)) : null;

  if (ssLines.length > 0 && !ssOrder && sanmarLines.length > 0 && !sanmarOrder) {
    // Both vendors failed — nothing was placed, so propagate as a hard error
    // (route returns 500, no Printavo updates or attribution writes attempted).
    throw new Error(`S&S Activewear: ${ssError} | SanMar: ${sanmarError}`);
  }
  if (ssLines.length > 0 && sanmarLines.length === 0 && !ssOrder) {
    throw new Error(ssError);
  }
  if (sanmarLines.length > 0 && ssLines.length === 0 && !sanmarOrder) {
    throw new Error(sanmarError);
  }

  // Only lines whose vendor submission succeeded count as "ordered" for
  // classification, Printavo status updates, and attribution.
  const successfulLines = [...(ssOrder ? ssLines : []), ...(sanmarOrder ? sanmarLines : [])];

  // 2. Fetch full invoice details (so we can classify) for the unique source invoices.
  const uniqueInvoiceIds = Array.from(new Set(successfulLines.map((l) => l.sourceInvoiceId).filter(Boolean)));
  const invoices = await getInvoicesByIds(uniqueInvoiceIds);
  const currentStatusByInvoiceId = Object.fromEntries(invoices.map((i) => [i.id, i.status]));

  // 3. Classify (pure).
  const classifications = classifyInvoices({
    cartItems: successfulLines.map((l) => ({
      identifier: l.identifier,
      vendor: l.vendor,
      qty: l.qty,
      sourceInvoiceId: l.sourceInvoiceId,
      sourceInvoiceVisualId: l.sourceInvoiceVisualId,
      sourceLineItemId: l.sourceLineItemId,
    })),
    invoices,
    currentStatusByInvoiceId,
  });

  // 4. Issue Printavo status updates for fully-ordered + ReadyToOrder invoices.
  const qualifying = classifications.filter((c) => c.status === 'fully-ordered');
  const statusResults = await Promise.allSettled(
    qualifying.map(async (c) => ({
      sourceInvoiceId: c.sourceInvoiceId,
      sourceInvoiceVisualId: c.sourceInvoiceVisualId,
      result: await setInvoiceStatus(c.sourceInvoiceId, GOODS_IN_TRANSIT_STATUS_ID),
    })),
  );
  const statusUpdateByInvoiceId = new Map();
  for (let i = 0; i < qualifying.length; i++) {
    const c = qualifying[i];
    const settled = statusResults[i];
    if (settled.status === 'fulfilled') {
      statusUpdateByInvoiceId.set(c.sourceInvoiceId, {
        outcome: 'updated',
        reason: 'fully-ordered-eligible',
        previousStatus: { id: READY_TO_ORDER_STATUS_ID, name: 'Ready to Order' },
        newStatus: settled.value.result?.status || { id: GOODS_IN_TRANSIT_STATUS_ID, name: 'Goods In Transit' },
      });
    } else {
      const message = settled.reason?.message || String(settled.reason);
      console.error(`[place-order] Printavo status update failed for ${c.sourceInvoiceVisualId}: ${message}`);
      statusUpdateByInvoiceId.set(c.sourceInvoiceId, {
        outcome: 'failed',
        reason: 'printavo-error',
        errorMessage: message,
        retryEndpoint: '/api/printavo-status-update',
      });
    }
  }

  // 5. Persist one Order Attribution Record per vendor that succeeded.
  const attributionRecords = [];
  if (ssOrder) {
    const ssOrderRef =
      ssOrder?.orderNum || ssOrder?.orderNumber || `po-${(poNumber || '').replace(/[#,\s]/g, '_') || Date.now()}`;
    attributionRecords.push(
      await tryWriteRecord({
        ssOrderRef: String(ssOrderRef),
        vendor: 'ss-activewear',
        ssOrderNumber: ssOrder?.orderNumber || ssOrder?.orderNum || null,
        ssInvoiceNumber: ssOrder?.invoiceNumber || null,
        ssPoNumber: poNumber || '',
        submittedAt: new Date().toISOString(),
        submittedBy,
        lines: ssLines.map((l) => ({
          sku: l.identifier,
          qty: l.qty,
          sourceInvoiceId: l.sourceInvoiceId,
          sourceInvoiceVisualId: l.sourceInvoiceVisualId,
          sourceLineItemId: l.sourceLineItemId,
        })),
      }),
    );
  }
  if (sanmarOrder) {
    const sanmarOrderRef = `sanmar-${(poNumber || '').replace(/[#,\s]/g, '_') || Date.now()}`;
    attributionRecords.push(
      await tryWriteRecord({
        ssOrderRef: sanmarOrderRef,
        vendor: 'sanmar',
        sanmarPoNum: poNumber || '',
        submittedAt: new Date().toISOString(),
        submittedBy,
        lines: sanmarLines.map((l) => ({
          sku: l.identifier,
          qty: l.qty,
          sourceInvoiceId: l.sourceInvoiceId,
          sourceInvoiceVisualId: l.sourceInvoiceVisualId,
          sourceLineItemId: l.sourceLineItemId,
        })),
      }),
    );
  }

  // 6. Build per-invoice aggregated result.
  const perInvoice = classifications.map((c) => {
    let statusUpdate;
    if (c.status === 'fully-ordered') {
      statusUpdate = statusUpdateByInvoiceId.get(c.sourceInvoiceId) || {
        outcome: 'skipped',
        reason: 'not-attempted',
      };
    } else if (c.status === 'partial') {
      statusUpdate = { outcome: 'skipped', reason: 'partial' };
    } else {
      // skipped-not-ready
      statusUpdate = { outcome: 'skipped', reason: 'skipped-not-ready' };
    }
    return {
      sourceInvoiceId: c.sourceInvoiceId,
      sourceInvoiceVisualId: c.sourceInvoiceVisualId,
      classification: c.status,
      statusUpdate,
      partialItemsSummary:
        c.status === 'partial' || c.status === 'skipped-not-ready' ? buildPartialItemsSummary(c) : null,
    };
  });

  const errors = {};
  if (ssLines.length > 0 && !ssOrder) errors.ss = ssError;
  if (sanmarLines.length > 0 && !sanmarOrder) errors.sanmar = sanmarError;

  return {
    ssOrder,
    sanmarOrder,
    perInvoice,
    attributionRecords,
    errors,
  };
}

/**
 * Wraps `writeRecord` with the same try/catch-and-report shape the route
 * previously inlined for its single attribution write — now used once per
 * vendor that succeeded.
 */
async function tryWriteRecord(record) {
  try {
    await writeRecord(record);
    return { ssOrderRef: record.ssOrderRef, vendor: record.vendor, writeOk: true, writeError: null };
  } catch (err) {
    const writeError = err?.message || String(err);
    console.error(`[place-order] attribution record write failed (${record.vendor}): ${writeError}`);
    return { ssOrderRef: record.ssOrderRef, vendor: record.vendor, writeOk: false, writeError };
  }
}

/**
 * Map an InvoiceClassification into the PartialItemsSummary shape used on
 * the confirmation screen (US2). Re-uses the per-line-item data already
 * computed during classification. Only genuinely unresolved lines (no
 * vendor covered them) or under-quantity lines need follow-up now — a
 * fully-covered SanMar line is just as ordered as a fully-covered S&S line.
 */
function buildPartialItemsSummary(classification) {
  const lineItems = classification.lineItems.filter(
    (li) => li.stillNeeded > 0 || li.source === 'unresolved-lookup',
  );
  if (lineItems.length === 0) return null;
  return {
    sourceInvoiceVisualId: classification.sourceInvoiceVisualId,
    totalItemsStillNeeded: lineItems.reduce((s, li) => s + li.stillNeeded, 0),
    lineItems: lineItems.map((li) => ({
      sourceLineItemId: li.sourceLineItemId,
      sku: li.sku,
      description: li.description,
      invoiceQty: li.invoiceQty,
      alreadyOrdered: li.cartQty,
      stillNeeded: li.stillNeeded,
      source: li.source,
    })),
  };
}
