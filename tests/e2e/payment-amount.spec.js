import { test, expect } from '@playwright/test';
import {
  resolveChargeAmountCents,
  dollarsToCents,
  AMOUNT_REFUSAL_REASONS,
  AMOUNT_SOURCES,
} from '../../lib/paymentAmount.js';

/**
 * TG-001-04 — the Stripe Checkout amount is derived from the server-owned
 * balance, not from the request body.
 *
 * T1 covers the rule itself (pure, no I/O). T2 covers its boundary: the
 * `/api/create-payment-session` contract.
 *
 * Baseline finding F3: `app/pay/page.jsx` seeds `amountCents` from the
 * `?amount=` query parameter and posts it; the route passed it to Stripe with
 * type-only validation and never compared it to what was owed.
 */

// ─── T1: the rule ─────────────────────────────────────────────────────────

test.describe('dollarsToCents', () => {
  test('converts Printavo dollar floats to integer cents', () => {
    expect(dollarsToCents(418.48)).toBe(41848);
    expect(dollarsToCents(1000)).toBe(100000);
    expect(dollarsToCents(0)).toBe(0);
  });

  test('rounds half-up at a single rounding point (ADR-0003)', () => {
    expect(dollarsToCents(0.005)).toBe(1);
    expect(dollarsToCents(10.004)).toBe(1000);
    expect(dollarsToCents(10.005)).toBe(1001);
  });

  test('survives float representation error', () => {
    // These do not land on an integer when multiplied out:
    //   19.99 * 100 === 1998.9999999999998
    //    0.29 * 100 ===   28.999999999999996
    // Truncation would bill a cent short on each; rounding is what makes the
    // single rounding point in ADR-0003 correct rather than merely defined.
    expect(dollarsToCents(19.99)).toBe(1999);
    expect(dollarsToCents(0.29)).toBe(29);
    expect(dollarsToCents(418.48)).toBe(41848);
  });

  test('accepts numeric strings', () => {
    expect(dollarsToCents('250.50')).toBe(25050);
  });

  test('returns null for anything that is not a number', () => {
    for (const bad of [null, undefined, '', 'abc', NaN, Infinity, {}, []]) {
      expect(dollarsToCents(bad)).toBeNull();
    }
  });
});

test.describe('resolveChargeAmountCents', () => {
  test('charges the full balance when no amount is requested', () => {
    const r = resolveChargeAmountCents({ outstandingDollars: 1000 });
    expect(r.ok).toBe(true);
    expect(r.amountCents).toBe(100000);
    expect(r.source).toBe(AMOUNT_SOURCES.FULL_BALANCE);
  });

  test('THE FINDING: a $1.00 request against a $1000 invoice cannot exceed the balance', () => {
    // The client may still ask to pay less — that is a deposit, and the pay
    // page has always supported it. What it can no longer do is set the
    // ceiling.
    const r = resolveChargeAmountCents({ outstandingDollars: 1000, requestedCents: 100 });
    expect(r.ok).toBe(true);
    expect(r.amountCents).toBe(100);
    expect(r.balanceCents).toBe(100000);
    expect(r.source).toBe(AMOUNT_SOURCES.CLIENT_PARTIAL);
  });

  test('THE FINDING: a request larger than the balance is clamped to the balance', () => {
    const r = resolveChargeAmountCents({ outstandingDollars: 400, requestedCents: 100000 });
    expect(r.ok).toBe(true);
    expect(r.amountCents).toBe(40000);
    expect(r.source).toBe(AMOUNT_SOURCES.CLAMPED_TO_BALANCE);
  });

  test('a partly-paid invoice is charged its remainder, never its total', () => {
    // $1000 invoice, $600 already paid. my-orders builds its pay link from
    // `total`, so the client will propose $1000 here.
    const r = resolveChargeAmountCents({ outstandingDollars: 400, requestedCents: 100000 });
    expect(r.amountCents).toBe(40000);
  });

  test('requesting exactly the balance is honoured', () => {
    const r = resolveChargeAmountCents({ outstandingDollars: 250, requestedCents: 25000 });
    expect(r.ok).toBe(true);
    expect(r.amountCents).toBe(25000);
    expect(r.source).toBe(AMOUNT_SOURCES.FULL_BALANCE);
  });

  test('FAILS CLOSED when the balance is unavailable', () => {
    for (const bad of [null, undefined, '', 'not-a-number', NaN]) {
      const r = resolveChargeAmountCents({ outstandingDollars: bad, requestedCents: 100000 });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe(AMOUNT_REFUSAL_REASONS.BALANCE_UNAVAILABLE);
    }
  });

  test('an unknown balance never falls back to the client amount', () => {
    const r = resolveChargeAmountCents({ outstandingDollars: undefined, requestedCents: 50000 });
    expect(r.ok).toBe(false);
    expect(r.amountCents).toBeUndefined();
  });

  test('refuses when nothing is due', () => {
    for (const paid of [0, -0.0, -25]) {
      const r = resolveChargeAmountCents({ outstandingDollars: paid, requestedCents: 5000 });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe(AMOUNT_REFUSAL_REASONS.NOTHING_DUE);
    }
  });

  test('ignores malformed requested amounts and charges the balance', () => {
    for (const bad of [0, -500, 1.5, '5000', null, undefined, NaN, {}]) {
      const r = resolveChargeAmountCents({ outstandingDollars: 300, requestedCents: bad });
      expect(r.ok).toBe(true);
      expect(r.amountCents).toBe(30000);
    }
  });

  test('is pure — repeated calls with the same input agree', () => {
    const args = { outstandingDollars: 418.48, requestedCents: 20000 };
    expect(resolveChargeAmountCents(args)).toEqual(resolveChargeAmountCents(args));
  });

  test('tolerates being called with no arguments', () => {
    expect(resolveChargeAmountCents().ok).toBe(false);
    expect(resolveChargeAmountCents({}).ok).toBe(false);
  });
});

// ─── T2: the boundary ─────────────────────────────────────────────────────

test.describe('/api/create-payment-session contract', () => {
  test('rejects a request with no invoiceId before any lookup', async ({ request }) => {
    const res = await request.post('/api/create-payment-session', {
      data: { amountCents: 100 },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/invoiceId is required/i);
  });

  test('rejects an unparseable body', async ({ request }) => {
    const res = await request.post('/api/create-payment-session', {
      headers: { 'Content-Type': 'application/json' },
      data: 'not json',
    });
    expect(res.status()).toBe(400);
  });

  test('amountCents is no longer required — the server derives it', async ({ request }) => {
    // Before TG-001-04 this returned 400 "amountCents must be a positive
    // integer". It must now get past validation and fail later, on the
    // invoice lookup, because the amount is the server's to determine.
    const res = await request.post('/api/create-payment-session', {
      data: { invoiceId: 'does-not-exist' },
    });
    expect(res.status()).not.toBe(400);
  });

  test('never creates a session for an invoice that does not exist', async ({ request }) => {
    const res = await request.post('/api/create-payment-session', {
      data: { invoiceId: 'definitely-not-a-real-invoice-id', amountCents: 100 },
    });
    expect(res.ok()).toBe(false);
    expect(await res.text()).not.toContain('sessionUrl');
  });
});
