/**
 * Pure redaction helpers for operational logs (TG-001-08).
 *
 * No I/O, no `process.env`, no console (Constitution Principle IV). The
 * emitting adapter is `lib/mutationLog.js`.
 *
 * ── What this exists to prevent ──────────────────────────────────────────
 * Before TG-001-08 the S&S adapter `JSON.stringify`-ed whole request and
 * response bodies into Vercel logs, which meant payment-profile IDs, the
 * account email, the full ship-to address and every vendor field landed in
 * plaintext. The Stripe and Printavo paths logged customer emails and
 * session IDs, and the edge logged a Clerk user ID on every admin request.
 *
 * The rule this module encodes: a log line carries only fields chosen by
 * name, and every value passes through a masker on the way out. Redaction is
 * deny-by-default — an unrecognised key whose *name* looks sensitive is
 * masked even if the caller forgot to think about it.
 */

/** Replacement for a value that must never appear in a log. */
export const REDACTED = '«redacted»';

/**
 * Key-name fragments that force redaction wherever they appear, at any depth.
 * Matched case-insensitively against the key name with word boundaries
 * relaxed, so `paymentProfile`, `payment_profile` and `PAYMENTPROFILEID` all
 * match `paymentprofile`.
 */
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'credential',
  'signature',
  'cookie',
  'session_id',
  'sessionid',
  'paymentprofile',
  'profileid',
  'card',
  'cvv',
  'iban',
  'ssn',
  'taxid',
];

/**
 * Keys whose values are masked rather than removed, because their *shape*
 * is operationally useful even when the value must not be disclosed.
 */
const EMAIL_KEY_FRAGMENTS = ['email', 'emailaddress', 'mailto'];
const URL_KEY_FRAGMENTS = ['url', 'link', 'href'];

/**
 * Address-bearing key names, matched *exactly* rather than by substring.
 *
 * Substring matching would swallow `emailAddress` and `ipAddress` too, so
 * these are listed in full. An object under one of these keys is reduced to
 * coarse locality by `maskAddress`; a bare string (a street line) is
 * redacted outright.
 */
const ADDRESS_KEYS = [
  'address',
  'address1',
  'address2',
  'addressline1',
  'addressline2',
  'addr',
  'street',
  'streetaddress',
  'shippingaddress',
  'billingaddress',
  'shipto',
];

function flattenKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function keyMatches(key, fragments) {
  const flat = flattenKey(key);
  return fragments.some((fragment) => flat.includes(flattenKey(fragment)));
}

function isAddressKey(key) {
  return ADDRESS_KEYS.includes(flattenKey(key));
}

/**
 * A short, stable, non-plaintext tag for a value.
 *
 * Lets two log lines be recognised as referring to the same email or ID
 * without either line containing it. FNV-1a — deliberately not a security
 * primitive; it exists so support can correlate, not so a value can be
 * safely published. Never use it to protect a secret.
 *
 * @param {unknown} value
 * @returns {string} e.g. `#3f2a91b7`
 */
export function fingerprint(value) {
  const input = String(value ?? '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `#${hash.toString(16).padStart(8, '0')}`;
}

/**
 * Mask an email to its domain plus a correlation tag.
 * `terry@aspmerch.com` → `«email:aspmerch.com#1a2b3c4d»`
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function maskEmail(value) {
  if (typeof value !== 'string' || !value.includes('@')) {
    return value == null ? null : REDACTED;
  }
  const domain = value.slice(value.lastIndexOf('@') + 1).toLowerCase();
  return `«email:${domain}${fingerprint(value.trim().toLowerCase())}»`;
}

/**
 * Strip the query string and fragment from a URL.
 *
 * This is what keeps signed customer links (`/proof?id=…&token=…`) out of
 * logs while leaving the route recognisable. A non-URL string is redacted
 * outright rather than logged on the assumption it is harmless.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function maskUrl(value) {
  if (typeof value !== 'string' || value === '') return value == null ? null : REDACTED;
  try {
    const parsed = new URL(value);
    const hadSecrets = parsed.search !== '' || parsed.hash !== '';
    return `${parsed.origin}${parsed.pathname}${hadSecrets ? '?«stripped»' : ''}`;
  } catch {
    // Relative or malformed — keep the path, drop everything after `?`.
    const [path] = String(value).split(/[?#]/);
    return path === value ? path : `${path}?«stripped»`;
  }
}

/**
 * Reduce a postal address to the coarse locality fields.
 *
 * Keeps city / state / country and the first three ZIP characters, which is
 * enough to tell a wrong-warehouse shipment from a right one, and drops the
 * street line and recipient identity entirely.
 *
 * @param {object|null|undefined} address
 * @returns {object|null}
 */
export function maskAddress(address) {
  if (!address || typeof address !== 'object') return null;

  // Idempotent: a caller may mask an address before handing it to a logger
  // that masks again. Re-masking an already-masked value would otherwise
  // silently drop `zipPrefix`, since the masked shape has no `zip`.
  if ('zipPrefix' in address) {
    return {
      city: address.city ?? null,
      state: address.state ?? null,
      country: address.country ?? null,
      zipPrefix: address.zipPrefix ?? null,
    };
  }

  const zip = typeof address.zip === 'string' ? address.zip : '';
  return {
    city: address.city ?? null,
    state: address.state ?? null,
    country: address.country ?? null,
    zipPrefix: zip ? `${zip.slice(0, 3)}…` : null,
  };
}

/**
 * Deep-redact an arbitrary value by key name.
 *
 * Applied by `lib/mutationLog.js` to every field it emits, so a caller that
 * allowlists a field but forgets that it nests a token still cannot leak it.
 *
 * @param {unknown} value
 * @param {number} [depth] Internal recursion guard.
 * @returns {unknown}
 */
export function redact(value, depth = 0) {
  if (depth > 6) return REDACTED;
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => redact(item, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;

  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'boolean') {
      // A boolean cannot disclose a value, so key-name matching must not
      // destroy it. `hasPaymentProfile: true` is exactly the signal an
      // operator needs, and redacting it to a placeholder loses the audit
      // trail without protecting anything.
      out[key] = raw;
    } else if (keyMatches(key, SENSITIVE_KEY_FRAGMENTS)) {
      out[key] = REDACTED;
    } else if (isAddressKey(key)) {
      // Objects keep their locality; a bare street string keeps nothing.
      out[key] = raw && typeof raw === 'object' ? maskAddress(raw) : REDACTED;
    } else if (keyMatches(key, EMAIL_KEY_FRAGMENTS)) {
      out[key] = maskEmail(raw);
    } else if (keyMatches(key, URL_KEY_FRAGMENTS)) {
      out[key] = maskUrl(raw);
    } else {
      out[key] = redact(raw, depth + 1);
    }
  }
  return out;
}

/**
 * Allowlist projection — the primary way callers should build a log payload.
 *
 * Returns only the named keys. Combined with `redact()` in the emitter this
 * gives two independent controls: the caller says what is interesting, and
 * the emitter still masks anything sensitive that slipped through.
 *
 * @param {object|null|undefined} source
 * @param {string[]} allowed
 * @returns {object}
 */
export function pick(source, allowed) {
  if (!source || typeof source !== 'object') return {};
  const out = {};
  for (const key of allowed) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

/**
 * Summarise a vendor payload without reproducing it.
 *
 * Replaces the old `JSON.stringify(body, null, 2)` calls: a reviewer can see
 * the shape and size of what was exchanged, and can ask for the vendor's own
 * copy by correlation ID, without the payload itself being in our logs.
 *
 * @param {unknown} payload
 * @returns {{ type: string, keys?: string[], length?: number, byteLength: number }}
 */
export function summarizePayload(payload) {
  let byteLength = 0;
  try {
    byteLength = JSON.stringify(payload)?.length ?? 0;
  } catch {
    byteLength = -1; // circular or non-serialisable
  }

  if (Array.isArray(payload)) {
    return { type: 'array', length: payload.length, byteLength };
  }
  if (payload && typeof payload === 'object') {
    return { type: 'object', keys: Object.keys(payload).slice(0, 40), byteLength };
  }
  return { type: payload === null ? 'null' : typeof payload, byteLength };
}
