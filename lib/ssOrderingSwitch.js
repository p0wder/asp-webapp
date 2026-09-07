/**
 * Environment adapter for the S&S Activewear live-ordering kill switch
 * (TG-001-02).
 *
 * This module reads `process.env`; the gate logic it delegates to is pure and
 * lives in `lib/ssOrderingGate.js` (Constitution Principle IV — an I/O module
 * may import a pure module, never the reverse).
 *
 * NOTE FOR DEPLOYERS: the switch is fail-closed, so `SS_ORDERING_ENABLED` must
 * be set to "true" in the environment or live ordering stops. See the
 * "S&S Ordering Kill Switch" section in README.md.
 */

import {
  evaluateSSOrderingGate,
  SSOrderingDisabledError,
  SS_LIVE_ORDERS_CODE_GATE,
} from './ssOrderingGate.js';

/** Environment variable holding the owner-operated runtime switch. */
export const SS_ORDERING_ENV_VAR = 'SS_ORDERING_ENABLED';

/**
 * Read the effective switch state from the environment.
 *
 * Reads at call time, never at module load, so an environment change takes
 * effect on the next request without a rebuild.
 *
 * @returns {{ allowed: boolean, reason: string|null }}
 */
export function getSSOrderingState() {
  return evaluateSSOrderingGate({
    envValue: process.env[SS_ORDERING_ENV_VAR],
    codeGate: SS_LIVE_ORDERS_CODE_GATE,
  });
}

/**
 * Throw unless live S&S ordering is currently permitted.
 *
 * Callers must invoke this before building a request body or reading
 * credentials, so that a disabled switch results in zero supplier calls.
 *
 * @throws {SSOrderingDisabledError}
 */
export function assertSSOrderingEnabled() {
  const state = getSSOrderingState();
  if (!state.allowed) {
    // Audit trail: records the block and why. Carries no credentials,
    // customer data, payment profile or vendor payload.
    console.warn('[ssOrderingSwitch] BLOCKED S&S submission', {
      reason: state.reason,
      codeGate: SS_LIVE_ORDERS_CODE_GATE,
      envVar: SS_ORDERING_ENV_VAR,
      envConfigured: process.env[SS_ORDERING_ENV_VAR] !== undefined,
    });
    throw new SSOrderingDisabledError(state.reason);
  }
}
