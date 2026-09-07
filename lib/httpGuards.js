/**
 * Shared request guards for public API routes (TG-001-07).
 *
 * These return plain result objects rather than `NextResponse`, so the
 * framework stays in the route layer (Constitution Principle III) and the
 * guards can be exercised directly in tests.
 *
 * ── Why one helper ───────────────────────────────────────────────────────
 * There used to be four separate `isSameOrigin` implementations across
 * `submit-quote`, `upload`, `validate-promo` and `garment-pricing`, and they
 * did not agree (variance V5b):
 *
 *   • `submit-quote` compared `Origin` against the `Host` header.
 *   • The other three compared it against `NEXTAUTH_URL`, which meant that if
 *     that variable was unset in production they all silently fell back to
 *     `http://localhost:3000` and rejected every legitimate browser request.
 *   • All three of the latter unconditionally allowed *any* `localhost` or
 *     `127.0.0.1` origin, in production as well as development, because
 *     nothing keyed that branch to `NODE_ENV`.
 *
 * This module is the one implementation, and it fixes all three.
 */

/** Default cap for a JSON request body. */
export const DEFAULT_MAX_JSON_BYTES = 128 * 1024; // 128 KB

/** Default cap for a binary upload. */
export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * The origins this deployment accepts browser requests from.
 *
 * The `Host`-derived entry is what makes this work on Vercel preview
 * deployments with no configuration at all, and it is exactly as strong as a
 * configured origin for the threat this control addresses: a cross-site
 * request carries the *attacker's* `Origin` and our `Host`, so it fails the
 * comparison either way. A non-browser client can forge both — but a
 * non-browser client could equally forge a configured origin, so nothing is
 * lost. This is CSRF defence, not authentication.
 *
 * @param {Request} request
 * @returns {string[]}
 */
export function allowedOrigins(request) {
  const origins = [];

  // Preferred explicit configuration.
  if (process.env.APP_ORIGIN) origins.push(process.env.APP_ORIGIN);
  // Legacy name, still provisioned in Vercel. Retained so this change needs no
  // coordinated environment edit; see README for the migration note.
  if (process.env.NEXTAUTH_URL) origins.push(process.env.NEXTAUTH_URL);

  const host = request.headers.get('host');
  if (host) {
    origins.push(`https://${host}`);
    // A plain-HTTP host is only meaningful off production.
    if (process.env.NODE_ENV !== 'production') origins.push(`http://${host}`);
  }

  return origins.map((origin) => origin.replace(/\/$/, ''));
}

/**
 * True when the request came from this app's own frontend.
 *
 * A missing `Origin` header denies: server-to-server callers have no business
 * on these routes, and browsers always send one for the cross-origin requests
 * this guards against.
 *
 * @param {Request} request
 * @returns {boolean}
 */
export function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  const normalized = origin.replace(/\/$/, '');
  if (allowedOrigins(request).includes(normalized)) return true;

  // Local development only — never in production, which is the bug this
  // replaces (variance V5b).
  if (process.env.NODE_ENV !== 'production') {
    return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized);
  }

  return false;
}

/**
 * The base URL to build customer-facing links against.
 *
 * Replaces three different hard-coded fallbacks (`http://localhost:3000` in
 * `create-payment-session`, a literal Vercel hostname in `proof-upload`).
 * Deriving from the request `Host` means preview deployments build links that
 * point at themselves instead of at production.
 *
 * @param {Request} request
 * @returns {string} Origin with no trailing slash.
 */
export function appBaseUrl(request) {
  const [first] = allowedOrigins(request);
  if (first) return first;
  return 'http://localhost:3000';
}

/**
 * Reject a request whose declared body exceeds a limit, before reading it.
 *
 * `Content-Length` is advisory — a chunked request omits it — so this is a
 * cheap early rejection, not the only limit. `readJsonBody` enforces the real
 * one against the bytes actually received.
 *
 * @param {Request} request
 * @param {number} maxBytes
 * @returns {{ ok: true } | { ok: false, error: string, status: number }}
 */
export function checkContentLength(request, maxBytes) {
  const declared = Number.parseInt(request.headers.get('content-length') || '', 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, error: `Request body exceeds ${maxBytes} bytes.` };
  }
  return { ok: true };
}

/**
 * Read and parse a JSON body with a hard size cap.
 *
 * The body is read as text first so the cap applies to the bytes actually
 * received, not just to what the client claimed in `Content-Length`.
 *
 * @param {Request} request
 * @param {{ maxBytes?: number }} [options]
 * @returns {Promise<{ ok: true, body: unknown } | { ok: false, error: string, status: number }>}
 */
export async function readJsonBody(request, { maxBytes = DEFAULT_MAX_JSON_BYTES } = {}) {
  const declared = checkContentLength(request, maxBytes);
  if (!declared.ok) return declared;

  let text;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400, error: 'Could not read request body.' };
  }

  if (text.length > maxBytes) {
    return { ok: false, status: 413, error: `Request body exceeds ${maxBytes} bytes.` };
  }

  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: 'Request body must be valid JSON.' };
  }
}

/**
 * Assert a value is a string within length bounds.
 * Small enough to inline, but shared so every public route agrees on what
 * "a required string field" means.
 *
 * @param {unknown} value
 * @param {{ min?: number, max?: number }} [bounds]
 * @returns {boolean}
 */
export function isBoundedString(value, { min = 1, max = 5000 } = {}) {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

/**
 * Assert a value is an array within length bounds.
 *
 * @param {unknown} value
 * @param {{ min?: number, max?: number }} [bounds]
 * @returns {boolean}
 */
export function isBoundedArray(value, { min = 0, max = 200 } = {}) {
  return Array.isArray(value) && value.length >= min && value.length <= max;
}
