/**
 * Pure resolution of the amount to charge for an invoice (TG-001-04).
 *
 * No I/O, no environment access (Constitution Principle IV). The caller
 * fetches the invoice and passes its balance in; this module decides what may
 * be charged.
 *
 * ── The defect this closes (baseline finding F3) ─────────────────────────
 * `/api/create-payment-session` took `amountCents` straight from the request
 * body and handed it to Stripe. Validation was type-only — a positive integer
 * — and the value was never compared against what the invoice actually owed.
 * `app/pay/page.jsx` seeds that field from the `?amount=` query parameter, so
 * editing a URL was enough to pay $1.00 against any invoice.
 *
 * ── The rule ────────────────────────────────────────────────────────────
 * The server owns the ceiling. The outstanding balance from Printavo decides
 * the maximum, and a client-supplied amount can only ever be *less* than that
 * — a deliberate partial payment or deposit, which the pay page already
 * supports. It can never exceed the balance and can never invent one.
 *
 * ── Fail closed ─────────────────────────────────────────────────────────
 * If the balance cannot be determined, no amount is resolved and no Checkout
 * session may be created. An unknown balance never falls back to trusting the
 * client (Constitution Principle VI: ambiguity does not resolve toward the
 * real-world side effect).
 */

/** Stable machine-readable refusal reasons. */
export const AMOUNT_REFUSAL_REASONS = {
  BALANCE_UNAVAILABLE: 'BALANCE_UNAVAILABLE',
  NOTHING_DUE: 'NOTHING_DUE',
};

/** How the resolved amount was arrived at. Informational, for logs. */
export const AMOUNT_SOURCES = {
  /** No usable client amount — charging the full outstanding balance. */
  FULL_BALANCE: 'full-balance',
  /** Client asked for less than the balance — an intentional partial payment. */
  CLIENT_PARTIAL: 'client-partial',
  /** Client asked for more than the balance — reduced to the balance. */
  CLAMPED_TO_BALANCE: 'clamped-to-balance',
};

/**
 * Convert a dollar amount from Printavo into integer cents.
 *
 * Printavo returns money as a Float in dollars. ADR-0003 requires money to be
 * handled as integer minor units, rounded half-up, at a single rounding point
 * — this is that point for the payment path. `Math.round` is half-up for the
 * positive values a balance can take.
 *
 * @param {number|string|null|undefined} dollars
 * @returns {number|null} integer cents, or null when the input is not a number
 */
export function dollarsToCents(dollars) {
  // Only numbers and numeric strings are money. `Number()` alone is too
  // permissive to lean on here: `Number([])` is 0 and `Number(true)` is 1, so
  // a malformed value would read as a real balance of zero rather than as an
  // absent one — a weaker refusal than the caller is entitled to.
  if (typeof dollars !== 'number' && typeof dollars !== 'string') return null;
  if (typeof dollars === 'string' && dollars.trim() === '') return null;

  const n = Number(dollars);
  if (!Number.isFinite(n)) return null;

  return Math.round(n * 100);
}

/**
 * Decide what may be charged against an invoice.
 *
 * @param {Object} params
 * @param {number|string|null|undefined} params.outstandingDollars
 *   `amountOutstanding` from Printavo, in dollars.
 * @param {unknown} [params.requestedCents]
 *   The client's proposed amount, in cents. Advisory only — treated as a
 *   request to pay *less* than the balance, and ignored otherwise.
 * @returns {{ ok: true, amountCents: number, balanceCents: number, source: string }
 *          | { ok: false, reason: string, balanceCents: number|null }}
 */
export function resolveChargeAmountCents({ outstandingDollars, requestedCents } = {}) {
  const balanceCents = dollarsToCents(outstandingDollars);

  // Fail closed: without a server-owned balance there is no ceiling to enforce,
  // so there is nothing safe to charge.
  if (balanceCents === null) {
    return { ok: false, reason: AMOUNT_REFUSAL_REASONS.BALANCE_UNAVAILABLE, balanceCents: null };
  }

  if (balanceCents <= 0) {
    return { ok: false, reason: AMOUNT_REFUSAL_REASONS.NOTHING_DUE, balanceCents };
  }

  const wantsPartial =
    Number.isInteger(requestedCents) && requestedCents > 0 && requestedCents < balanceCents;

  if (wantsPartial) {
    return {
      ok: true,
      amountCents: requestedCents,
      balanceCents,
      source: AMOUNT_SOURCES.CLIENT_PARTIAL,
    };
  }

  // Anything else — absent, zero, negative, non-integer, or larger than the
  // balance — resolves to the balance itself.
  const overAsked = Number.isInteger(requestedCents) && requestedCents > balanceCents;

  return {
    ok: true,
    amountCents: balanceCents,
    balanceCents,
    source: overAsked ? AMOUNT_SOURCES.CLAMPED_TO_BALANCE : AMOUNT_SOURCES.FULL_BALANCE,
  };
}
