import { test, expect } from '@playwright/test';
import {
  isSameOrigin,
  allowedOrigins,
  appBaseUrl,
  readJsonBody,
  checkContentLength,
  isBoundedString,
  isBoundedArray,
  DEFAULT_MAX_JSON_BYTES,
} from '../../lib/httpGuards.js';
import {
  rateLimit,
  evaluateWindow,
  clientKey,
  resetRateLimits,
  RATE_LIMIT_POLICIES,
} from '../../lib/rateLimit.js';

/**
 * TG-001-07 — validation, quotas and abuse controls on public routes.
 *
 * T1 asks for malformed payloads, oversized uploads, bursts, bot-like retries
 * and safe error bodies. These exercise the shared guards directly; the HTTP
 * smoke coverage stays in `api.spec.js`.
 *
 * Serial, because the origin tests mutate `process.env.NODE_ENV`.
 */
test.describe.configure({ mode: 'serial' });

let envBackup;

test.beforeEach(() => {
  envBackup = {
    nodeEnv: process.env.NODE_ENV,
    appOrigin: process.env.APP_ORIGIN,
    nextAuthUrl: process.env.NEXTAUTH_URL,
  };
  delete process.env.APP_ORIGIN;
  delete process.env.NEXTAUTH_URL;
  resetRateLimits();
});

test.afterEach(() => {
  for (const [key, value] of [
    ['NODE_ENV', envBackup.nodeEnv],
    ['APP_ORIGIN', envBackup.appOrigin],
    ['NEXTAUTH_URL', envBackup.nextAuthUrl],
  ]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetRateLimits();
});

function makeRequest({ origin, host = 'app.example.test', ...init } = {}) {
  const headers = { host, ...(origin ? { origin } : {}), ...(init.headers || {}) };
  return new Request('https://app.example.test/api/test', { ...init, headers });
}

test.describe('origin guard (variance V5b)', () => {
  test('a localhost origin is refused in production', () => {
    // The bug this replaces: every public route accepted any localhost origin
    // in production, because nothing keyed that branch to NODE_ENV.
    process.env.NODE_ENV = 'production';
    expect(isSameOrigin(makeRequest({ origin: 'http://localhost:3000' }))).toBe(false);
    expect(isSameOrigin(makeRequest({ origin: 'http://127.0.0.1:9999' }))).toBe(false);
  });

  test('a localhost origin is accepted outside production', () => {
    process.env.NODE_ENV = 'development';
    expect(isSameOrigin(makeRequest({ origin: 'http://localhost:3000' }))).toBe(true);
  });

  test('the request Host is an accepted origin, so NEXTAUTH_URL is not load-bearing', () => {
    // The bug this replaces: with NEXTAUTH_URL unset, the guard fell back to
    // http://localhost:3000 and rejected all legitimate production traffic.
    process.env.NODE_ENV = 'production';
    expect(isSameOrigin(makeRequest({ origin: 'https://app.example.test' }))).toBe(true);
  });

  test('a cross-site origin is refused even when the Host matches', () => {
    process.env.NODE_ENV = 'production';
    expect(isSameOrigin(makeRequest({ origin: 'https://evil.example' }))).toBe(false);
  });

  test('a missing Origin header is refused', () => {
    process.env.NODE_ENV = 'production';
    expect(isSameOrigin(makeRequest({}))).toBe(false);
  });

  test('a trailing slash does not change the decision', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ORIGIN = 'https://app.example.test/';
    expect(isSameOrigin(makeRequest({ origin: 'https://app.example.test' }))).toBe(true);
  });

  test('APP_ORIGIN takes precedence in the resolved base URL', () => {
    process.env.APP_ORIGIN = 'https://configured.example.test';
    expect(appBaseUrl(makeRequest({}))).toBe('https://configured.example.test');
    expect(allowedOrigins(makeRequest({}))).toContain('https://app.example.test');
  });

  test('the base URL falls back to the request host, not a literal domain', () => {
    expect(appBaseUrl(makeRequest({}))).toBe('https://app.example.test');
  });
});

test.describe('payload limits (T1, AC1)', () => {
  test('an oversized declared Content-Length is refused before the body is read', () => {
    const request = makeRequest({ headers: { 'content-length': String(DEFAULT_MAX_JSON_BYTES + 1) } });
    expect(checkContentLength(request, DEFAULT_MAX_JSON_BYTES)).toMatchObject({ ok: false, status: 413 });
  });

  test('an oversized body is refused even when Content-Length lies', async () => {
    const request = new Request('https://app.example.test/api/test', {
      method: 'POST',
      body: JSON.stringify({ pad: 'x'.repeat(2000) }),
    });
    const result = await readJsonBody(request, { maxBytes: 100 });
    expect(result).toMatchObject({ ok: false, status: 413 });
  });

  test('malformed JSON yields 400 with a safe message', async () => {
    const request = new Request('https://app.example.test/api/test', {
      method: 'POST',
      body: '{"unterminated": ',
    });
    const result = await readJsonBody(request);
    expect(result).toMatchObject({ ok: false, status: 400 });
    // AC3: an error body must not disclose internals.
    expect(result.error).toBe('Request body must be valid JSON.');
  });

  test('a well-formed body within the limit parses', async () => {
    const request = new Request('https://app.example.test/api/test', {
      method: 'POST',
      body: JSON.stringify({ code: 'SAVE10' }),
    });
    const result = await readJsonBody(request);
    expect(result).toMatchObject({ ok: true, body: { code: 'SAVE10' } });
  });
});

test.describe('field bounds', () => {
  test('isBoundedString rejects non-strings, empties and overlong values', () => {
    expect(isBoundedString('SAVE10', { max: 64 })).toBe(true);
    expect(isBoundedString('', { max: 64 })).toBe(false);
    expect(isBoundedString('x'.repeat(65), { max: 64 })).toBe(false);
    for (const value of [null, undefined, 42, {}, ['SAVE10']]) {
      expect(isBoundedString(value)).toBe(false);
    }
  });

  test('isBoundedArray bounds write amplification', () => {
    expect(isBoundedArray([1], { min: 1, max: 50 })).toBe(true);
    expect(isBoundedArray([], { min: 1, max: 50 })).toBe(false);
    expect(isBoundedArray(new Array(51).fill(1), { min: 1, max: 50 })).toBe(false);
    expect(isBoundedArray('not-an-array')).toBe(false);
  });
});

test.describe('rate limiting (T1, variance V4)', () => {
  test('a burst past the limit is refused', () => {
    const policy = { limit: 3, windowMs: 60_000 };
    const results = Array.from({ length: 5 }, () => rateLimit('burst', policy, 0).allowed);
    expect(results).toEqual([true, true, true, false, false]);
  });

  test('bot-like retries stay refused for the rest of the window', () => {
    const policy = { limit: 1, windowMs: 60_000 };
    expect(rateLimit('bot', policy, 0).allowed).toBe(true);
    for (const t of [1_000, 30_000, 59_999]) {
      expect(rateLimit('bot', policy, t).allowed).toBe(false);
    }
  });

  test('the window reopens once it elapses', () => {
    const policy = { limit: 1, windowMs: 1_000 };
    expect(rateLimit('window', policy, 0).allowed).toBe(true);
    expect(rateLimit('window', policy, 500).allowed).toBe(false);
    expect(rateLimit('window', policy, 1_500).allowed).toBe(true);
  });

  test('a refusal reports how long to wait', () => {
    const policy = { limit: 1, windowMs: 60_000 };
    rateLimit('retry-after', policy, 0);
    const blocked = rateLimit('retry-after', policy, 10_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(50);
  });

  test('limits do not bleed between routes or between clients', () => {
    const policy = { limit: 1, windowMs: 60_000 };
    expect(rateLimit('upload:1.2.3.4', policy, 0).allowed).toBe(true);
    expect(rateLimit('submit-quote:1.2.3.4', policy, 0).allowed).toBe(true);
    expect(rateLimit('upload:5.6.7.8', policy, 0).allowed).toBe(true);
    expect(rateLimit('upload:1.2.3.4', policy, 0).allowed).toBe(false);
  });

  test('clientKey uses the first forwarded address and scopes by route', () => {
    const request = makeRequest({ headers: { 'x-forwarded-for': '203.0.113.7, 70.41.3.18' } });
    expect(clientKey(request, 'upload')).toBe('upload:203.0.113.7');
  });

  test('a request with no client address still gets a stable key', () => {
    expect(clientKey(makeRequest({}), 'upload')).toBe('upload:unknown');
  });

  test('evaluateWindow is pure — it does not mutate the bucket it is given', () => {
    const bucket = { count: 1, resetAt: 1_000 };
    evaluateWindow(bucket, 0, { limit: 5, windowMs: 1_000 });
    expect(bucket).toEqual({ count: 1, resetAt: 1_000 });
  });

  test('every declared policy is a positive limit over a positive window', () => {
    for (const [name, policy] of Object.entries(RATE_LIMIT_POLICIES)) {
      expect(policy.limit, name).toBeGreaterThan(0);
      expect(policy.windowMs, name).toBeGreaterThan(0);
    }
  });
});
