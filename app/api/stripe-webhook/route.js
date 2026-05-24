import { NextResponse } from 'next/server';
import { constructWebhookEvent } from '@/lib/stripe';
import { gql } from '@/lib/printavo';

// Stripe sends the raw body — Next.js App Router gives us access via request.text().
// Stripe signature verification requires the exact raw bytes; do not parse as JSON first.

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
    // constructWebhookEvent verifies the Stripe signature — this IS the abuse mitigation
    // for this public route. An invalid signature means the request did not come from Stripe.
    event = constructWebhookEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const invoiceId = session.metadata?.invoiceId;
    const amountCents = session.amount_total;

    console.log('[stripe-webhook] checkout.session.completed', {
      sessionId: session.id,
      invoiceId,
      amountCents,
      customerEmail: session.customer_email,
    });

    if (invoiceId) {
      try {
        // Record payment on the Printavo invoice
        await gql(
          `mutation RecordPayment($invoiceId: ID!, $amount: Float!) {
            paymentCreate(parentId: $invoiceId, input: { amount: $amount, paymentMethod: "Credit Card" }) {
              id
              amount
            }
          }`,
          { invoiceId, amount: amountCents / 100 },
        );
        console.log('[stripe-webhook] Payment recorded on Printavo invoice', invoiceId);
      } catch (err) {
        // Non-fatal: log but still return 200 so Stripe doesn't retry.
        // The payment was collected; a manual Printavo update can reconcile if needed.
        console.error('[stripe-webhook] Failed to record payment in Printavo:', err.message);
      }
    }
  }

  return NextResponse.json({ received: true });
}
