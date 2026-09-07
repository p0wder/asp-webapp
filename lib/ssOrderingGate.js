/**
 * Pure gate logic for the S&S Activewear live-ordering kill switch (TG-001-02).
 *
 * No environment access, no I/O (Constitution Principle IV). The environment
 * adapter lives in `lib/ssOrderingSwitch.js`, which imports this module.
 *
 * ── Two independent gates ────────────────────────────────────────────────
 * A live supplier order requires BOTH gates to be affirmatively open:
 *
 *   1. `SS_LIVE_ORDERS_CODE_GATE` below — an in-code constant. Closing it is
 *      an explicit, diff-reviewable code edit. This is the Principle VI gate:
 *      a runtime flag must never be the sole control on a real-world
 *      commitment.
 *   2. `SS_ORDERING_ENABLED` in the environment — the owner's immediate stop,
 *      set in Vercel project settings so only someone with project access can
 *      flip it (the "owner-only" requirement in TG-001-02).
 *
 * Either gate alone stops ordering. Neither alone permits it.
 *
 * ── Fail-closed ──────────────────────────────────────────────────────────
 * Only the exact (trimmed, case-insensitive) string "true" opens the runtime
 * gate. Missing, empty or unrecognised values block. Ambiguity never resolves
 * toward placing a real order.
 */

/**
 * In-code gate (Constitution Principle VI).
 *
 * `true` reflects the deliberate go-live in commit 54d35c9 ("Go live: flip
 * createSSOrder testOrder to false"). Set to `false` to hard-disable live S&S
 * ordering in a way that cannot be re-enabled by an environment change alone.
 */
export const SS_LIVE_ORDERS_CODE_GATE = true;

/**
 * Stable machine-readable reasons. The HTTP response shape stays constant
 * across all of them; these only distinguish *why* for operators and logs.
 */
export const SS_ORDERING_BLOCK_REASONS = {
  CODE_GATE_CLOSED: 'CODE_GATE_CLOSED',
  CONFIG_MISSING: 'CONFIG_MISSING',
  CONFIG_INVALID: 'CONFIG_INVALID',
  DISABLED_BY_OWNER: 'DISABLED_BY_OWNER',
};

/** Thrown by the adapter when a submission is attempted while disabled. */
export class SSOrderingDisabledError extends Error {
  constructor(reason) {
    super(`S&S live ordering is disabled (${reason}). No supplier call was made.`);
    this.name = 'SSOrderingDisabledError';
    this.code = 'SS_ORDERING_DISABLED';
    this.reason = reason;
  }
}

/**
 * Evaluate both gates.
 *
 * @param {Object} params
 * @param {string|undefined|null} params.envValue Raw `SS_ORDERING_ENABLED` value.
 * @param {boolean} params.codeGate               The in-code gate.
 * @returns {{ allowed: boolean, reason: string|null }}
 */
export function evaluateSSOrderingGate({ envValue, codeGate }) {
  if (codeGate !== true) {
    return { allowed: false, reason: SS_ORDERING_BLOCK_REASONS.CODE_GATE_CLOSED };
  }

  if (envValue === undefined || envValue === null || String(envValue).trim() === '') {
    return { allowed: false, reason: SS_ORDERING_BLOCK_REASONS.CONFIG_MISSING };
  }

  const normalized = String(envValue).trim().toLowerCase();

  if (normalized === 'true') {
    return { allowed: true, reason: null };
  }

  if (normalized === 'false') {
    return { allowed: false, reason: SS_ORDERING_BLOCK_REASONS.DISABLED_BY_OWNER };
  }

  // Anything else is a misconfiguration; fail closed rather than guess.
  return { allowed: false, reason: SS_ORDERING_BLOCK_REASONS.CONFIG_INVALID };
}
