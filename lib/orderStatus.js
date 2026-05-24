/**
 * Pure module for generating and verifying HMAC tokens that gate access to
 * customer-facing order status, proof, and payment pages.
 *
 * No I/O — callers read process.env and pass the secret in (Principle IV).
 *
 * Token format: 64-char lowercase hex (sha256 HMAC of the invoiceId string).
 * Tokens do not expire — the invoiceId itself scopes them to a single order.
 */

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Generate a status/proof access token for a given invoice ID.
 *
 * @param {string|number} invoiceId — Printavo node ID
 * @param {string} secret           — STATUS_TOKEN_SECRET env var value
 * @returns {string}                — 64-char hex token
 */
export function generateStatusToken(invoiceId, secret) {
  if (!invoiceId || !secret) throw new Error('invoiceId and secret are required');
  return createHmac('sha256', secret).update(String(invoiceId)).digest('hex');
}

/**
 * Verify a token against an invoice ID using a constant-time comparison.
 * Returns false for any invalid input rather than throwing.
 *
 * @param {string|number} invoiceId
 * @param {string} token
 * @param {string} secret
 * @returns {boolean}
 */
export function generateProofToken(invoiceId, secret) {
  if (!invoiceId || !secret) throw new Error('invoiceId and secret are required');
  return createHmac('sha256', secret).update(`proof:${String(invoiceId)}`).digest('hex');
}

export function verifyProofToken(invoiceId, token, secret) {
  if (!invoiceId || !token || !secret) return false;
  try {
    const expected = generateProofToken(invoiceId, secret);
    if (token.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function verifyStatusToken(invoiceId, token, secret) {
  if (!invoiceId || !token || !secret) return false;
  try {
    const expected = generateStatusToken(invoiceId, secret);
    // Both sha256 hex digests are 64 chars / 32 bytes — safe to compare lengths first
    if (token.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
