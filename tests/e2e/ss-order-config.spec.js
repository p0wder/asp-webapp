import { test, expect } from '@playwright/test';
import {
  parseSSOrderConfig,
  summarizeSSOrderConfig,
  SSOrderConfigError,
  SS_ORDER_MODES,
} from '../../lib/ssOrderConfig.js';
import {
  loadSSOrderConfig,
  requireSSOrderConfig,
  getSSOrderConfigStatus,
} from '../../lib/ssOrderConfigEnv.js';
import { createSSOrder, getSSOrderPreflight, getSSOrdersByPO } from '../../lib/ssActivewear.js';
import { SS_ORDERING_ENV_VAR } from '../../lib/ssOrderingSwitch.js';
import { installSSConfig, VALID_SS_CONFIG } from './fixtures/ssOrderConfig.js';

/**
 * TG-001-10 — fail-closed S&S operating configuration.
 *
 * Node-level tests, like the kill-switch suite: the adapter is exercised
 * directly with a counting `fetch` stub, which is what proves "zero supplier
 * calls on failure" (T1) rather than merely asserting on a rejection.
 *
 * Serial, because they mutate `process.env` and `globalThis.fetch`.
 */
test.describe.configure({ mode: 'serial' });

const REAL_FETCH = globalThis.fetch;
let fetchCalls;
let restoreConfig;
let envBackup;

function stubFetch() {
  fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), method: init?.method ?? 'GET' });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ orderNumber: 'SS-1' }),
      text: async () => '{}',
      headers: { get: () => null },
    };
  };
}

const VALID_ORDER = { lines: [{ identifier: 'G500-S-WHITE', qty: 1 }], poNumber: 'PO-1' };

test.beforeEach(() => {
  envBackup = {
    switch: process.env[SS_ORDERING_ENV_VAR],
    user: process.env.SS_ACTIVEWEAR_USERNAME,
    pass: process.env.SS_ACTIVEWEAR_PASSWORD,
  };
  // Kill switch open and credentials present throughout, so a blocked call can
  // only be explained by the configuration under test.
  process.env[SS_ORDERING_ENV_VAR] = 'true';
  process.env.SS_ACTIVEWEAR_USERNAME = 'test-user';
  process.env.SS_ACTIVEWEAR_PASSWORD = 'test-pass';
  fetchCalls = [];
});

test.afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  restoreConfig?.();
  restoreConfig = undefined;
  for (const [key, value] of [
    [SS_ORDERING_ENV_VAR, envBackup.switch],
    ['SS_ACTIVEWEAR_USERNAME', envBackup.user],
    ['SS_ACTIVEWEAR_PASSWORD', envBackup.pass],
  ]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test.describe('parseSSOrderConfig — pure validation', () => {
  test('accepts a complete configuration and derives testOrder from mode', () => {
    const result = parseSSOrderConfig(VALID_SS_CONFIG);
    expect(result.ok).toBe(true);
    expect(result.config.mode).toBe(SS_ORDER_MODES.TEST);
    expect(result.config.testOrder).toBe(true);
    expect(result.config.shippingMethod).toBe(54);
    expect(result.config.confirmationEmails).toEqual([
      'orders@example.test',
      'owner@example.test',
    ]);
  });

  test('live mode sets testOrder false — the two can never disagree', () => {
    const result = parseSSOrderConfig({ ...VALID_SS_CONFIG, mode: 'live' });
    expect(result.ok).toBe(true);
    expect(result.config.testOrder).toBe(false);
  });

  test('an entirely empty configuration is rejected, not defaulted', () => {
    const result = parseSSOrderConfig({});
    expect(result.ok).toBe(false);
    expect(result.config).toBeNull();
    // Every required field is reported at once, so one deploy cycle fixes all.
    expect(result.errors.map((e) => e.field)).toEqual(
      expect.arrayContaining([
        'mode',
        'accountEmail',
        'confirmationEmails',
        'shippingMethod',
        'shipTo.address',
      ]),
    );
  });

  for (const [label, overrides, expectedField] of [
    ['an unrecognised mode', { mode: 'maybe' }, 'mode'],
    ['an empty mode', { mode: '' }, 'mode'],
    ['a malformed account email', { accountEmail: 'not-an-email' }, 'accountEmail'],
    ['a malformed recipient in the list', { confirmationEmails: 'a@b.test,nope' }, 'confirmationEmails'],
    ['a non-numeric shipping method', { shippingMethod: 'free' }, 'shippingMethod'],
    ['a three-letter state', { shipToState: 'NEB' }, 'shipTo.state'],
    ['a non-ISO country', { shipToCountry: 'USA' }, 'shipTo.country'],
    ['a malformed US ZIP', { shipToZip: '687' }, 'shipTo.zip'],
    ['a missing street line', { shipToAddress: undefined }, 'shipTo.address'],
  ]) {
    test(`rejects ${label}`, () => {
      const result = parseSSOrderConfig({ ...VALID_SS_CONFIG, ...overrides });
      expect(result.ok).toBe(false);
      expect(result.errors.map((e) => e.field)).toContain(expectedField);
    });
  }

  test('attn is optional — a shop need not route by person', () => {
    const result = parseSSOrderConfig({ ...VALID_SS_CONFIG, shipToAttn: undefined });
    expect(result.ok).toBe(true);
    expect(result.config.shipTo.attn).toBeUndefined();
  });

  test('mode is not inferred from a partially valid configuration', () => {
    // Regression guard: an operator who sets everything *except* the mode must
    // not get a live order by omission.
    const result = parseSSOrderConfig({ ...VALID_SS_CONFIG, mode: undefined });
    expect(result.ok).toBe(false);
  });
});

test.describe('summarizeSSOrderConfig — audited, log-safe', () => {
  test('exposes mode and testOrder but no address, email or recipient list', () => {
    const { config } = parseSSOrderConfig({ ...VALID_SS_CONFIG, mode: 'live' });
    const summary = summarizeSSOrderConfig(config);

    expect(summary).toMatchObject({ configured: true, mode: 'live', testOrder: false });
    expect(summary.confirmationRecipientCount).toBe(2);

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('orders@example.test');
    expect(serialized).not.toContain('209 E 29th St');
    expect(serialized).not.toContain('Terry');
  });

  test('reports "not configured" rather than throwing on a null config', () => {
    expect(summarizeSSOrderConfig(null)).toEqual({ configured: false });
  });
});

test.describe('environment adapter', () => {
  test('reads the environment at call time, not at module load', () => {
    restoreConfig = installSSConfig({ mode: 'test' });
    expect(loadSSOrderConfig().config.mode).toBe('test');

    process.env.SS_ORDER_MODE = 'live';
    expect(loadSSOrderConfig().config.mode).toBe('live');
  });

  test('requireSSOrderConfig throws a typed error naming the bad fields', () => {
    restoreConfig = installSSConfig({ shippingMethod: 'free', accountEmail: undefined });

    const error = (() => {
      try {
        requireSSOrderConfig();
        return null;
      } catch (e) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(SSOrderConfigError);
    expect(error.code).toBe('SS_ORDER_CONFIG_INVALID');
    expect(error.errors.map((e) => e.field)).toEqual(
      expect.arrayContaining(['shippingMethod', 'accountEmail']),
    );
  });

  test('getSSOrderConfigStatus reports failure without throwing', () => {
    restoreConfig = installSSConfig({ mode: undefined });
    const status = getSSOrderConfigStatus();
    expect(status.ok).toBe(false);
    expect(status.errorFields).toContain('mode:MISSING');
  });
});

test.describe('createSSOrder — invalid configuration makes zero supplier calls (T1, AC2)', () => {
  for (const [label, overrides] of [
    ['the whole configuration is missing', Object.fromEntries(Object.keys(VALID_SS_CONFIG).map((k) => [k, undefined]))],
    ['the mode is missing', { mode: undefined }],
    ['the mode is malformed', { mode: 'LIVE-ish' }],
    ['the account email is missing', { accountEmail: undefined }],
    ['the ship-to street line is missing', { shipToAddress: undefined }],
    ['a confirmation recipient is malformed', { confirmationEmails: 'good@x.test,bad' }],
    ['the shipping method is malformed', { shippingMethod: '-1' }],
  ]) {
    test(`refuses to submit and calls no adapter when ${label}`, async () => {
      restoreConfig = installSSConfig(overrides);
      stubFetch();

      await expect(createSSOrder(VALID_ORDER)).rejects.toThrow(SSOrderConfigError);

      // The requirement is zero supplier calls, not merely a rejection.
      expect(fetchCalls).toHaveLength(0);
    });
  }

  test('blocks before reading credentials, so it fails the same way without them', async () => {
    restoreConfig = installSSConfig({ mode: undefined });
    delete process.env.SS_ACTIVEWEAR_USERNAME;
    delete process.env.SS_ACTIVEWEAR_PASSWORD;
    stubFetch();

    await expect(createSSOrder(VALID_ORDER)).rejects.toThrow(SSOrderConfigError);
    expect(fetchCalls).toHaveLength(0);
  });
});

test.describe('createSSOrder — a valid configuration genuinely submits', () => {
  test('test mode sends testOrder true and the configured operating values', async () => {
    restoreConfig = installSSConfig({ mode: 'test' });

    let sentBody;
    globalThis.fetch = async (url, init) => {
      sentBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ orderNumber: 'SS-1' }),
        headers: { get: () => null },
      };
    };

    await createSSOrder(VALID_ORDER);

    expect(sentBody.testOrder).toBe(true);
    expect(sentBody.shippingMethod).toBe(54);
    expect(sentBody.emailConfirmation).toBe('orders@example.test,owner@example.test');
    expect(sentBody.shippingAddress).toMatchObject({ city: 'South Sioux City', zip: '68776' });
  });

  test('live mode sends testOrder false — set by SS_ORDER_MODE, not by a literal', async () => {
    restoreConfig = installSSConfig({ mode: 'live' });

    let sentBody;
    globalThis.fetch = async (url, init) => {
      sentBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ orderNumber: 'SS-2' }),
        headers: { get: () => null },
      };
    };

    await createSSOrder(VALID_ORDER);
    expect(sentBody.testOrder).toBe(false);
  });
});

test.describe('reads stay available while configuration is invalid', () => {
  test('getSSOrdersByPO still reaches the supplier with no order configuration', async () => {
    restoreConfig = installSSConfig(
      Object.fromEntries(Object.keys(VALID_SS_CONFIG).map((k) => [k, undefined])),
    );
    fetchCalls = [];
    globalThis.fetch = async (url, init) => {
      fetchCalls.push({ url: String(url), method: init?.method ?? 'GET' });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => [{ orderNumber: 'SS-999', poNumber: '1234' }],
        headers: { get: () => null },
      };
    };

    const { orders } = await getSSOrdersByPO('1234');

    // Reconciliation must not be collateral damage of a configuration error.
    expect(orders).toHaveLength(1);
    expect(fetchCalls).toHaveLength(1);
  });
});

test.describe('getSSOrderPreflight — the audited preflight result (AC3)', () => {
  test('reports wouldSubmit false when the configuration is invalid', () => {
    restoreConfig = installSSConfig({ mode: undefined });
    const preflight = getSSOrderPreflight();
    expect(preflight.wouldSubmit).toBe(false);
    expect(preflight.configuration.ok).toBe(false);
  });

  test('reports wouldSubmit false when the kill switch is closed', () => {
    restoreConfig = installSSConfig();
    process.env[SS_ORDERING_ENV_VAR] = 'false';
    const preflight = getSSOrderPreflight();
    expect(preflight.wouldSubmit).toBe(false);
    expect(preflight.killSwitch.allowed).toBe(false);
  });

  test('makes test-versus-live explicit when everything is open', () => {
    restoreConfig = installSSConfig({ mode: 'live' });
    const preflight = getSSOrderPreflight();
    expect(preflight.wouldSubmit).toBe(true);
    expect(preflight.configuration.summary.mode).toBe('live');
    expect(preflight.configuration.summary.testOrder).toBe(false);
  });
});
