/**
 * Pure derivation of the payable amount for an invoice (TG-001-04).
 *
 * No I/O, no `process.env` (Constitution Principle IV). The Printavo read is
 * `getInvoicePaymentSnapshot` in `lib/printavo.js`; the HTTP adapter is
 * `app/api/create-payment-session/route.js`.
 *
 * ── What this replaces ───────────────────────────────────────────────────
 * `amountCents` used to come from the request body, seeded on the client from
 * the `?amount=` query parameter. Validation was type-only — a positive
 * integer — and the value was never compared against anything. Editing the
 * URL was enough to pay $1.00 against any invoice in the system.
 *
 * The payable amount is now derived here from the invoice Printavo returns,
 * and the request cannot influence it. A client-supplied `amountCents` is
 * treated as an assertion to check, never as an input to use.
 */

/** Stable machine-readable rejection codes. */
export const PAYMENT_ERROR_CODES = Object.freeze({
  BALANCE_UNAVAILABLE: 'BALANCE_UNAVAILABLE',
  ZERO_BALANCE: 'ZERO_BALANCE',
  AMOUNT_OUT_OF_RANGE: 'AMOUNT_OUT_OF_RANGE',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
});

/**
 * Upper bound on a single Checkout session, in cents.
 *
 * A balance above this is far more likely to be a units error (dollars
 * misread as cents) than a real invoice, and paying it would be unrecoverable
 * without a refund. Fail closed and make a human look.
 */
export const MAX_PAYABLE_CENTS = 50_000_00; // $50,000

/**
 * Convert a currency amount to integer cents.
 *
 * Printavo returns money as a JSON number or a decimal string. Multiplying by
 * 100 and rounding is exact for every value below ~$90 trillion, which is the
 * whole realistic domain here; the rounding step is what absorbs the binary
 * representation error in values like `418.48 * 100`.
 *
 * @param {unknown} value
 * @returns {number|null} Integer cents, or null when not a finite amount.
 */
export function toCents(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 100);
}

/**
 * Derive the authoritative payable amount from an invoice snapshot.
 *
 * Sources are tried in descending order of authority. Each is recorded on the
 * result as `balanceSource`, so the audited log line says which one decided
 * the amount rather than leaving it to be inferred.
 *
 * @param {object|null} snapshot Invoice fields from Printavo.
 * @param {number|string} [snapshot.total]
 * @param {number|string} [snapshot.amountPaid]
 * @param {number|string} [snapshot.amountOutstanding]
 * @returns {{ ok: true, amountCents: number, balanceSource: string }
 *          | { ok: false, code: string, message: string }}
 */
export function derivePayableCents(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return {
      ok: false,
      code: PAYMENT_ERROR_CODES.BALANCE_UNAVAILABLE,
      message: 'No invoice snapshot was available.',
    };
  }

  const outstanding = toCents(snapshot.amountOutstanding);
  const total = toCents(snapshot.total);
  const paid = toCents(snapshot.amountPaid);

  let amountCents = null;
  let balanceSource = null;

  if (outstanding !== null && outstanding >= 0) {
    // Printavo's own outstanding balance — the most authoritative value.
    amountCents = outstanding;
    balanceSource = 'amountOutstanding';
  } else if (total !== null && paid !== null) {
    amountCents = total - paid;
    balanceSource = 'total-minus-paid';
  } else if (total !== null) {
    // No payment history exposed: the full total is the only defensible
    // amount. Never fall back to anything the client supplied.
    amountCents = total;
    balanceSource = 'total';
  }

  if (amountCents === null) {
    return {
      ok: false,
      code: PAYMENT_ERROR_CODES.BALANCE_UNAVAILABLE,
      message: 'The invoice balance could not be determined.',
    };
  }

  if (amountCents <= 0) {
    return {
      ok: false,
      code: PAYMENT_ERROR_CODES.ZERO_BALANCE,
      message: 'This invoice has no balance due.',
    };
  }

  if (amountCents > MAX_PAYABLE_CENTS) {
    return {
      ok: false,
      code: PAYMENT_ERROR_CODES.AMOUNT_OUT_OF_RANGE,
      message: 'The invoice balance exceeds the single-payment limit.',
    };
  }

  return { ok: true, amountCents, balanceSource };
}

/**
 * Check a client-asserted amount against the server-derived one.
 *
 * The client's value never *becomes* the amount. This exists so that a stale
 * page — one rendered before a payment or a revision changed the balance —
 * is rejected outright rather than silently charged a different figure than
 * the customer was shown. Overpayment, underpayment and an unapproved partial
 * payment all land here as the same stable mismatch (TG-001-04 AC2).
 *
 * @param {unknown} asserted     Client-supplied `amountCents`, if any.
 * @param {number} serverAmount  Result of `derivePayableCents`.
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function checkAssertedAmount(asserted, serverAmount) {
  if (asserted === undefined || asserted === null) return { ok: true };

  if (!Number.isInteger(asserted) || asserted !== serverAmount) {
    return {
      ok: false,
      code: PAYMENT_ERROR_CODES.AMOUNT_MISMATCH,
      message: 'The amount shown is out of date. Reload the page and try again.',
    };
  }

  return { ok: true };
}

/**
 * A stable identifier for the commercial snapshot a Checkout session was
 * created against (TG-001-04 AC3).
 *
 * Stored in Stripe metadata so a completed session can be tied back to one
 * invoice, one customer and one balance — and so a webhook can tell that the
 * invoice has changed since. Not a secret and not a signature: it identifies
 * a snapshot, it does not authenticate one.
 *
 * @param {{ invoiceId: string, contactEmail?: string|null }} snapshot
 * @param {number} amountCents
 * @returns {string}
 */
export function snapshotId(snapshot, amountCents) {
  const basis = `${snapshot.invoiceId}|${snapshot.contactEmail ?? ''}|${amountCents}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `snap_${hash.toString(16).padStart(8, '0')}`;
}
