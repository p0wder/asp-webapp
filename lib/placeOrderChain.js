/**
 * Server-side orchestration for /api/place-order. Encapsulates the FR-021
 * chain so the route handler stays a thin adapter per Principle III:
 *
 *   1. submit SS Activewear order
 *   2. fetch full invoice details for the source invoices
 *   3. classify each source invoice (pure)
 *   4. for fully-ordered invoices in "Ready to Order", call Printavo
 *      `setInvoiceStatus` (per-invoice independent, Promise.allSettled)
 *   5. persist the Order Attribution Record
 *   6. return an aggregated result the route can JSON-serialize
 *
 * Spec 002-printavo-order-notification.
 */

import { createSSOrder } from './ssActivewear.js';
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
 * @param {Object} [params.shippingAddress]
 * @param {Array<{ identifier: string, qty: number, sourceInvoiceId: string, sourceInvoiceVisualId: string, sourceLineItemId: string, warehouseAbbr?: string }>} params.lines
 * @param {string} [params.poNumber]
 * @param {string} [params.comments]
 * @param {string} [params.paymentProfileId]
 * @param {string} params.submittedBy — admin session email for audit only
 * @returns {Promise<{ ssOrder: Object, perInvoice: Array<Object>, attributionRecord: { ssOrderRef: string, writeOk: boolean, writeError: string | null } }>}
 */
export async function placeOrderChain({
  shippingAddress,
  lines,
  poNumber,
  comments,
  paymentProfileId,
  submittedBy,
}) {
  // 1. Submit to SS Activewear. Throws on failure — the route propagates.
  const ssOrder = await createSSOrder({
    shippingAddress,
    lines: lines.map((l) => ({
      identifier: l.identifier,
      qty: l.qty,
      ...(l.warehouseAbbr ? { warehouseAbbr: l.warehouseAbbr } : {}),
    })),
    poNumber,
    comments,
    paymentProfileId,
  });

  // 2. Fetch full invoice details (so we can classify) for the unique source invoices.
  const uniqueInvoiceIds = Array.from(new Set(lines.map((l) => l.sourceInvoiceId).filter(Boolean)));
  const invoices = await getInvoicesByIds(uniqueInvoiceIds);
  const invoicesById = new Map(invoices.map((i) => [i.id, i]));
  const currentStatusByInvoiceId = Object.fromEntries(invoices.map((i) => [i.id, i.status]));

  // 3. Classify (pure).
  const classifications = classifyInvoices({
    cartItems: lines.map((l) => ({
      identifier: l.identifier,
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

  // 5. Persist the Order Attribution Record.
  const ssOrderRef =
    ssOrder?.orderNum || ssOrder?.orderNumber || `po-${(poNumber || '').replace(/[#,\s]/g, '_') || Date.now()}`;
  const record = {
    ssOrderRef: String(ssOrderRef),
    ssOrderNumber: ssOrder?.orderNumber || ssOrder?.orderNum || null,
    ssInvoiceNumber: ssOrder?.invoiceNumber || null,
    ssPoNumber: poNumber || '',
    submittedAt: new Date().toISOString(),
    submittedBy,
    lines: lines.map((l) => ({
      sku: l.identifier,
      qty: l.qty,
      sourceInvoiceId: l.sourceInvoiceId,
      sourceInvoiceVisualId: l.sourceInvoiceVisualId,
      sourceLineItemId: l.sourceLineItemId,
    })),
  };
  let attributionWriteOk = true;
  let attributionWriteError = null;
  try {
    await writeRecord(record);
  } catch (err) {
    attributionWriteOk = false;
    attributionWriteError = err?.message || String(err);
    console.error(`[place-order] attribution record write failed: ${attributionWriteError}`);
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
        c.status === 'partial' || c.status === 'skipped-not-ready'
          ? buildPartialItemsSummary(c)
          : null,
    };
  });

  return {
    ssOrder,
    perInvoice,
    attributionRecord: {
      ssOrderRef: record.ssOrderRef,
      writeOk: attributionWriteOk,
      writeError: attributionWriteError,
    },
  };
}

/**
 * Map an InvoiceClassification into the PartialItemsSummary shape used on
 * the confirmation screen (US2). Re-uses the per-line-item data already
 * computed during classification.
 */
function buildPartialItemsSummary(classification) {
  const lineItems = classification.lineItems.filter(
    (li) => li.stillNeeded > 0 || li.source !== 'ss-activewear',
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
