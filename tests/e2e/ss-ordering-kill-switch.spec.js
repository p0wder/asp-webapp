import { test, expect } from '@playwright/test';
import {
  evaluateSSOrderingGate,
  SSOrderingDisabledError,
  SS_ORDERING_BLOCK_REASONS,
} from '../../lib/ssOrderingGate.js';
import {
  getSSOrderingState,
  assertSSOrderingEnabled,
  SS_ORDERING_ENV_VAR,
} from '../../lib/ssOrderingSwitch.js';
import { createSSOrder, getSSOrdersByPO } from '../../lib/ssActivewear.js';

/**
 * TG-001-02 — live S&S order kill switch.
 *
 * These are Node-level integration tests, not browser tests: they exercise the
 * adapter directly with `fetch` replaced by a counting stub, which is what lets
 * them prove the "zero supplier calls" requirement (T1) rather than merely
 * asserting on an HTTP status.
 *
 * Serial, because they mutate `process.env` and `globalThis.fetch`.
 */
test.describe.configure({ mode: 'serial' });

const REAL_FETCH = globalThis.fetch;
let envBackup;
let fetchCalls;

/** Replace global fetch with a stub that records every call. */
function stubFetch(responder) {
  fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), method: init?.method ?? 'GET' });
    return responder(url, init);
  };
}

function okJsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    headers: { get: () => null },
  };
}

test.beforeEach(() => {
  envBackup = {
    switch: process.env[SS_ORDERING_ENV_VAR],
    user: process.env.SS_ACTIVEWEAR_USERNAME,
    pass: process.env.SS_ACTIVEWEAR_PASSWORD,
  };
  // Credentials are present throughout so that a blocked call can only be
  // explained by the kill switch, never by a missing credential.
  process.env.SS_ACTIVEWEAR_USERNAME = 'test-user';
  process.env.SS_ACTIVEWEAR_PASSWORD = 'test-pass';
  fetchCalls = [];
});

test.afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  for (const [key, value] of [
    [SS_ORDERING_ENV_VAR, envBackup.switch],
    ['SS_ACTIVEWEAR_USERNAME', envBackup.user],
    ['SS_ACTIVEWEAR_PASSWORD', envBackup.pass],
  ]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const VALID_ORDER = {
  lines: [{ identifier: 'G500-S-WHITE', qty: 1 }],
  poNumber: 'TEST-PO',
};

test.describe('SS ordering gate — pure evaluation', () => {
  test('opens only for the exact string "true"', () => {
    expect(evaluateSSOrderingGate({ envValue: 'true', codeGate: true }))
      .toEqual({ allowed: true, reason: null });
    expect(evaluateSSOrderingGate({ envValue: '  TRUE  ', codeGate: true }))
      .toEqual({ allowed: true, reason: null });
  });

  test('fails closed when configuration is missing or empty', () => {
    for (const envValue of [undefined, null, '', '   ']) {
      const result = evaluateSSOrderingGate({ envValue, codeGate: true });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(SS_ORDERING_BLOCK_REASONS.CONFIG_MISSING);
    }
  });

  test('fails closed on unrecognised values rather than guessing', () => {
    for (const envValue of ['yes', '1', 'enabled', 'TRUEISH', 'on']) {
      const result = evaluateSSOrderingGate({ envValue, codeGate: true });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(SS_ORDERING_BLOCK_REASONS.CONFIG_INVALID);
    }
  });

  test('reports an explicit owner disable distinctly', () => {
    const result = evaluateSSOrderingGate({ envValue: 'false', codeGate: true });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(SS_ORDERING_BLOCK_REASONS.DISABLED_BY_OWNER);
  });

  test('the in-code gate overrides an enabling environment value', () => {
    const result = evaluateSSOrderingGate({ envValue: 'true', codeGate: false });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(SS_ORDERING_BLOCK_REASONS.CODE_GATE_CLOSED);
  });

  test('getSSOrderingState reads the environment at call time', () => {
    process.env[SS_ORDERING_ENV_VAR] = 'true';
    expect(getSSOrderingState().allowed).toBe(true);
    process.env[SS_ORDERING_ENV_VAR] = 'false';
    expect(getSSOrderingState().allowed).toBe(false);
    delete process.env[SS_ORDERING_ENV_VAR];
    expect(getSSOrderingState().allowed).toBe(false);
  });

  test('assertSSOrderingEnabled throws a typed error when blocked', () => {
    delete process.env[SS_ORDERING_ENV_VAR];
    let thrown;
    try {
      assertSSOrderingEnabled();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(SSOrderingDisabledError);
    expect(thrown.code).toBe('SS_ORDERING_DISABLED');
    expect(thrown.reason).toBe(SS_ORDERING_BLOCK_REASONS.CONFIG_MISSING);
  });
});

test.describe('createSSOrder — disabled makes zero supplier calls (T1, AC1)', () => {
  for (const [label, envValue] of [
    ['configuration missing', undefined],
    ['explicitly disabled', 'false'],
    ['configuration invalid', 'sure-why-not'],
  ]) {
    test(`refuses to submit and calls no adapter when ${label}`, async () => {
      if (envValue === undefined) delete process.env[SS_ORDERING_ENV_VAR];
      else process.env[SS_ORDERING_ENV_VAR] = envValue;

      stubFetch(() => okJsonResponse({ orderNumber: 'SHOULD-NEVER-HAPPEN' }));

      await expect(createSSOrder(VALID_ORDER)).rejects.toThrow(/disabled/i);

      // The requirement: zero calls to the supplier, not merely a rejection.
      expect(fetchCalls).toHaveLength(0);
    });
  }

  test('blocks before reading credentials, so it fails the same way without them', async () => {
    delete process.env[SS_ORDERING_ENV_VAR];
    delete process.env.SS_ACTIVEWEAR_USERNAME;
    delete process.env.SS_ACTIVEWEAR_PASSWORD;
    stubFetch(() => okJsonResponse({}));

    const error = await createSSOrder(VALID_ORDER).catch((e) => e);

    expect(error).toBeInstanceOf(SSOrderingDisabledError);
    expect(fetchCalls).toHaveLength(0);
  });

  test('blocks even a payload that would otherwise be valid and complete', async () => {
    process.env[SS_ORDERING_ENV_VAR] = 'false';
    stubFetch(() => okJsonResponse({}));

    await expect(
      createSSOrder({
        ...VALID_ORDER,
        shippingAddress: {
          customer: 'Americana Screen Printing',
          address: '209 E 29th St',
          city: 'South Sioux City',
          state: 'NE',
          zip: '68776',
          country: 'US',
        },
        paymentProfileId: 'profile-123',
        comments: 'test',
      }),
    ).rejects.toThrow(SSOrderingDisabledError);

    expect(fetchCalls).toHaveLength(0);
  });
});

test.describe('createSSOrder — the gate genuinely opens', () => {
  test('submits to the supplier when the switch is enabled', async () => {
    process.env[SS_ORDERING_ENV_VAR] = 'true';
    stubFetch(() => okJsonResponse({ orderNumber: 'SS-12345' }));

    const result = await createSSOrder(VALID_ORDER);

    // Guards against a switch that is permanently closed, which would let the
    // blocked-path tests above pass while ordering is silently broken.
    expect(result).toEqual({ orderNumber: 'SS-12345' });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain('/orders/');
    expect(fetchCalls[0].method).toBe('POST');
  });
});

test.describe('read and reconciliation paths stay available while disabled (AC2)', () => {
  test('getSSOrdersByPO still reaches the supplier when ordering is disabled', async () => {
    process.env[SS_ORDERING_ENV_VAR] = 'false';
    stubFetch(() => okJsonResponse([{ orderNumber: 'SS-999', poNumber: '1234' }]));

    const { orders } = await getSSOrdersByPO('1234');

    // Reconciliation must not be collateral damage of the kill switch.
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].method).toBe('GET');
    expect(orders).toHaveLength(1);
  });
});
