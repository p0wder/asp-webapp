import { currentUser } from '@clerk/nextjs/server';
import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';
import { placeOrderChain } from '@/lib/placeOrderChain';
import { getSSOrderingState } from '@/lib/ssOrderingSwitch';
import { getSSOrderConfigStatus } from '@/lib/ssOrderConfigEnv';
import { logMutation, newCorrelationId, PHASES } from '@/lib/mutationLog';

/**
 * POST /api/place-order
 *
 * Submits an SS Activewear order via `lib/ssActivewear.createSSOrder`, then
 * chains: per-invoice classification → Printavo status updates for fully-
 * ordered invoices → Order Attribution Record persistence. Returns an
 * aggregated per-invoice result.
 *
 * Heavy lifting lives in `lib/placeOrderChain.js` per Constitution Principle
 * III (thin route adapters). This handler only does auth + validation +
 * delegation + response shaping.
 *
 * Request body (extends the spec-001 shape with attribution fields):
 * {
 *   shippingAddress?: {...},
 *   lines: [{ identifier, qty, sourceInvoiceId, sourceInvoiceVisualId, sourceLineItemId, warehouseAbbr? }],
 *   poNumber?: string,
 *   comments?: string,
 *   paymentProfileId?: string
 * }
 *
 * Response shape: see `.specify/specs/002-printavo-order-notification/contracts/place-order.md`.
 *
 * Returns 503 `{ error, code: 'SS_ORDERING_DISABLED', reason }` when the S&S
 * kill switch is closed (TG-001-02), or 503
 * `{ error, code: 'SS_ORDER_CONFIG_INVALID', fields }` when the S&S operating
 * configuration is missing or malformed (TG-001-10). In both cases no supplier
 * or Printavo call is made. See "S&S Ordering Kill Switch" and "S&S Order
 * Configuration" in README.md.
 *
 * Every response path carries a `correlationId`, which is also the `cid` on
 * the `[mutation]` log lines for this submission (TG-001-08).
 */
export async function POST(request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const correlationId = newCorrelationId();

  // ── Kill switch (TG-001-02) ─────────────────────────────────────────────
  // Checked before body validation and before any delegation, so a disabled
  // switch reaches neither S&S nor Printavo. `createSSOrder` enforces the same
  // gate independently; this layer exists to give callers a stable HTTP
  // contract instead of a 500 from a thrown adapter error.
  const ssOrdering = getSSOrderingState();
  if (!ssOrdering.allowed) {
    logMutation({
      correlationId,
      system: 'ss',
      operation: 'placeOrder',
      phase: PHASES.BLOCKED,
      fields: { blockedBy: 'killSwitch', reason: ssOrdering.reason },
    });
    return NextResponse.json(
      {
        error: 'S&S ordering is currently disabled. No order was submitted.',
        code: 'SS_ORDERING_DISABLED',
        reason: ssOrdering.reason,
        correlationId,
      },
      { status: 503 },
    );
  }

  // ── Operating configuration (TG-001-10) ─────────────────────────────────
  // Same reasoning as above: `createSSOrder` re-validates independently, but
  // rejecting here turns an invalid configuration into a stable 503 rather
  // than a 500, and names the offending fields so an operator can fix them.
  const ssConfig = getSSOrderConfigStatus();
  if (!ssConfig.ok) {
    logMutation({
      correlationId,
      system: 'ss',
      operation: 'placeOrder',
      phase: PHASES.BLOCKED,
      fields: { blockedBy: 'configuration', errorFields: ssConfig.errorFields },
    });
    return NextResponse.json(
      {
        error: 'S&S order configuration is invalid. No order was submitted.',
        code: 'SS_ORDER_CONFIG_INVALID',
        fields: ssConfig.errorFields,
        correlationId,
      },
      { status: 503 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const { shippingAddress, lines, poNumber, comments, paymentProfileId } = body || {};

  if (shippingAddress) {
    const required = ['name', 'address', 'city', 'state', 'zip', 'country'];
    const missing = required.filter((f) => !shippingAddress[f]);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `shippingAddress is missing required fields: ${missing.join(', ')}` },
        { status: 400 },
      );
    }
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json(
      { error: 'lines must be a non-empty array of { identifier, qty, sourceInvoiceId, sourceInvoiceVisualId, sourceLineItemId } objects.' },
      { status: 400 },
    );
  }

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const errors = [];
    if (!l.identifier) errors.push('identifier');
    if (!l.qty || l.qty < 1) errors.push('qty (≥ 1)');
    if (!l.sourceInvoiceId) errors.push('sourceInvoiceId');
    if (!l.sourceInvoiceVisualId) errors.push('sourceInvoiceVisualId');
    if (!l.sourceLineItemId) errors.push('sourceLineItemId');
    if (errors.length) {
      return NextResponse.json(
        { error: `lines[${i}] missing or invalid: ${errors.join(', ')}` },
        { status: 400 },
      );
    }
  }

  // The submission's own preflight and outcome lines come from
  // `createSSOrder`; this one records that the route accepted the request.
  // `paymentProfileId` is deliberately reduced to a boolean — it is a payment
  // identifier, which the security floor keeps out of logs (variance V12).
  logMutation({
    correlationId,
    system: 'ss',
    operation: 'placeOrder',
    phase: PHASES.ATTEMPT,
    fields: {
      mode: ssConfig.summary.mode,
      testOrder: ssConfig.summary.testOrder,
      lineCount: lines.length,
      poNumber: poNumber ?? null,
      hasPaymentProfile: Boolean(paymentProfileId),
    },
  });

  try {
    const user = await currentUser();
    const submittedBy =
      user?.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ||
      user?.fullName ||
      'unknown';

    const result = await placeOrderChain({
      shippingAddress,
      lines,
      poNumber,
      comments,
      paymentProfileId,
      submittedBy,
      correlationId,
    });
    logMutation({
      correlationId,
      system: 'ss',
      operation: 'placeOrder',
      phase: PHASES.SUCCESS,
      fields: {
        ssOrderRef: result.attributionRecord.ssOrderRef,
        attribWriteOk: result.attributionRecord.writeOk,
        perInvoice: result.perInvoice.map((p) => ({
          visualId: p.sourceInvoiceVisualId,
          classification: p.classification,
          statusOutcome: p.statusUpdate?.outcome,
        })),
      },
    });
    return NextResponse.json({ ok: true, correlationId, ...result });
  } catch (err) {
    // SS Activewear submission itself failed — no Printavo updates or
    // attribution writes were attempted (per FR-007).
    logMutation({
      correlationId,
      system: 'ss',
      operation: 'placeOrder',
      phase: PHASES.FAILURE,
      error: err,
    });
    // The vendor's message can embed a whole payload, so it is not returned
    // to the caller. `correlationId` is how support finds the detail in logs.
    return NextResponse.json(
      {
        error: 'Order submission failed. See server logs for this correlation ID.',
        code: err?.code ?? 'SS_ORDER_FAILED',
        correlationId,
      },
      { status: 500 },
    );
  }
}
