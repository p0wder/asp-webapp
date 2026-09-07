import { NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/stripe';
import { getInvoicePaymentSnapshot } from '@/lib/printavo';
import { verifyStatusAccess } from '@/lib/accessControl';
import { derivePayableCents, checkAssertedAmount, snapshotId } from '@/lib/paymentAmount';
import { isSameOrigin, readJsonBody, appBaseUrl } from '@/lib/httpGuards';
import { rateLimit, clientKey, RATE_LIMIT_POLICIES } from '@/lib/rateLimit';
import { logMutation, newCorrelationId, PHASES } from '@/lib/mutationLog';

/**
 * Stripe Checkout session creation for a Printavo invoice (TG-001-04).
 *
 * ── What changed, and why ────────────────────────────────────────────────
 * This route used to take `amountCents` from the request body, validate only
 * that it was a positive integer, and hand it to Stripe. It fetched the
 * invoice — which made phantom invoice IDs impossible — but never read the
 * invoice's balance, so editing `?amount=` in the URL paid whatever the
 * customer chose against any real invoice.
 *
 * Now the amount is derived from the invoice Printavo returns. A client
 * `amountCents`, if sent at all, is checked against the derived value and
 * rejected on mismatch; it is never used as the amount.
 *
 * It was also the only public mutation route in the app with no origin guard
 * and no authentication of any kind (variance V3). Both are added here:
 * the shared origin guard, a rate limit, and the same customer-access
 * decision the order-status and proof routes use — a signed-in Clerk customer
 * whose email matches the invoice contact, or a valid HMAC status token.
 *
 * Every failure path fails closed: no Checkout session is created unless the
 * balance and the access decision were both obtained (AC4).
 *
 * GET  — returns the derived payable amount so the pay page can display an
 *        authoritative figure. Read-only; creates nothing.
 * POST — creates the Checkout session.
 */

/** Shared preamble: origin, rate limit, access decision, balance derivation. */
async function resolvePayable(request, { invoiceId, token, correlationId }) {
  if (!invoiceId || typeof invoiceId !== 'string') {
    return { error: { status: 400, body: { error: 'invoiceId is required' } } };
  }

  let invoice;
  try {
    invoice = await getInvoicePaymentSnapshot(invoiceId);
  } catch (err) {
    logMutation({
      correlationId,
      system: 'printavo',
      operation: 'getInvoiceBalance',
      phase: PHASES.FAILURE,
      error: err,
    });
    // Fail closed: an unavailable balance must never fall through to a
    // client-supplied figure (AC4).
    return { error: { status: 502, body: { error: 'Could not verify invoice', correlationId } } };
  }

  if (!invoice) {
    return { error: { status: 404, body: { error: 'Invoice not found' } } };
  }

  // Customer-access decision. Fails closed on any error inside.
  let access;
  try {
    access = await verifyStatusAccess(invoiceId, invoice, { token });
  } catch (err) {
    logMutation({
      correlationId,
      system: 'clerk',
      operation: 'verifyStatusAccess',
      phase: PHASES.FAILURE,
      error: err,
    });
    return { error: { status: 503, body: { error: 'Could not verify access', correlationId } } };
  }

  if (!access.granted) {
    return {
      error: {
        status: access.status ?? 403,
        body: { error: 'Not authorized to pay this invoice' },
      },
    };
  }

  const derived = derivePayableCents(invoice);
  if (!derived.ok) {
    logMutation({
      correlationId,
      system: 'stripe',
      operation: 'createCheckoutSession',
      phase: PHASES.BLOCKED,
      fields: { blockedBy: derived.code, balanceFieldsPresent: invoice.balanceFieldsPresent },
    });
    return {
      error: {
        status: 409,
        body: { error: derived.message, code: derived.code, correlationId },
      },
    };
  }

  return { invoice, derived };
}

export async function GET(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const correlationId = newCorrelationId();
  const { searchParams } = new URL(request.url);
  const resolved = await resolvePayable(request, {
    invoiceId: searchParams.get('invoiceId'),
    token: searchParams.get('token'),
    correlationId,
  });

  if (resolved.error) {
    return NextResponse.json(resolved.error.body, { status: resolved.error.status });
  }

  const { invoice, derived } = resolved;
  return NextResponse.json({
    invoiceId: invoice.id,
    visualId: invoice.visualId ?? null,
    description: `${invoice.nickname || 'Order'} #${invoice.visualId}`,
    amountCents: derived.amountCents,
    balanceSource: derived.balanceSource,
  });
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const limit = rateLimit(
    clientKey(request, 'create-payment-session'),
    RATE_LIMIT_POLICIES.createPaymentSession,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many payment attempts. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const correlationId = newCorrelationId();

  const parsed = await readJsonBody(request, { maxBytes: 4 * 1024 });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const { invoiceId, token, amountCents: assertedAmount } = parsed.body || {};

  const resolved = await resolvePayable(request, { invoiceId, token, correlationId });
  if (resolved.error) {
    return NextResponse.json(resolved.error.body, { status: resolved.error.status });
  }

  const { invoice, derived } = resolved;

  // The client's figure is an assertion to check, never an input to use.
  const asserted = checkAssertedAmount(assertedAmount, derived.amountCents);
  if (!asserted.ok) {
    logMutation({
      correlationId,
      system: 'stripe',
      operation: 'createCheckoutSession',
      phase: PHASES.BLOCKED,
      fields: {
        blockedBy: asserted.code,
        serverAmountCents: derived.amountCents,
        assertedIsInteger: Number.isInteger(assertedAmount),
      },
    });
    return NextResponse.json(
      {
        error: asserted.message,
        code: asserted.code,
        amountCents: derived.amountCents,
        correlationId,
      },
      { status: 409 },
    );
  }

  const baseUrl = appBaseUrl(request);
  const description = `${invoice.nickname || 'Order'} #${invoice.visualId}`;
  const snapshot = snapshotId(
    { invoiceId: invoice.id, contactEmail: invoice.contact?.email ?? null },
    derived.amountCents,
  );

  logMutation({
    correlationId,
    system: 'stripe',
    operation: 'createCheckoutSession',
    phase: PHASES.ATTEMPT,
    fields: {
      invoiceId: invoice.id,
      visualId: invoice.visualId ?? null,
      amountCents: derived.amountCents,
      balanceSource: derived.balanceSource,
      balanceFieldsPresent: invoice.balanceFieldsPresent,
      snapshotId: snapshot,
      // Masked to a domain + tag by the redactor; the plaintext never lands
      // in the log stream (variance V12).
      customerEmail: invoice.contact?.email ?? null,
    },
  });

  try {
    const { sessionUrl } = await createCheckoutSession({
      invoiceId: invoice.id,
      customerEmail: invoice.contact?.email || undefined,
      amountCents: derived.amountCents,
      description,
      // The session is bound to one invoice, one customer and one balance
      // (AC3), so the webhook can tell whether the invoice moved underneath it.
      metadata: {
        invoiceId: invoice.id,
        snapshotId: snapshot,
        amountCents: String(derived.amountCents),
        correlationId,
      },
      successUrl: `${baseUrl}/pay/success?invoiceId=${encodeURIComponent(invoice.id)}`,
      // No `amount` in the cancel URL — the pay page reads the authoritative
      // figure from this route rather than from the address bar.
      cancelUrl: `${baseUrl}/pay?invoiceId=${encodeURIComponent(invoice.id)}${
        token ? `&token=${encodeURIComponent(token)}` : ''
      }`,
    });

    logMutation({
      correlationId,
      system: 'stripe',
      operation: 'createCheckoutSession',
      phase: PHASES.SUCCESS,
      fields: { invoiceId: invoice.id, amountCents: derived.amountCents, snapshotId: snapshot },
    });

    return NextResponse.json({ sessionUrl, amountCents: derived.amountCents, correlationId });
  } catch (err) {
    logMutation({
      correlationId,
      system: 'stripe',
      operation: 'createCheckoutSession',
      phase: PHASES.FAILURE,
      error: err,
      fields: { invoiceId: invoice.id },
    });
    return NextResponse.json(
      { error: 'Failed to create payment session', correlationId },
      { status: 502 },
    );
  }
}
