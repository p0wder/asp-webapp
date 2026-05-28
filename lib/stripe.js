/**
 * Stripe client — single point of contact with the Stripe SDK (Principle V).
 *
 * Requires STRIPE_SECRET_KEY env var. See README.md for setup.
 * Install via Vercel Marketplace (Stripe integration) or set manually.
 *
 * Justification for stripe dependency: the Stripe SDK is the only reliable way
 * to verify webhook signatures and create Checkout sessions — both require
 * crypto operations that would be unsafe to reimplement.
 */

import Stripe from 'stripe';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY env var is required but not set');
  return new Stripe(key, { apiVersion: '2025-04-30.basil' });
}

/**
 * Create a Stripe Checkout session for invoice payment.
 *
 * @param {{ invoiceId: string, customerEmail: string, amountCents: number, description: string, successUrl: string, cancelUrl: string }} opts
 * @returns {Promise<{ sessionId: string, sessionUrl: string }>}
 */
export async function createCheckoutSession({
  invoiceId,
  customerEmail,
  amountCents,
  description,
  successUrl,
  cancelUrl,
}) {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: customerEmail,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: { name: description || `Invoice #${invoiceId}` },
        },
        quantity: 1,
      },
    ],
    metadata: { invoiceId },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return { sessionId: session.id, sessionUrl: session.url };
}

/**
 * Verify and parse a Stripe webhook event.
 * Must be called with the raw (unparsed) request body.
 *
 * @param {string} rawBody
 * @param {string} signature  — value of the stripe-signature header
 * @param {string} secret     — STRIPE_WEBHOOK_SECRET env var value
 * @returns {import('stripe').Stripe.Event}
 */
export function constructWebhookEvent(rawBody, signature, secret) {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
