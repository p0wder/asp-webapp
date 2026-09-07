import { test, expect } from '@playwright/test';
import { decideFromReceipt, RECEIPT_STATUS } from '../../lib/webhookReceipts.js';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * TG-001-05 — Stripe webhook receipts.
 *
 * ── Scope of this suite ──────────────────────────────────────────────────
 * TG-001-05 depends on TG-003-03 (a durable datastore), which does not exist
 * — variance V1. These tests cover the part that is unblocked: the decision
 * table for duplicate, out-of-order and crash-after-persist deliveries (T1),
 * and the structural properties of the handler that finding F4 identified.
 *
 * They deliberately do NOT assert exactly-once delivery under concurrency.
 * Vercel Blob has no compare-and-swap, so that property does not hold yet, and
 * a test asserting it would be false comfort.
 */

// Playwright runs from the project root, so cwd is the repo root.
const REPO_ROOT = process.cwd();
const WEBHOOK_SOURCE = readFileSync(
  join(REPO_ROOT, 'app', 'api', 'stripe-webhook', 'route.js'),
  'utf8',
);

test.describe('receipt decision table (T1)', () => {
  test('a first delivery applies', () => {
    expect(decideFromReceipt(null)).toMatchObject({ action: 'apply', reason: 'first-delivery' });
  });

  test('a duplicate of an applied event is skipped', () => {
    const decision = decideFromReceipt({ status: RECEIPT_STATUS.APPLIED });
    expect(decision.action).toBe('skip');
  });

  test('a crash after persistence resumes rather than skipping (AC3)', () => {
    // Intent was recorded but no terminal state followed, so whether the
    // effect landed is genuinely unknown. Skipping would drop a real payment;
    // resuming risks a duplicate that Printavo can be reconciled against.
    const decision = decideFromReceipt({ status: RECEIPT_STATUS.RECEIVED });
    expect(decision).toMatchObject({ action: 'resume', reason: 'crash-after-persist' });
  });

  test('a previously failed attempt is retried', () => {
    const decision = decideFromReceipt({ status: RECEIPT_STATUS.FAILED });
    expect(decision.action).toBe('apply');
  });

  test('an out-of-order delivery of a different event is unaffected', () => {
    // Receipts are keyed per event ID, so ordering between distinct events
    // carries no state. This documents that the decision is per-event.
    expect(decideFromReceipt(null).action).toBe('apply');
    expect(decideFromReceipt({ status: RECEIPT_STATUS.APPLIED }).action).toBe('skip');
  });

  test('an unrecognised status applies rather than silently skipping', () => {
    // Fail toward recording the payment: an unrecorded collected payment is a
    // worse outcome than a duplicate that reconciliation can find.
    expect(decideFromReceipt({ status: 'weird' }).action).toBe('apply');
  });
});

test.describe('handler structure — finding F4 and variance V9', () => {
  test('the Printavo mutation is no longer written inline in the route', () => {
    // The handler must not build GraphQL itself; the historical `paymentCreate`
    // mutation now lives in lib/printavo.js. Matched on the call shape rather
    // than the mutation name, which the file still mentions in a comment
    // explaining what moved.
    expect(WEBHOOK_SOURCE).not.toMatch(/\bgql\s*\(/);
    expect(WEBHOOK_SOURCE).not.toContain('mutation RecordPayment');
    expect(WEBHOOK_SOURCE).toContain("from '@/lib/printavo'");
    expect(WEBHOOK_SOURCE).toContain('recordInvoicePayment');
  });

  test('a failed Printavo write no longer returns 200', () => {
    // The exact defect in F4: "log but still return 200 so Stripe doesn't
    // retry", which threw collected payments away.
    expect(WEBHOOK_SOURCE).not.toContain("so Stripe doesn't retry");
    expect(WEBHOOK_SOURCE).toContain("{ status: 500 }");
  });

  test('an invalid signature is rejected before any receipt or effect (AC1)', () => {
    const signatureIndex = WEBHOOK_SOURCE.indexOf('Invalid signature');
    const receiptIndex = WEBHOOK_SOURCE.indexOf('readReceipt(event.id)');
    const mutationIndex = WEBHOOK_SOURCE.indexOf('recordInvoicePayment({');

    expect(signatureIndex).toBeGreaterThan(-1);
    expect(signatureIndex).toBeLessThan(receiptIndex);
    expect(signatureIndex).toBeLessThan(mutationIndex);
  });

  test('durable intent is written before the business effect', () => {
    const intentIndex = WEBHOOK_SOURCE.indexOf('RECEIPT_STATUS.RECEIVED');
    const mutationIndex = WEBHOOK_SOURCE.indexOf('recordInvoicePayment({');
    expect(intentIndex).toBeGreaterThan(-1);
    expect(intentIndex).toBeLessThan(mutationIndex);
  });

  test('an unreachable receipt store fails closed rather than applying blind', () => {
    expect(WEBHOOK_SOURCE).toContain('Receipt store unavailable');
  });

  test('the remaining concurrency gap is documented, not implied to be closed', () => {
    const moduleSource = readFileSync(join(REPO_ROOT, 'lib', 'webhookReceipts.js'), 'utf8');
    expect(moduleSource).toContain('TG-003-03');
    expect(moduleSource).toContain('compare-and-swap');
  });
});
