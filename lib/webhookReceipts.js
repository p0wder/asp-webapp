/**
 * Durable receipts for inbound Stripe webhook events (TG-001-05, partial).
 *
 * ── Read this before relying on it ───────────────────────────────────────
 * TG-001-05 is a Wave 1 issue whose stated dependency is a real datastore
 * (TG-003-03). The TG-001-01 audit recorded, as variance V1, that no
 * relational database exists in this project and that Vercel Blob is **not a
 * safe substitute**, because a whole-document read/modify/write has no
 * compare-and-swap: two concurrent writers can both observe "absent" and both
 * proceed.
 *
 * That constraint has not changed, so this module does **not** claim to
 * satisfy AC2 ("one terminal record and one business effect") in the presence
 * of concurrent delivery. What it does provide, all of which is unblocked
 * today and all of which is strictly better than the previous behaviour of
 * nothing at all:
 *
 *   • A durable intent record written *before* the Printavo call, so an event
 *     that crashes mid-apply leaves evidence instead of silence.
 *   • Deduplication against sequential redelivery — which is the shape Stripe
 *     retries actually take (spaced by minutes), and the shape that caused the
 *     double-recording risk in finding F4.
 *   • A terminal `applied` / `failed` state per event, so a failed apply is
 *     visible and replayable rather than being swallowed by a 200.
 *
 * The residual gap is a genuine race between two *simultaneous* deliveries of
 * the same event. Closing it needs a conditional write, which needs
 * TG-003-03. Until then this is an interim control and is documented as one.
 *
 * I/O module — writes to Vercel Blob. Mirrors `lib/promoCodesStorage.js`.
 */

import { put, head } from '@vercel/blob';

const RECEIPT_PREFIX = 'stripe-receipts';

/** Terminal and intermediate states a receipt can hold. */
export const RECEIPT_STATUS = Object.freeze({
  /** Intent recorded; the business effect has not been confirmed. */
  RECEIVED: 'received',
  /** The business effect completed. Terminal. */
  APPLIED: 'applied',
  /** The business effect failed. Terminal for this attempt; replayable. */
  FAILED: 'failed',
});

function receiptPath(eventId) {
  return `${RECEIPT_PREFIX}/${eventId}.json`;
}

function isNotFound(err) {
  return (
    err?.name === 'BlobNotFoundError' ||
    err?.code === 'not_found' ||
    /not found|does not exist/i.test(err?.message || '')
  );
}

/**
 * Read the receipt for an event.
 *
 * @param {string} eventId Stripe event ID.
 * @returns {Promise<object|null>} The receipt, or null when none exists.
 * @throws when the store itself is unreachable — callers must fail closed
 *   rather than treat an unreadable store as "no receipt".
 */
export async function readReceipt(eventId) {
  let meta;
  try {
    meta = await head(receiptPath(eventId));
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
  if (!meta?.url) return null;

  const res = await fetch(meta.url, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Receipt fetch HTTP ${res.status} for ${eventId}`);
  return res.json();
}

/**
 * Write (or overwrite) the receipt for an event.
 *
 * Overwrite rather than append: the receipt is the current state of one
 * event's processing, and its history is the log lines that share the
 * correlation ID.
 *
 * @param {string} eventId
 * @param {object} record
 * @returns {Promise<object>} The record as written.
 */
export async function writeReceipt(eventId, record) {
  const payload = { eventId, updatedAt: new Date().toISOString(), ...record };
  await put(receiptPath(eventId), JSON.stringify(payload), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return payload;
}

/**
 * Decide what to do with an event given its existing receipt.
 *
 * Pure, so the decision table is testable without a blob store.
 *
 * @param {object|null} receipt
 * @returns {{ action: 'apply'|'skip'|'resume', reason: string }}
 */
export function decideFromReceipt(receipt) {
  if (!receipt) return { action: 'apply', reason: 'first-delivery' };

  if (receipt.status === RECEIPT_STATUS.APPLIED) {
    return { action: 'skip', reason: 'already-applied' };
  }

  if (receipt.status === RECEIPT_STATUS.RECEIVED) {
    // Intent was recorded but no terminal state followed: the previous attempt
    // died between the write and the effect. Whether the effect landed is
    // genuinely unknown, so this resumes rather than skipping — Stripe will
    // keep retrying otherwise, and an unrecorded payment is the worse outcome.
    return { action: 'resume', reason: 'crash-after-persist' };
  }

  return { action: 'apply', reason: 'previous-attempt-failed' };
}
