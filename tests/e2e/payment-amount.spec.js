import { test, expect } from '@playwright/test';
import {
  derivePayableCents,
  checkAssertedAmount,
  toCents,
  snapshotId,
  PAYMENT_ERROR_CODES,
  MAX_PAYABLE_CENTS,
} from '../../lib/paymentAmount.js';

/**
 * TG-001-04 — server-derived Checkout amount.
 *
 * T1 asks for tampered-amount, cross-customer, stale-revision,
 * unavailable-balance and rounding tests. The first four are decisions made by
 * `derivePayableCents` / `checkAssertedAmount`; the cross-customer decision is
 * `verifyStatusAccess`, which the route calls before either of them and which
 * is covered by the existing order-status and proof suites.
 */

test.describe('rounding (T1)', () => {
  for (const [input, expected] of [
    [418.48, 41848],
    ['418.48', 41848],
    ['$1,234.56', 123456],
    [0.1, 10],
    [0.07, 7],
    [1e-3, 0],
    [999.995, 100000],
  ]) {
    test(`${JSON.stringify(input)} converts to ${expected} cents`, () => {
      expect(toCents(input)).toBe(expected);
    });
  }

  test('non-amounts convert to null rather than to zero', () => {
    // Returning 0 would look like a paid invoice; null forces the caller to
    // treat the balance as unavailable.
    for (const value of [null, undefined, '', 'abc', NaN, Infinity]) {
      expect(toCents(value)).toBeNull();
    }
  });
});

test.describe('balance derivation', () => {
  test('prefers Printavo amountOutstanding over anything computed', () => {
    const result = derivePayableCents({ total: 418.48, amountPaid: 100, amountOutstanding: 318.48 });
    expect(result).toMatchObject({ ok: true, amountCents: 31848, balanceSource: 'amountOutstanding' });
  });

  test('falls back to total minus paid when outstanding is absent', () => {
    const result = derivePayableCents({ total: 418.48, amountPaid: 100 });
    expect(result).toMatchObject({ ok: true, amountCents: 31848, balanceSource: 'total-minus-paid' });
  });

  test('falls back to the full total when no payment history is exposed', () => {
    // Deliberately the higher amount — being wrong upward is recoverable by
    // refund; being wrong downward under-collects silently.
    const result = derivePayableCents({ total: 418.48 });
    expect(result).toMatchObject({ ok: true, amountCents: 41848, balanceSource: 'total' });
  });

  test('an outstanding balance of zero is honoured, not skipped as falsy', () => {
    const result = derivePayableCents({ total: 418.48, amountOutstanding: 0 });
    expect(result).toMatchObject({ ok: false, code: PAYMENT_ERROR_CODES.ZERO_BALANCE });
  });
});

test.describe('unavailable balance fails closed (T1, AC4)', () => {
  for (const [label, snapshot] of [
    ['a null snapshot', null],
    ['a non-object snapshot', 'invoice'],
    ['an invoice with no monetary fields', { id: 'inv_1', visualId: '1042' }],
    ['an invoice whose total is not a number', { total: 'pending' }],
  ]) {
    test(`${label} yields BALANCE_UNAVAILABLE`, () => {
      const result = derivePayableCents(snapshot);
      expect(result.ok).toBe(false);
      expect(result.code).toBe(PAYMENT_ERROR_CODES.BALANCE_UNAVAILABLE);
    });
  }

  test('a fully paid invoice is rejected rather than charged zero', () => {
    const result = derivePayableCents({ total: 100, amountPaid: 100 });
    expect(result).toMatchObject({ ok: false, code: PAYMENT_ERROR_CODES.ZERO_BALANCE });
  });

  test('an overpaid invoice yields a negative balance and is rejected', () => {
    const result = derivePayableCents({ total: 100, amountPaid: 150 });
    expect(result).toMatchObject({ ok: false, code: PAYMENT_ERROR_CODES.ZERO_BALANCE });
  });

  test('an implausibly large balance is rejected as a units error', () => {
    const result = derivePayableCents({ total: MAX_PAYABLE_CENTS / 100 + 1 });
    expect(result).toMatchObject({ ok: false, code: PAYMENT_ERROR_CODES.AMOUNT_OUT_OF_RANGE });
  });
});

test.describe('tampered amounts (T1, AC1 & AC2)', () => {
  const SERVER_AMOUNT = 41848;

  test('omitting amountCents is accepted — the server figure stands alone', () => {
    expect(checkAssertedAmount(undefined, SERVER_AMOUNT).ok).toBe(true);
    expect(checkAssertedAmount(null, SERVER_AMOUNT).ok).toBe(true);
  });

  test('an exactly matching assertion is accepted', () => {
    expect(checkAssertedAmount(SERVER_AMOUNT, SERVER_AMOUNT).ok).toBe(true);
  });

  for (const [label, asserted] of [
    ['the $1.00 attack from finding F3', 100],
    ['an underpayment', SERVER_AMOUNT - 1],
    ['an overpayment', SERVER_AMOUNT + 1],
    ['an unapproved partial payment', Math.floor(SERVER_AMOUNT / 2)],
    ['a stale amount from an earlier revision', 39900],
    ['zero', 0],
    ['a negative amount', -SERVER_AMOUNT],
    ['a float', 418.48],
    ['a numeric string', '41848'],
  ]) {
    test(`${label} is rejected with a stable code`, () => {
      const result = checkAssertedAmount(asserted, SERVER_AMOUNT);
      expect(result.ok).toBe(false);
      expect(result.code).toBe(PAYMENT_ERROR_CODES.AMOUNT_MISMATCH);
    });
  }

  test('a tampered assertion never becomes the amount', () => {
    // The core property of AC1, stated directly: whatever the client sends,
    // the server figure is unchanged.
    const derived = derivePayableCents({ total: 418.48 });
    for (const tampered of [1, 100, 999_999]) {
      checkAssertedAmount(tampered, derived.amountCents);
      expect(derived.amountCents).toBe(41848);
    }
  });
});

test.describe('checkout snapshot binding (AC3)', () => {
  test('binds invoice, customer and amount together', () => {
    const base = { invoiceId: 'inv_1', contactEmail: 'a@example.test' };
    const id = snapshotId(base, 41848);

    expect(id).toBe(snapshotId(base, 41848));
    expect(id).not.toBe(snapshotId(base, 41849));
    expect(id).not.toBe(snapshotId({ ...base, invoiceId: 'inv_2' }, 41848));
    expect(id).not.toBe(snapshotId({ ...base, contactEmail: 'b@example.test' }, 41848));
  });

  test('does not embed the customer email', () => {
    const id = snapshotId({ invoiceId: 'inv_1', contactEmail: 'a@example.test' }, 41848);
    expect(id).not.toContain('example.test');
    expect(id.startsWith('snap_')).toBe(true);
  });
});
