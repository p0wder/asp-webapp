import { NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/stripe';
import { getInvoiceById } from '@/lib/printavo';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { invoiceId, amountCents } = body;

  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
  }

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return NextResponse.json(
      { error: 'amountCents must be a positive integer' },
      { status: 400 },
    );
  }

  // Verify the invoice exists in Printavo before creating a Stripe session.
  // This prevents phantom payments against made-up invoice IDs.
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

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const description = `${invoice.nickname || 'Order'} #${invoice.visualId}`;

  console.log('[create-payment-session] creating session', {
    invoiceId,
    amountCents,
    customerEmail: invoice.contact?.email,
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

    return NextResponse.json({ sessionUrl });
  } catch (err) {
    console.error('[create-payment-session] Stripe error:', err.message);
    return NextResponse.json({ error: 'Failed to create payment session' }, { status: 500 });
  }
}
