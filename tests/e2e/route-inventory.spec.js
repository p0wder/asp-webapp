import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * TG-001-09 — bootstrap and diagnostic endpoints.
 *
 * AC3 asks for an automated route inventory that fails if a new bootstrap or
 * debug endpoint is accidentally exposed. That is what this file is: it walks
 * `app/api` on every run, so a route added months from now is checked by the
 * same rule as the two removed here.
 */

// Playwright runs from the project root, so cwd is the repo root.
const REPO_ROOT = process.cwd();
const API_ROOT = join(REPO_ROOT, 'app', 'api');

/** Every `route.js` under `app/api`, as an API path. */
function listApiRoutes(dir = API_ROOT, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listApiRoutes(full, found);
    } else if (entry === 'route.js' || entry === 'route.jsx') {
      const routePath = `/api/${relative(API_ROOT, dir).split(sep).join('/')}`;
      found.push({ routePath, file: full, source: readFileSync(full, 'utf8') });
    }
  }
  return found;
}

/**
 * Name fragments that mark a route as a bootstrap or diagnostic endpoint.
 * These are the routes that must never be publicly reachable in production.
 */
const SENSITIVE_ROUTE_FRAGMENTS = ['debug', 'admin-setup', 'setup', 'bootstrap', 'diag', 'whoami'];

/** Routes intentionally reachable without a session; each has its own control. */
const KNOWN_PUBLIC_ROUTES = new Set([
  '/api/submit-quote',
  '/api/upload',
  '/api/validate-promo',
  '/api/garment-pricing',
  '/api/order-status',
  '/api/proof',
  '/api/proof-decision',
  '/api/stripe-webhook',
  '/api/create-payment-session',
  '/api/cron/refresh-leads',
  '/api/my-orders',
]);

const routes = listApiRoutes();
const proxySource = readFileSync(join(REPO_ROOT, 'proxy.js'), 'utf8');

test.describe('route inventory (AC3)', () => {
  test('the inventory is non-empty — a broken walker must not pass silently', () => {
    expect(routes.length).toBeGreaterThan(15);
  });

  test('the removed bootstrap and diagnostic routes are absent', () => {
    const paths = routes.map((r) => r.routePath);
    expect(paths).not.toContain('/api/admin-setup');
    expect(paths).not.toContain('/api/debug-auth');
  });

  test('no route matching a bootstrap or debug name exists', () => {
    const offenders = routes
      .map((r) => r.routePath)
      .filter((path) =>
        SENSITIVE_ROUTE_FRAGMENTS.some((fragment) => path.toLowerCase().includes(fragment)),
      );

    // If this fails, the new endpoint must either be deleted or given an
    // explicit, reviewed exemption here alongside its production gate.
    expect(offenders).toEqual([]);
  });

  test('every non-public route authorizes inside the handler (Principle VII)', () => {
    const unguarded = routes
      .filter((r) => !KNOWN_PUBLIC_ROUTES.has(r.routePath))
      .filter(
        (r) =>
          !r.source.includes('requireAdmin') &&
          !r.source.includes('auth()') &&
          !r.source.includes('verifyStatusAccess') &&
          !r.source.includes('verifyProofAccess'),
      )
      .map((r) => r.routePath);

    // `/api/search-products` was the single-layer violation recorded as
    // variance V2; this assertion is what stops another one appearing.
    expect(unguarded).toEqual([]);
  });

  test('the proxy matcher still covers the removed routes, so a re-added file is gated', () => {
    expect(proxySource).toContain("'/api/admin-setup(.*)'");
    expect(proxySource).toContain("'/api/debug-auth(.*)'");
  });

  test('no route hard-codes an admin email address', () => {
    // The bootstrap route promoted two hard-coded addresses (variance V10).
    for (const route of routes) {
      const inlineAdminEmails = route.source.match(/ADMIN_EMAILS\s*=/);
      expect(inlineAdminEmails, `${route.routePath} hard-codes an admin list`).toBeNull();
    }
  });

  test('no route reads a secret from the query string', () => {
    // The bootstrap route took its token via `?token=`, which lands in access
    // logs, browser history and Referer headers (variance V10).
    for (const route of routes) {
      const querySecret = route.source.match(
        /searchParams\.get\(['"](?:token|secret|key|password)['"]\)/,
      );
      // The customer status/proof links legitimately carry an HMAC token in
      // the query string — that token IS the capability, not a shared secret.
      const isCustomerLinkRoute = [
        '/api/order-status',
        '/api/proof',
        '/api/proof-decision',
        '/api/create-payment-session',
      ].includes(route.routePath);
      if (isCustomerLinkRoute) continue;
      expect(querySecret, `${route.routePath} reads a secret from the query string`).toBeNull();
    }
  });
});
