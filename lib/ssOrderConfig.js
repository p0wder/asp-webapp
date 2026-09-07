/**
 * Pure validation of the S&S Activewear order operating configuration
 * (TG-001-10).
 *
 * No environment access, no I/O (Constitution Principle IV). The environment
 * adapter is `lib/ssOrderConfigEnv.js`, mirroring the
 * `ssOrderingGate` / `ssOrderingSwitch` split.
 *
 * ── What moved here, and why ─────────────────────────────────────────────
 * `createSSOrder` used to embed every operating decision as a literal: the
 * shop's street address, both confirmation recipients, freight method 54, the
 * account email (with an `|| 'aspmerch@gmail.com'` fallback) and
 * `testOrder: false`. Changing where goods ship, or who is told about it,
 * meant editing the submit adapter and deploying. Worse, the account-email
 * fallback meant a *missing* environment variable still produced a live order
 * — silently, against a guessed identity.
 *
 * Every one of those is now validated configuration, and validation is
 * fail-closed: an incomplete or malformed configuration rejects the order
 * before any supplier call rather than substituting a default.
 *
 * ── Relationship to the kill switch ──────────────────────────────────────
 * This module answers "is the configuration usable and what does it say?".
 * `lib/ssOrderingGate.js` answers "is submission permitted at all?". They are
 * independent: a perfectly valid configuration still submits nothing while
 * the kill switch is closed, and an open kill switch still submits nothing
 * while the configuration is invalid.
 */

/** Accepted values for the order mode. Anything else is invalid. */
export const SS_ORDER_MODES = Object.freeze({ TEST: 'test', LIVE: 'live' });

/** Machine-readable validation failure codes. */
export const SS_CONFIG_ERROR_CODES = Object.freeze({
  MISSING: 'MISSING',
  INVALID: 'INVALID',
});

/** Thrown by the adapter when configuration is unusable. */
export class SSOrderConfigError extends Error {
  /** @param {Array<{field: string, code: string, message: string}>} errors */
  constructor(errors) {
    const summary = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    super(`S&S order configuration is invalid. No supplier call was made. ${summary}`);
    this.name = 'SSOrderConfigError';
    this.code = 'SS_ORDER_CONFIG_INVALID';
    this.errors = errors;
  }
}

const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
const US_ZIP_RE = /^\d{5}(-\d{4})?$/;
const COUNTRY_RE = /^[A-Za-z]{2}$/;
const STATE_RE = /^[A-Za-z]{2}$/;

/** Maximum confirmation recipients. S&S takes one comma-joined string; a
 *  long list is far more likely to be a paste accident than intent. */
const MAX_CONFIRMATION_EMAILS = 5;

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Validate and normalise a raw S&S order configuration.
 *
 * Collects *every* problem rather than failing on the first, so an operator
 * fixing a Vercel configuration sees the whole list in one deploy cycle.
 *
 * @param {object} raw Raw string values, typically straight from `process.env`.
 * @param {string} [raw.mode]                Order mode: `test` or `live`.
 * @param {string} [raw.accountEmail]        S&S website account email.
 * @param {string} [raw.confirmationEmails]  Comma-separated recipient list.
 * @param {string} [raw.shippingMethod]      S&S numeric freight method.
 * @param {string} [raw.shipToCustomer]      Ship-to company name.
 * @param {string} [raw.shipToAttn]          Ship-to attention line.
 * @param {string} [raw.shipToAddress]       Ship-to street line.
 * @param {string} [raw.shipToCity]
 * @param {string} [raw.shipToState]         Two-letter state/province code.
 * @param {string} [raw.shipToZip]
 * @param {string} [raw.shipToCountry]       Two-letter ISO country code.
 * @returns {{ ok: boolean, config: object|null, errors: Array<{field: string, code: string, message: string}> }}
 */
export function parseSSOrderConfig(raw = {}) {
  const errors = [];
  const fail = (field, code, message) => errors.push({ field, code, message });

  // ── Mode ───────────────────────────────────────────────────────────────
  const modeRaw = trimmed(raw.mode).toLowerCase();
  let mode = null;
  if (!modeRaw) {
    fail('mode', SS_CONFIG_ERROR_CODES.MISSING, 'required; must be "test" or "live"');
  } else if (modeRaw !== SS_ORDER_MODES.TEST && modeRaw !== SS_ORDER_MODES.LIVE) {
    fail('mode', SS_CONFIG_ERROR_CODES.INVALID, 'must be exactly "test" or "live"');
  } else {
    mode = modeRaw;
  }

  // ── Account email (no fallback — a missing value must not guess) ────────
  const accountEmail = trimmed(raw.accountEmail);
  if (!accountEmail) {
    fail('accountEmail', SS_CONFIG_ERROR_CODES.MISSING, 'required');
  } else if (!EMAIL_RE.test(accountEmail)) {
    fail('accountEmail', SS_CONFIG_ERROR_CODES.INVALID, 'not a valid email address');
  }

  // ── Confirmation recipients ────────────────────────────────────────────
  const confirmationRaw = trimmed(raw.confirmationEmails);
  let confirmationEmails = [];
  if (!confirmationRaw) {
    fail('confirmationEmails', SS_CONFIG_ERROR_CODES.MISSING, 'required; comma-separated');
  } else {
    confirmationEmails = confirmationRaw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (confirmationEmails.length === 0) {
      fail('confirmationEmails', SS_CONFIG_ERROR_CODES.INVALID, 'no addresses parsed');
    } else if (confirmationEmails.length > MAX_CONFIRMATION_EMAILS) {
      fail(
        'confirmationEmails',
        SS_CONFIG_ERROR_CODES.INVALID,
        `at most ${MAX_CONFIRMATION_EMAILS} addresses`,
      );
    } else if (!confirmationEmails.every((entry) => EMAIL_RE.test(entry))) {
      fail('confirmationEmails', SS_CONFIG_ERROR_CODES.INVALID, 'contains a malformed address');
    }
  }

  // ── Freight method ─────────────────────────────────────────────────────
  const shippingMethodRaw = trimmed(raw.shippingMethod);
  let shippingMethod = null;
  if (!shippingMethodRaw) {
    fail('shippingMethod', SS_CONFIG_ERROR_CODES.MISSING, 'required; S&S numeric method code');
  } else if (!/^\d{1,4}$/.test(shippingMethodRaw)) {
    fail('shippingMethod', SS_CONFIG_ERROR_CODES.INVALID, 'must be a positive integer');
  } else {
    shippingMethod = Number.parseInt(shippingMethodRaw, 10);
  }

  // ── Ship-to address ────────────────────────────────────────────────────
  const shipTo = {
    customer: trimmed(raw.shipToCustomer),
    attn: trimmed(raw.shipToAttn),
    address: trimmed(raw.shipToAddress),
    city: trimmed(raw.shipToCity),
    state: trimmed(raw.shipToState).toUpperCase(),
    zip: trimmed(raw.shipToZip),
    country: trimmed(raw.shipToCountry).toUpperCase(),
  };

  for (const field of ['customer', 'address', 'city', 'state', 'zip', 'country']) {
    if (!shipTo[field]) {
      fail(`shipTo.${field}`, SS_CONFIG_ERROR_CODES.MISSING, 'required');
    }
  }
  // `attn` is genuinely optional — a shop may not route by person.

  if (shipTo.state && !STATE_RE.test(shipTo.state)) {
    fail('shipTo.state', SS_CONFIG_ERROR_CODES.INVALID, 'must be a two-letter code');
  }
  if (shipTo.country && !COUNTRY_RE.test(shipTo.country)) {
    fail('shipTo.country', SS_CONFIG_ERROR_CODES.INVALID, 'must be a two-letter ISO code');
  }
  if (shipTo.zip && shipTo.country === 'US' && !US_ZIP_RE.test(shipTo.zip)) {
    fail('shipTo.zip', SS_CONFIG_ERROR_CODES.INVALID, 'must be ZIP or ZIP+4 for country US');
  }

  if (errors.length > 0) {
    return { ok: false, config: null, errors };
  }

  return {
    ok: true,
    errors: [],
    config: {
      mode,
      // The literal the S&S API receives. Derived from `mode` so the two can
      // never disagree, and so "live" is a word an operator sets on purpose
      // rather than a boolean buried in the adapter.
      testOrder: mode === SS_ORDER_MODES.TEST,
      accountEmail,
      confirmationEmails,
      shippingMethod,
      shipTo: {
        customer: shipTo.customer,
        ...(shipTo.attn ? { attn: shipTo.attn } : {}),
        address: shipTo.address,
        city: shipTo.city,
        state: shipTo.state,
        zip: shipTo.zip,
        country: shipTo.country,
      },
    },
  };
}

/**
 * The audited, log-safe summary of a configuration (TG-001-10 AC3).
 *
 * Makes test-versus-live visible in the preflight record without putting the
 * ship-to street line, the account email or the recipient list into logs
 * (TG-001-08).
 *
 * @param {object|null} config Output of `parseSSOrderConfig().config`.
 * @returns {object}
 */
export function summarizeSSOrderConfig(config) {
  if (!config) return { configured: false };
  return {
    configured: true,
    mode: config.mode,
    testOrder: config.testOrder,
    shippingMethod: config.shippingMethod,
    confirmationRecipientCount: config.confirmationEmails.length,
    shipToLocality: `${config.shipTo.city}, ${config.shipTo.state} ${config.shipTo.country}`,
  };
}
