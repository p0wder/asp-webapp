/**
 * Structured, redacted logging for external mutations (TG-001-08).
 *
 * I/O adapter — writes to `console`. The masking logic it uses is pure and
 * lives in `lib/logRedaction.js` (Constitution Principle IV).
 *
 * ── The contract this replaces ───────────────────────────────────────────
 * Constitution Principle V requires that every call mutating external state
 * be logged, because Vercel's log stream is this project's only audit trail.
 * It previously did that by dumping raw payloads. This module keeps the audit
 * property while removing the disclosure: every mutation emits an `attempt`
 * line before the call and exactly one `success`, `failure` or `blocked` line
 * after, all sharing a correlation ID.
 *
 * ── Tracing a failed mutation (TG-001-08 AC2) ────────────────────────────
 * Every line is prefixed `[mutation]` and carries `cid`. To follow one
 * customer action end to end, search the Vercel logs for its correlation ID:
 *
 *     [mutation] {"cid":"m_8f2c1a…","system":"ss","operation":"createOrder",
 *                 "phase":"attempt","lineCount":3,"poNumber":"INV-1042"}
 *     [mutation] {"cid":"m_8f2c1a…","system":"ss","operation":"createOrder",
 *                 "phase":"failure","httpStatus":422,"error":"…"}
 *
 * The correlation ID is generated at the top of the request that starts the
 * mutation and passed down, so the route line and the adapter lines match.
 */

import { redact, summarizePayload } from './logRedaction.js';

/** Recognised lifecycle phases for a mutation. */
export const PHASES = Object.freeze({
  ATTEMPT: 'attempt',
  SUCCESS: 'success',
  FAILURE: 'failure',
  BLOCKED: 'blocked',
});

/** Longest error message retained; vendor errors can embed whole payloads. */
const MAX_ERROR_CHARS = 300;

/**
 * Generate a correlation ID for one user action.
 *
 * @returns {string} e.g. `m_3f8c21ab4d7e`
 */
export function newCorrelationId() {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
  return `m_${uuid.replace(/-/g, '').slice(0, 12)}`;
}

/**
 * Reduce an error to a log-safe message.
 *
 * Vendor SDKs routinely put the whole response body in `err.message`, which
 * is exactly the raw-payload disclosure this issue removes — so the message
 * is scrubbed of email addresses and long opaque tokens, then truncated.
 *
 * @param {unknown} err
 * @returns {string|null}
 */
export function safeErrorMessage(err) {
  if (err === null || err === undefined) return null;
  const raw = typeof err === 'string' ? err : err?.message || String(err);
  const scrubbed = raw
    // Email addresses.
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '«email»')
    // Bearer/basic credentials and long opaque tokens (JWTs, API keys).
    .replace(/\b(?:Bearer|Basic)\s+[\w.\-+/=]+/gi, '«credential»')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '«token»');
  return scrubbed.length > MAX_ERROR_CHARS
    ? `${scrubbed.slice(0, MAX_ERROR_CHARS)}…«truncated»`
    : scrubbed;
}

/**
 * Emit one structured mutation log line.
 *
 * All `fields` pass through `redact()`, so a caller that includes a nested
 * token by accident still cannot leak it — the allowlist and the masker are
 * two independent controls, not one.
 *
 * @param {object} entry
 * @param {string} entry.correlationId  Shared across every line of one action.
 * @param {string} entry.system         `ss` | `stripe` | `printavo` | `blob` | `clerk`.
 * @param {string} entry.operation      e.g. `createOrder`, `recordPayment`.
 * @param {string} entry.phase          One of `PHASES`.
 * @param {unknown} [entry.error]       Present on `failure`.
 * @param {object} [entry.fields]       Allowlisted, non-sensitive detail.
 */
export function logMutation({ correlationId, system, operation, phase, error, fields = {} }) {
  const line = {
    cid: correlationId ?? null,
    system,
    operation,
    phase,
    ...redact(fields),
  };

  if (error !== undefined) line.error = safeErrorMessage(error);

  const serialized = JSON.stringify(line);
  if (phase === PHASES.FAILURE) {
    console.error('[mutation]', serialized);
  } else if (phase === PHASES.BLOCKED) {
    console.warn('[mutation]', serialized);
  } else {
    console.log('[mutation]', serialized);
  }
}

/**
 * Describe an external response without reproducing it.
 * Use in place of `JSON.stringify(responseBody)`.
 *
 * @param {number|null} httpStatus
 * @param {unknown} body
 * @returns {object}
 */
export function describeResponse(httpStatus, body) {
  return { httpStatus: httpStatus ?? null, response: summarizePayload(body) };
}
