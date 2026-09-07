import { NextResponse } from 'next/server';
import { constructWebhookEvent } from '@/lib/stripe';
import { recordInvoicePayment } from '@/lib/printavo';
import {
  readReceipt,
  writeReceipt,
  decideFromReceipt,
  RECEIPT_STATUS,
} from '@/lib/webhookReceipts';
import { logMutation, newCorrelationId, PHASES } from '@/lib/mutationLog';

// Stripe sends the raw body — Next.js App Router gives us access via
// request.text(). Signature verification requires the exact raw bytes; do not
// parse as JSON first.

/**
 * POST /api/stripe-webhook
 *
 * ── What changed (TG-001-05, partial — see below) ────────────────────────
 * This handler used to write the Printavo `paymentCreate` mutation inline
 * (variance V9 — the only external mutation in the repo not behind a `lib/`
 * client), keep no record of what it had processed, and — on a failed write —
 * log the error and return **200**, with the comment "so Stripe doesn't
 * retry". A collected payment therefore went unrecorded, permanently and
 * silently, recoverable only by someone reading logs.
 *
 * Now: the mutation lives in `lib/printavo.js`; a durable intent record is
 * written before the effect; a redelivery of an already-applied event is
 * skipped; and a failed write returns 500 so Stripe *does* retry, which is
 * safe precisely because the receipt stops the retry from double-applying.
 *
 * ── What remains blocked ─────────────────────────────────────────────────
 * TG-001-05's AC2 requires exactly one business effect per event under any
 * delivery pattern. That needs a conditional write, which needs the datastore
 * tracked as TG-003-03 (variance V1). Receipts live in Vercel Blob, which has
 * no compare-and-swap, so two *simultaneous* deliveries of the same event can
 * still both proceed. Sequential redelivery — the shape Stripe retries take —
 * is handled. See `lib/webhookReceipts.js` for the full caveat.
 */
export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  let event;
  try {
    // Signature verification IS the abuse control for this public route. An
    // invalid signature means the request did not come from Stripe, and no
    // receipt is written and no effect is applied (AC1).
    event = constructWebhookEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err?.message || err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object;
  const invoiceId = session.metadata?.invoiceId;
  const amountCents = session.amount_total;
  // Prefer the correlation ID minted when the Checkout session was created, so
  // the payment traces back to the request that started it (TG-001-08 AC2).
  const correlationId = session.metadata?.correlationId || newCorrelationId();

  const baseFields = {
    eventId: event.id,
    invoiceId: invoiceId ?? null,
    amountCents: amountCents ?? null,
    snapshotId: session.metadata?.snapshotId ?? null,
    // Set when the balance moved between session creation and completion.
    quotedAmountCents: session.metadata?.amountCents
      ? Number(session.metadata.amountCents)
      : null,
  };

  if (!invoiceId) {
    // Nothing to apply, but record that we saw it — a completed session with
    // no invoice binding is a configuration bug worth finding.
    logMutation({
      correlationId,
      system: 'stripe',
      operation: 'checkoutCompleted',
      phase: PHASES.BLOCKED,
      fields: { ...baseFields, blockedBy: 'MISSING_INVOICE_METADATA' },
    });
    return NextResponse.json({ received: true });
  }

  // ── Deduplication against the durable receipt ──────────────────────────
  let receipt;
  try {
    receipt = await readReceipt(event.id);
  } catch (err) {
    // The store is unreachable. Fail closed: applying without a receipt means
    // the next retry cannot tell this attempt happened, which is exactly the
    // double-recording failure this issue exists to prevent. A 500 makes
    // Stripe redeliver once the store is healthy.
    logMutation({
      correlationId,
      system: 'blob',
      operation: 'readReceipt',
      phase: PHASES.FAILURE,
      error: err,
      fields: baseFields,
    });
    return NextResponse.json(
      { error: 'Receipt store unavailable', correlationId },
      { status: 500 },
    );
  }

  const decision = decideFromReceipt(receipt);

  if (decision.action === 'skip') {
    logMutation({
      correlationId,
      system: 'stripe',
      operation: 'checkoutCompleted',
      phase: PHASES.SUCCESS,
      fields: { ...baseFields, outcome: 'duplicate-skipped', reason: decision.reason },
    });
    return NextResponse.json({ received: true, duplicate: true });
  }

  // ── Durable intent, written before the business effect ─────────────────
  try {
    await writeReceipt(event.id, {
      status: RECEIPT_STATUS.RECEIVED,
      correlationId,
      ...baseFields,
      decision: decision.reason,
    });
  } catch (err) {
    logMutation({
      correlationId,
      system: 'blob',
      operation: 'writeReceipt',
      phase: PHASES.FAILURE,
      error: err,
      fields: baseFields,
    });
    return NextResponse.json(
      { error: 'Receipt store unavailable', correlationId },
      { status: 500 },
    );
  }

  logMutation({
    correlationId,
    system: 'printavo',
    operation: 'recordPayment',
    phase: PHASES.ATTEMPT,
    fields: { ...baseFields, decision: decision.reason },
  });

  try {
    const payment = await recordInvoicePayment({ invoiceId, amountCents });

    await writeReceipt(event.id, {
      status: RECEIPT_STATUS.APPLIED,
      correlationId,
      ...baseFields,
      printavoPaymentId: payment?.id ?? null,
    });

    logMutation({
      correlationId,
      system: 'printavo',
      operation: 'recordPayment',
      phase: PHASES.SUCCESS,
      fields: { ...baseFields, printavoPaymentId: payment?.id ?? null },
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    // Record the failure durably, then ask Stripe to retry. The old handler
    // returned 200 here, which threw the payment away.
    await writeReceipt(event.id, {
      status: RECEIPT_STATUS.FAILED,
      correlationId,
      ...baseFields,
      error: err?.message ? String(err.message).slice(0, 300) : 'unknown',
    }).catch((writeErr) => {
      console.error('[stripe-webhook] Could not record failure receipt:', writeErr?.message);
    });

    logMutation({
      correlationId,
      system: 'printavo',
      operation: 'recordPayment',
      phase: PHASES.FAILURE,
      error: err,
      fields: baseFields,
    });

    return NextResponse.json(
      { error: 'Failed to record payment', correlationId },
      { status: 500 },
    );
  }
}
