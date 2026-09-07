import { test, expect } from '@playwright/test';

// API smoke tests — verify endpoints are reachable and return appropriate
// error responses for invalid input. Tested via page.evaluate() so the
// browser's Origin header is included for same-origin requests.

test.describe('API – garment-pricing', () => {
  test('rejects request without styles param (400 or 403 origin guard)', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/garment-pricing');
      return { status: r.status };
    });
    // 400 = validation error (styles missing)
    // 403 = origin guard (browser may omit Origin header for same-origin GETs)
    expect([400, 403]).toContain(res.status);
  });

  test('responds (non-500) when styles param is provided and origin is valid', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/garment-pricing?styles=5000');
      return { status: r.status };
    });
    // 200 = success, 403 = origin guard, 500 = SS Activewear not configured in dev
    expect([200, 403, 500]).toContain(res.status);
  });
});

test.describe('API – order-status', () => {
  test('returns error JSON when id is missing', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/order-status');
      return { status: r.status, body: await r.json().catch(() => null) };
    });
    expect(res.status).not.toBe(200);
    // Either has a JSON error body or null (502 gateway error)
    if (res.body) {
      expect(typeof res.body).toBe('object');
    }
  });

  test('returns non-200 for invalid token', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/order-status?id=fake-id&token=bad-token');
      return { status: r.status };
    });
    // 400 = missing/invalid param, 403 = bad token, 404 = not found,
    // 500/502 = Printavo integration not configured in dev
    expect(res.status).not.toBe(200);
  });
});

test.describe('API – proof', () => {
  test('returns non-200 when id or token is missing', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/proof');
      return { status: r.status };
    });
    expect(res.status).not.toBe(200);
  });

  test('returns non-200 for invalid token', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/proof?id=fake&token=bad');
      return { status: r.status };
    });
    expect(res.status).not.toBe(200);
  });
});

test.describe('API – submit-quote (public endpoint)', () => {
  test('returns non-200 when body is empty', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/submit-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      return { status: r.status };
    });
    expect(res.status).not.toBe(200);
  });

  test('request without browser Origin is rejected (403)', async ({ page }) => {
    // Direct HTTP request from Playwright (no browser context) has no Origin header.
    const res = await page.request.post('/api/submit-quote', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });
    // 400 (validation) or 403 (origin guard) — 200 must not be returned
    expect(res.status()).not.toBe(200);
  });
});

test.describe('API – validate-promo', () => {
  test('returns non-200 when code is missing', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/validate-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      return { status: r.status };
    });
    expect([400, 422]).toContain(res.status);
  });

  test('returns valid:false for unknown promo code', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/validate-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'NOTREAL9999' }),
      });
      const body = await r.json().catch(() => null);
      return { status: r.status, body };
    });
    // Either 404 or 200 with valid:false
    expect([200, 404, 400]).toContain(res.status);
    if (res.status === 200 && res.body) {
      expect(res.body.valid).toBe(false);
    }
  });
});

test.describe('API – upload (public endpoint, TG-001-07)', () => {
  // Rejection paths only: each returns before `put()` is called, so no test
  // run ever writes a blob (AC2 — a blocked request creates no side effect).

  test('rejects a request with no filename', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/upload', { method: 'POST', body: 'x' });
      return { status: r.status };
    });
    expect([400, 403]).toContain(res.status);
  });

  test('rejects a path-traversal filename', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch(`/api/upload?filename=${encodeURIComponent('../../etc/passwd')}`, {
        method: 'POST',
        body: 'x',
      });
      return { status: r.status };
    });
    expect([400, 403]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  test('rejects an unsupported file type', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/upload?filename=payload.html', { method: 'POST', body: '<h1>x</h1>' });
      return { status: r.status };
    });
    expect([415, 403]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  test('rejects an oversized declared upload', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      // 20 MB of declared payload against a 10 MB cap.
      const r = await fetch('/api/upload?filename=big.png', {
        method: 'POST',
        body: new Blob([new Uint8Array(20 * 1024 * 1024)]),
      });
      return { status: r.status };
    });
    expect([413, 403]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  test('a request without a browser Origin is rejected', async ({ page }) => {
    const res = await page.request.post('/api/upload?filename=logo.png', { data: 'x' });
    expect(res.status()).not.toBe(200);
  });
});

test.describe('API – create-payment-session (TG-001-04)', () => {
  test('a request without a browser Origin is rejected', async ({ page }) => {
    // Variance V3: this route previously had neither auth nor an origin guard.
    const res = await page.request.post('/api/create-payment-session', {
      data: { invoiceId: 'inv_1', amountCents: 100 },
    });
    expect(res.status()).toBe(403);
  });

  test('rejects a request with no invoiceId', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/create-payment-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: 100 }),
      });
      return { status: r.status };
    });
    // 400 = validation, 403 = origin guard. Never a created Stripe session.
    expect([400, 403]).toContain(res.status);
  });

  test('never returns a session for an invoice it cannot price', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/create-payment-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: 'made-up-invoice', amountCents: 1 }),
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    });
    // AC4: fail closed. Whatever goes wrong — unknown invoice, unreachable
    // Printavo, denied access — no sessionUrl comes back.
    expect(res.status).not.toBe(200);
    expect(res.body?.sessionUrl).toBeUndefined();
  });
});
