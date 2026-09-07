import { test, expect } from '@playwright/test';
import {
  redact,
  maskEmail,
  maskUrl,
  maskAddress,
  summarizePayload,
  fingerprint,
  REDACTED,
} from '../../lib/logRedaction.js';
import { safeErrorMessage, newCorrelationId, describeResponse } from '../../lib/mutationLog.js';

/**
 * TG-001-08 — redaction and correlation.
 *
 * T1 asks for snapshot/redaction tests over representative S&S, Stripe,
 * Printavo and file payloads. Each fixture below is shaped like the payload
 * the corresponding adapter actually handled before this change, when whole
 * bodies were `JSON.stringify`-ed into the log stream.
 */

/** Representative S&S order request body (see finding F1). */
const SS_ORDER_PAYLOAD = {
  testOrder: false,
  autoselectWarehouse: true,
  emailConfirmation: 'aspmerch@example.test,owner@example.test',
  shippingMethod: 54,
  shippingAddress: {
    customer: 'Americana Screen Printing',
    attn: 'Terry',
    address: '209 E 29th St',
    city: 'South Sioux City',
    state: 'NE',
    zip: '68776',
    country: 'US',
  },
  lines: [{ identifier: 'G500-S-WHITE', qty: 12 }],
  poNumber: 'INV-1042',
  paymentProfile: { profileID: 'pp_9f31c2', email: 'aspmerch@example.test' },
};

/** Representative Stripe checkout session. */
const STRIPE_SESSION_PAYLOAD = {
  id: 'cs_test_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
  amount_total: 41848,
  customer_email: 'customer@example.test',
  metadata: { invoiceId: 'inv_1', correlationId: 'm_abc123' },
  payment_intent: 'pi_3QabcdefghijklmnopqrstuV',
};

/** Representative Printavo customer-creation input. */
const PRINTAVO_CUSTOMER_PAYLOAD = {
  companyName: 'Acme Co',
  primaryContact: { firstName: 'Sam', lastName: 'Doe', email: ['sam@example.test'], phone: '555-0100' },
  billingAddress: { address1: '99 Elm St', city: 'Omaha', state: 'NE', zip: '68101', country: 'US' },
};

/** Representative signed customer file link. */
const FILE_PAYLOAD = {
  proofUrl: 'https://blob.example.test/proofs/invoice-1.png',
  approvalLink: 'https://app.example.test/proof?id=inv_1&token=4f2c9ab7e1d3',
  filename: 'logo-final.png',
};

/** Every secret-ish literal that must never survive redaction. */
const FORBIDDEN_LITERALS = [
  'pp_9f31c2',
  'aspmerch@example.test',
  'customer@example.test',
  'sam@example.test',
  '209 E 29th St',
  '99 Elm St',
  '4f2c9ab7e1d3',
];

function serialize(value) {
  return JSON.stringify(redact(value));
}

test.describe('redaction snapshots (T1, AC1)', () => {
  for (const [label, payload] of [
    ['S&S order request', SS_ORDER_PAYLOAD],
    ['Stripe checkout session', STRIPE_SESSION_PAYLOAD],
    ['Printavo customer input', PRINTAVO_CUSTOMER_PAYLOAD],
    ['customer file links', FILE_PAYLOAD],
  ]) {
    test(`${label} carries no secret, token, payment profile, address or signed link`, () => {
      const output = serialize(payload);
      for (const forbidden of FORBIDDEN_LITERALS) {
        expect(output).not.toContain(forbidden);
      }
    });
  }

  test('payment profiles are removed entirely, not merely masked', () => {
    expect(redact(SS_ORDER_PAYLOAD).paymentProfile).toBe(REDACTED);
  });

  test('an address object keeps locality but loses the street line', () => {
    const out = redact(SS_ORDER_PAYLOAD).shippingAddress;
    expect(out).toEqual({ city: 'South Sioux City', state: 'NE', country: 'US', zipPrefix: '687…' });
  });

  test('a bare street string is redacted rather than reduced', () => {
    expect(redact({ address: '1 Main St' }).address).toBe(REDACTED);
  });

  test('emailAddress-style keys are masked as emails, not swallowed as addresses', () => {
    // Substring matching on "address" would wrongly capture these; the address
    // rule matches exact key names for exactly this reason.
    expect(redact({ emailAddress: 'a@b.test' }).emailAddress).toContain('«email:b.test');
    expect(redact({ ipAddress: '1.2.3.4' }).ipAddress).toBe('1.2.3.4');
  });

  test('operationally useful fields survive redaction', () => {
    const out = redact(SS_ORDER_PAYLOAD);
    // A log with nothing left in it is not an audit trail.
    expect(out.poNumber).toBe('INV-1042');
    expect(out.shippingMethod).toBe(54);
    expect(out.testOrder).toBe(false);
    expect(out.lines).toEqual([{ identifier: 'G500-S-WHITE', qty: 12 }]);
  });

  test('a boolean survives a sensitive-looking key name', () => {
    // `hasPaymentProfile` flattens to a string containing "paymentprofile", so
    // key-name matching would redact it. A boolean cannot disclose a value,
    // and this one is exactly the signal an operator needs.
    const out = redact({ hasPaymentProfile: true, hasToken: false, paymentProfile: { id: 'x' } });
    expect(out.hasPaymentProfile).toBe(true);
    expect(out.hasToken).toBe(false);
    expect(out.paymentProfile).toBe(REDACTED);
  });

  test('masking an address twice does not lose the locality', () => {
    // A caller that pre-masks and then logs would otherwise drop zipPrefix,
    // because the masked shape has no `zip` for the second pass to read.
    const once = maskAddress({ city: 'X', state: 'NE', zip: '68776', country: 'US' });
    expect(maskAddress(once)).toEqual(once);
    expect(redact({ shipTo: once }).shipTo).toEqual(once);
  });

  test('nested secrets are caught at depth, not only at the top level', () => {
    const out = redact({ a: { b: { c: { apiKey: 'sk_live_x', note: 'keep' } } } });
    expect(out.a.b.c.apiKey).toBe(REDACTED);
    expect(out.a.b.c.note).toBe('keep');
  });

  test('redaction terminates on a self-referencing object', () => {
    const cyclic = { name: 'root' };
    cyclic.self = cyclic;
    expect(() => redact(cyclic)).not.toThrow();
  });
});

test.describe('maskers', () => {
  test('maskEmail keeps the domain and a stable correlation tag', () => {
    const masked = maskEmail('Terry@Example.Test');
    expect(masked).toContain('example.test');
    expect(masked).not.toContain('Terry');
    // Same address, same tag — that is what makes correlation possible.
    expect(maskEmail('terry@example.test')).toBe(masked);
    expect(maskEmail('someone@example.test')).not.toBe(masked);
  });

  test('maskUrl strips the query string that carries signed tokens', () => {
    expect(maskUrl('https://app.test/proof?id=1&token=secret')).toBe(
      'https://app.test/proof?«stripped»',
    );
    expect(maskUrl('/proof?id=1&token=secret')).toBe('/proof?«stripped»');
    expect(maskUrl('https://app.test/proof')).toBe('https://app.test/proof');
  });

  test('maskAddress returns null for a non-object rather than throwing', () => {
    expect(maskAddress(null)).toBeNull();
    expect(maskAddress('1 Main St')).toBeNull();
  });

  test('fingerprint is stable and does not contain the input', () => {
    expect(fingerprint('abc')).toBe(fingerprint('abc'));
    expect(fingerprint('abc')).not.toContain('abc');
  });

  test('summarizePayload describes shape and size without the contents', () => {
    const summary = summarizePayload(SS_ORDER_PAYLOAD);
    expect(summary.type).toBe('object');
    expect(summary.keys).toContain('poNumber');
    expect(summary.byteLength).toBeGreaterThan(0);
    expect(JSON.stringify(summary)).not.toContain('pp_9f31c2');
  });
});

test.describe('safeErrorMessage — vendor errors embed payloads', () => {
  test('scrubs emails, credentials and long opaque tokens', () => {
    // Assembled at runtime and deliberately not shaped like any real vendor's
    // key format: a literal that looks like one trips secret scanners on the
    // way into the repository, and the rule under test is provider-agnostic
    // anyway — it matches any long opaque run.
    const basicCredential = ['YWJjOmRlZmdoaWpr', 'bG1ub3BxcnN0dXZ3'].join('');
    const opaqueToken = ['EXAMPLE', 'NOT', 'A', 'REAL', 'KEY', '0123456789abcdef'].join('_');

    const message = safeErrorMessage(
      new Error(`Order failed for terry@example.test using Basic ${basicCredential} key ${opaqueToken}`),
    );

    expect(message).not.toContain('terry@example.test');
    expect(message).not.toContain(basicCredential);
    expect(message).not.toContain(opaqueToken);
    expect(message).toContain('«email»');
  });

  test('truncates a message that embeds a whole response body', () => {
    // Word-shaped filler, not one long run: a single 5000-character token is
    // caught by the opaque-token rule and replaced, which would not exercise
    // the length cap this test is about.
    const message = safeErrorMessage(new Error(`S&S rejected the order: ${'field invalid; '.repeat(400)}`));
    expect(message.length).toBeLessThan(400);
    expect(message).toContain('«truncated»');
  });

  test('handles a null or string error without throwing', () => {
    expect(safeErrorMessage(null)).toBeNull();
    expect(safeErrorMessage('plain failure')).toBe('plain failure');
  });
});

test.describe('correlation (AC2)', () => {
  test('correlation IDs are unique and prefixed for log search', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newCorrelationId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id.startsWith('m_')).toBe(true);
  });

  test('describeResponse records status and shape, never the body', () => {
    const described = describeResponse(422, STRIPE_SESSION_PAYLOAD);
    expect(described.httpStatus).toBe(422);
    expect(described.response.type).toBe('object');
    expect(JSON.stringify(described)).not.toContain('customer@example.test');
  });
});
