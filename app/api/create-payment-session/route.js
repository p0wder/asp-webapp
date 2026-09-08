import { NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/stripe';
import { getInvoiceById } from '@/lib/printavo';
import { resolveChargeAmountCents, AMOUNT_REFUSAL_REASONS } from '@/lib/paymentAmount';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { invoiceId, amountCents: requestedCents } = body;

  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
  }

  // Verify the invoice exists in Printavo before creating a Stripe session.
  // This prevents phantom payments against made-up invoice IDs, and supplies
  // the balance that bounds the charge.
  let invoice;
  try {
    invoice = await getInvoiceById(invoiceId);
  } catch (err) {
    console.error('[create-payment-session] Printavo lookup failed:', err.message);
    return NextResponse.json({ error: 'Could not verify invoice' }, { status: 502 });
  }

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  // TG-001-04: the amount is derived from the invoice's own balance. Anything
  // the client sent is advisory and can only reduce the charge, never raise it
  // or invent one. See lib/paymentAmount.js for the rule and finding F3.
  const resolved = resolveChargeAmountCents({
    outstandingDollars: invoice.amountOutstanding,
    requestedCents,
  });

  if (!resolved.ok) {
    if (resolved.reason === AMOUNT_REFUSAL_REASONS.NOTHING_DUE) {
      console.log('[create-payment-session] refused — nothing due', { invoiceId });
      return NextResponse.json(
        { error: 'This invoice has no outstanding balance.', code: resolved.reason },
        { status: 409 },
      );
    }

    // BALANCE_UNAVAILABLE — Printavo did not give us a usable balance. Fail
    // closed rather than fall back to the client's number.
    console.error('[create-payment-session] refused — balance unavailable', {
      invoiceId,
      amountOutstanding: invoice.amountOutstanding,
    });
    return NextResponse.json(
      { error: 'Could not determine the amount due for this invoice.', code: resolved.reason },
      { status: 502 },
    );
  }

  const amountCents = resolved.amountCents;
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const description = `${invoice.nickname || 'Order'} #${invoice.visualId}`;

  console.log('[create-payment-session] creating session', {
    invoiceId,
    amountCents,
    balanceCents: resolved.balanceCents,
    requestedCents: Number.isInteger(requestedCents) ? requestedCents : null,
    amountSource: resolved.source,
    description,
  });

  try {
    const { sessionUrl } = await createCheckoutSession({
      invoiceId,
      customerEmail: invoice.contact?.email || undefined,
      amountCents,
      description,
      successUrl: `${baseUrl}/pay/success?invoiceId=${encodeURIComponent(invoiceId)}`,
      cancelUrl: `${baseUrl}/pay?invoiceId=${encodeURIComponent(invoiceId)}&amount=${amountCents}`,
    });

    return NextResponse.json({ sessionUrl, amountCents });
  } catch (err) {
    console.error('[create-payment-session] Stripe error:', err.message);
    return NextResponse.json({ error: 'Failed to create payment session' }, { status: 500 });
  }
}
