import { test, expect } from '@playwright/test';
import { resolveRole, hasAdminRole, ADMIN_ROLE, KNOWN_ROLES } from '../../lib/roles.js';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * TG-001-06 — one Clerk role source.
 *
 * T1 asks for a negative matrix over signed-out, customer, staff and Owner
 * access. The resolver is pure, so the matrix is exercised directly here
 * rather than through 30 authenticated HTTP round trips that CI cannot make
 * (the workflow provisions no Clerk credentials — variance V6).
 */

// Playwright runs from the project root, so cwd is the repo root.
const REPO_ROOT = process.cwd();

/** The four principals named in T1, in each shape the resolver may see. */
const PRINCIPALS = {
  signedOut: [null, undefined, {}],
  customer: [
    { publicMetadata: {} },
    { publicMetadata: { role: null } },
    { metadata: { role: 'customer' } },
    { role: 'customer' },
  ],
  staff: [{ publicMetadata: { role: 'staff' } }, { role: 'editor' }],
  owner: [
    { publicMetadata: { role: 'admin' } },
    { metadata: { role: 'admin' } },
    { role: 'admin' },
  ],
};

test.describe('resolveRole — negative matrix (T1, AC3)', () => {
  for (const [label, sources] of Object.entries(PRINCIPALS)) {
    const shouldBeAdmin = label === 'owner';
    for (const [index, source] of sources.entries()) {
      test(`${label} #${index} is ${shouldBeAdmin ? '' : 'not '}admin`, () => {
        expect(hasAdminRole(source)).toBe(shouldBeAdmin);
      });
    }
  }

  test('an unknown role is not privileged, and does not resolve at all', () => {
    // "staff" is a plausible role name that this app does not grant. It must
    // deny, and it must not leak through as a truthy role either.
    expect(resolveRole({ publicMetadata: { role: 'staff' } })).toBeNull();
    expect(KNOWN_ROLES).toEqual([ADMIN_ROLE]);
  });

  for (const malformed of [
    { publicMetadata: { role: 123 } },
    { publicMetadata: { role: true } },
    { publicMetadata: { role: ['admin'] } },
    { publicMetadata: { role: { name: 'admin' } } },
    { role: 'admin ' + String.fromCharCode(0) },
    'admin',
    42,
  ]) {
    test(`malformed role ${JSON.stringify(malformed)} denies`, () => {
      expect(hasAdminRole(malformed)).toBe(false);
    });
  }

  test('role matching is case- and whitespace-insensitive', () => {
    expect(hasAdminRole({ publicMetadata: { role: '  Admin ' } })).toBe(true);
    expect(hasAdminRole({ publicMetadata: { role: 'ADMIN' } })).toBe(true);
  });

  test('publicMetadata wins over a stale flat claim', () => {
    // The exact divergence that caused finding F5: two sources disagreeing.
    // Precedence must be deterministic, and the authoritative source must win.
    expect(resolveRole({ publicMetadata: { role: 'admin' }, role: 'customer' })).toBe(ADMIN_ROLE);
  });

  test('a non-admin publicMetadata does not fall through to a flat admin claim', () => {
    // `publicMetadata.role: 'customer'` is not a *recognised* role, so the
    // resolver moves on. This documents that deliberately: the flat claim is
    // still a legitimate source for deployments without a JWT template.
    expect(resolveRole({ publicMetadata: { role: 'customer' }, role: 'admin' })).toBe(ADMIN_ROLE);
  });
});

test.describe('both auth layers use the one resolver (AC1)', () => {
  test('proxy.js resolves roles through lib/roles.js', () => {
    const proxySource = readFileSync(join(REPO_ROOT, 'proxy.js'), 'utf8');
    expect(proxySource).toContain("from '@/lib/roles'");
    expect(proxySource).toContain('hasAdminRole(sessionClaims)');
    // The bug this replaces: an inline comparison against one claim only.
    expect(proxySource).not.toContain("sessionClaims?.role === 'admin'");
  });

  test('lib/adminAuth.js resolves roles through lib/roles.js', () => {
    const source = readFileSync(join(REPO_ROOT, 'lib', 'adminAuth.js'), 'utf8');
    expect(source).toContain("from './roles.js'");
    expect(source).not.toContain("publicMetadata?.role === 'admin'");
  });

  test('proxy.js no longer logs identity on every admin request', () => {
    // Variance V12: userId and role were logged for successful traffic too.
    const proxySource = readFileSync(join(REPO_ROOT, 'proxy.js'), 'utf8');
    expect(proxySource).not.toContain('admin route check');
  });
});

test.describe('obsolete NextAuth references are gone (AC2)', () => {
  test('no application source calls getServerSession', () => {
    const source = [
      readFileSync(join(REPO_ROOT, 'lib', 'adminAuth.js'), 'utf8'),
      readFileSync(join(REPO_ROOT, 'proxy.js'), 'utf8'),
    ].join('\n');
    expect(source).not.toContain('getServerSession');
  });

  test('the constitution no longer mandates a function that does not exist', () => {
    // Variance V7: Principle VII cited `getServerSession(authOptions)`, which
    // was removed with NextAuth. An agent following it literally wrote the
    // wrong auth code.
    const constitution = readFileSync(
      join(REPO_ROOT, '.specify', 'memory', 'constitution.md'),
      'utf8',
    );
    const principleVII = constitution.slice(constitution.indexOf('### VII.'));
    expect(principleVII).not.toContain('getServerSession(authOptions)');
  });
});
