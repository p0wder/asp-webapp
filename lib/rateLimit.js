/**
 * In-process request rate limiting for public routes (TG-001-07).
 *
 * ── Honest scope ─────────────────────────────────────────────────────────
 * Counters live in a module-level Map, which means **per serverless
 * instance**. Vercel runs several concurrently and recycles them, so an
 * attacker spread across instances gets a multiple of the nominal limit, and
 * a cold start resets the window.
 *
 * This is a deliberate, documented interim control, not a complete one. The
 * TG-001-01 audit (variance V4) recorded that no rate limiting of any kind
 * existed and no shared store exists to build a correct one on. Until a
 * datastore lands (TG-003-03), a per-instance limiter is what is available,
 * and it still does the job that matters most here: it bounds the cost of a
 * single client hammering one warm instance — the realistic shape of an
 * accidental retry loop or an unsophisticated scraper — and it does so
 * without adding a dependency.
 *
 * Do not treat it as a security boundary. The origin guard, schema validation
 * and payload limits in `lib/httpGuards.js` are the controls that must hold
 * on their own.
 */

/** @type {Map<string, { count: number, resetAt: number }>} */
const buckets = new Map();

/** Stop the Map growing without bound on a long-lived instance. */
const MAX_TRACKED_KEYS = 5000;

/**
 * Named policies, so limits are declared in one place rather than scattered
 * across route handlers as loose numbers.
 */
export const RATE_LIMIT_POLICIES = Object.freeze({
  /** Creates Printavo customers, quotes, line items and imprints. */
  submitQuote: { limit: 5, windowMs: 10 * 60 * 1000 },
  /** Writes to Vercel Blob; the most expensive public route per request. */
  upload: { limit: 20, windowMs: 10 * 60 * 1000 },
  /** Read-only but enumerable — a promo-code guessing oracle. */
  validatePromo: { limit: 30, windowMs: 10 * 60 * 1000 },
  /** Read-only, fans out to the S&S catalog API. */
  garmentPricing: { limit: 60, windowMs: 10 * 60 * 1000 },
  /** Creates real Stripe Checkout sessions. */
  createPaymentSession: { limit: 10, windowMs: 10 * 60 * 1000 },
});

/**
 * Pure window arithmetic, separated so it can be tested without touching the
 * shared Map or the clock.
 *
 * @param {{ count: number, resetAt: number }|undefined} bucket
 * @param {number} now Epoch milliseconds.
 * @param {{ limit: number, windowMs: number }} policy
 * @returns {{ allowed: boolean, bucket: { count: number, resetAt: number }, remaining: number, retryAfterSeconds: number }}
 */
export function evaluateWindow(bucket, now, policy) {
  const expired = !bucket || now >= bucket.resetAt;
  const next = expired
    ? { count: 1, resetAt: now + policy.windowMs }
    : { count: bucket.count + 1, resetAt: bucket.resetAt };

  const allowed = next.count <= policy.limit;
  return {
    allowed,
    bucket: next,
    remaining: Math.max(0, policy.limit - next.count),
    retryAfterSeconds: Math.max(1, Math.ceil((next.resetAt - now) / 1000)),
  };
}

/**
 * Count one request against a key and say whether it is allowed.
 *
 * @param {string} key    Caller identity, from `clientKey()`.
 * @param {{ limit: number, windowMs: number }} policy One of `RATE_LIMIT_POLICIES`.
 * @param {number} [now]  Injectable clock, for tests.
 * @returns {{ allowed: boolean, remaining: number, retryAfterSeconds: number, limit: number }}
 */
export function rateLimit(key, policy, now = Date.now()) {
  // Evict expired entries opportunistically before growing the Map.
  if (buckets.size >= MAX_TRACKED_KEYS) {
    for (const [existingKey, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(existingKey);
    }
    // Still full — every tracked window is live. Drop the oldest so a flood of
    // unique keys degrades the limiter rather than exhausting memory.
    if (buckets.size >= MAX_TRACKED_KEYS) {
      buckets.delete(buckets.keys().next().value);
    }
  }

  const result = evaluateWindow(buckets.get(key), now, policy);
  buckets.set(key, result.bucket);

  return {
    allowed: result.allowed,
    remaining: result.remaining,
    retryAfterSeconds: result.retryAfterSeconds,
    limit: policy.limit,
  };
}

/**
 * Derive a rate-limit key for a request.
 *
 * `x-forwarded-for` is set by Vercel's edge and is the closest thing to a
 * client identity available here. It is spoofable in principle, which is
 * another reason this limiter is not a security boundary — but a spoofing
 * client is also a client that could rotate real addresses anyway.
 *
 * @param {Request} request
 * @param {string} scope Route name, so limits do not bleed between routes.
 * @returns {string}
 */
export function clientKey(request, scope) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return `${scope}:${ip}`;
}

/** Clear all counters. Test-only. */
export function resetRateLimits() {
  buckets.clear();
}
