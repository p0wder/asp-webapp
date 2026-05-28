/**
 * POST /api/orders-partial-state
 *
 * For each `Ready to Order` invoice on the orders page, compute the
 * per-line-item partial-state shortfall by reading local Order Attribution
 * Records and corroborating with SS Activewear order history.
 *
 * Implements FR-013, FR-014, FR-015, FR-019, FR-020 per
 * `.specify/specs/002-printavo-order-notification/contracts/orders-partial-state.md`.
 *
 * Read-only orchestration — Principle III (thin adapter): auth → validate →
 * orchestrate via lib helpers → respond. Per Principle V, logs only on error
 * or rate-limit pressure.
 */

import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';
import { listRecordsForInvoice } from '@/lib/orderAttribution';
import { computePartialItemsSummary } from '@/lib/orderClassification';
import { getSSOrdersByPO } from '@/lib/ssActivewear';

const ALLOWED_SOURCES = new Set(['ss-activewear', 'sanmar', 'unresolved-lookup']);

/**
 * Validate the request payload. Returns `null` on success or a string error
 * message describing the first defect found.
 *
 * @param {any} body
 * @returns {string | null}
 */
function validateBody(body) {
  if (!body || typeof body !== 'object') return 'Request body must be a JSON object.';
  if (!Array.isArray(body.invoices) || body.invoices.length === 0) {
    return 'invoices must be a non-empty array.';
  }
  for (let i = 0; i < body.invoices.length; i++) {
    const inv = body.invoices[i];
    if (!inv || typeof inv !== 'object') return `invoices[${i}] must be an object.`;
    if (!inv.sourceInvoiceVisualId || typeof inv.sourceInvoiceVisualId !== 'string') {
      return `invoices[${i}].sourceInvoiceVisualId is required (non-empty string).`;
    }
    if (!Array.isArray(inv.lineItems) || inv.lineItems.length === 0) {
      return `invoices[${i}].lineItems must be a non-empty array.`;
    }
    for (let j = 0; j < inv.lineItems.length; j++) {
      const li = inv.lineItems[j];
      if (!li || typeof li !== 'object') return `invoices[${i}].lineItems[${j}] must be an object.`;
      if (!li.sourceLineItemId) return `invoices[${i}].lineItems[${j}].sourceLineItemId is required.`;
      if (!li.sku) return `invoices[${i}].lineItems[${j}].sku is required.`;
      if (typeof li.invoiceQty !== 'number' || !Number.isFinite(li.invoiceQty) || li.invoiceQty < 0) {
        return `invoices[${i}].lineItems[${j}].invoiceQty must be a number >= 0.`;
      }
      if (!ALLOWED_SOURCES.has(li.source)) {
        return `invoices[${i}].lineItems[${j}].source must be one of: ${Array.from(ALLOWED_SOURCES).join(', ')}.`;
      }
    }
  }
  return null;
}

/**
 * Determine whether an SS order returned by GET /v2/orders/ corresponds to a
 * locally-stored attribution record (by ssOrderRef). The contract permits
 * matching against the SS order's orderNumber, invoiceNumber, or a substring
 * of the comma-joined poNumber.
 *
 * @param {string} ssOrderRef
 * @param {Object} ssOrder
 * @returns {boolean}
 */
function ssOrderMatchesRef(ssOrderRef, ssOrder) {
  if (!ssOrder || !ssOrderRef) return false;
  const refStr = String(ssOrderRef);
  if (ssOrder.orderNumber != null && String(ssOrder.orderNumber) === refStr) return true;
  if (ssOrder.invoiceNumber != null && String(ssOrder.invoiceNumber) === refStr) return true;
  if (ssOrder.poNumber && typeof ssOrder.poNumber === 'string' && ssOrder.poNumber.includes(refStr)) {
    return true;
  }
  return false;
}

/**
 * Build the shape `computePartialItemsSummary` expects from the request
 * invoice payload. Also returns null when there is no shortfall (no Sanmar
 * coverage gap and every SS line is fully covered).
 */
function buildInvoiceForSummary(invoiceFromRequest) {
  // Attach sourceInvoiceId-equivalent for the cross-check inside the pure
  // helper. The pure helper compares records' sourceInvoiceId. Our attribution
  // record lines carry sourceInvoiceId (the GraphQL node ID); the request
  // carries sourceInvoiceId on the invoice when available.
  return {
    sourceInvoiceId: invoiceFromRequest.sourceInvoiceId,
    sourceInvoiceVisualId: invoiceFromRequest.sourceInvoiceVisualId,
    lineItems: invoiceFromRequest.lineItems.map((li) => ({
      sourceLineItemId: li.sourceLineItemId,
      sku: li.sku,
      description: li.description || li.sku,
      invoiceQty: li.invoiceQty,
      source: li.source,
    })),
  };
}

/**
 * Resolve partial state for a single invoice. Returns one entry in the
 * `results` array per the contract.
 *
 * @param {Object} invoiceReq
 * @param {{ skipSsCorroboration: boolean }} flags
 * @returns {Promise<{ result: Object, rateLimitRemaining: number | null }>}
 */
async function resolveInvoice(invoiceReq, flags) {
  const visualId = invoiceReq.sourceInvoiceVisualId;
  const summaryInvoice = buildInvoiceForSummary(invoiceReq);

  // 1. Load local attribution records for this invoice.
  let records;
  try {
    records = await listRecordsForInvoice(visualId);
  } catch (err) {
    console.error(`[orders-partial-state] derivation failed for invoice ${visualId}: attribution-record-missing (${err?.message || err})`);
    return {
      result: {
        sourceInvoiceVisualId: visualId,
        state: 'unavailable',
        partialItemsSummary: null,
        unavailableReason: 'attribution-record-missing',
        unavailableMessage: err?.message || String(err),
      },
      rateLimitRemaining: null,
    };
  }

  if (!records || records.length === 0) {
    return {
      result: {
        sourceInvoiceVisualId: visualId,
        state: 'no-coverage',
        partialItemsSummary: null,
      },
      rateLimitRemaining: null,
    };
  }

  // 2. (Mandatory per FR-019) Corroborate with SS Activewear order history.
  //    If rate-limit pressure has caused us to skip the SS call for this
  //    invoice, fall back to local records only and mark corroborationSkipped.
  let survivingRecords = records;
  let rateLimitRemaining = null;
  let corroborationSkipped = false;

  if (flags.skipSsCorroboration) {
    corroborationSkipped = true;
  } else {
    try {
      const { orders: ssOrders, rateLimit } = await getSSOrdersByPO(visualId);
      rateLimitRemaining = rateLimit?.remaining ?? null;
      // Cross-check: exclude any local record whose ssOrderRef is NOT present
      // in the SS response (e.g., canceled in SS UI).
      survivingRecords = records.filter((rec) =>
        ssOrders.some((order) => ssOrderMatchesRef(rec.ssOrderRef, order)),
      );
    } catch (err) {
      console.error(`[orders-partial-state] derivation failed for invoice ${visualId}: ss-history-lookup-failed (${err?.message || err})`);
      return {
        result: {
          sourceInvoiceVisualId: visualId,
          state: 'unavailable',
          partialItemsSummary: null,
          unavailableReason: 'ss-history-lookup-failed',
          unavailableMessage: err?.message || String(err),
        },
        rateLimitRemaining: null,
      };
    }
  }

  // 3. Compute the per-line-item shortfall via the pure helper. Null result
  //    means every line is fully covered with no Sanmar follow-up needed.
  const summary = computePartialItemsSummary({
    invoice: summaryInvoice,
    priorAttributionRecords: survivingRecords,
  });

  const baseResult = {
    sourceInvoiceVisualId: visualId,
    state: summary ? 'partial' : 'fully-covered',
    partialItemsSummary: summary,
  };
  if (corroborationSkipped) baseResult.corroborationSkipped = true;

  return { result: baseResult, rateLimitRemaining };
}

export async function POST(request) {
  // Defence-in-depth auth per Constitution VII (proxy.js matcher is the
  // first layer; this is the second).
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const validationError = validateBody(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Process invoices in parallel; per FR-012 one invoice's failure must not
  // block another. Promise.allSettled guarantees that.
  //
  // Soft rate-limit handling: once any SS call surfaces `remaining < 10` we
  // flip `skipSsCorroboration` for subsequent calls. Because allSettled fires
  // all promises simultaneously, the flag is best-effort — invoices that
  // already started will still hit SS, but any that haven't picked up the
  // shared flag yet will fall through to local-only.
  const flags = { skipSsCorroboration: false };
  let rateLimitWarningLogged = false;

  const settled = await Promise.allSettled(
    body.invoices.map((inv) =>
      resolveInvoice(inv, flags).then((res) => {
        if (
          res.rateLimitRemaining !== null &&
          res.rateLimitRemaining < 10 &&
          !flags.skipSsCorroboration
        ) {
          flags.skipSsCorroboration = true;
          if (!rateLimitWarningLogged) {
            console.warn(
              `[orders-partial-state] SS rate-limit pressure: X-Rate-Limit-Remaining=${res.rateLimitRemaining}`,
            );
            rateLimitWarningLogged = true;
          }
        }
        return res.result;
      }),
    ),
  );

  const results = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    const visualId = body.invoices[i]?.sourceInvoiceVisualId ?? null;
    const message = s.reason?.message || String(s.reason);
    console.error(
      `[orders-partial-state] derivation failed for invoice ${visualId}: unexpected error (${message})`,
    );
    return {
      sourceInvoiceVisualId: visualId,
      state: 'unavailable',
      partialItemsSummary: null,
      unavailableReason: 'attribution-record-missing',
      unavailableMessage: message,
    };
  });

  return NextResponse.json({ ok: true, results });
}
