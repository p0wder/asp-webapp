/**
 * Environment adapter for the S&S Activewear order operating configuration
 * (TG-001-10).
 *
 * Reads `process.env` and delegates all validation to the pure
 * `lib/ssOrderConfig.js` (Constitution Principle IV — an I/O module may
 * import a pure module, never the reverse).
 *
 * NOTE FOR DEPLOYERS: this configuration is fail-closed and has no defaults.
 * Every variable below must be set in Vercel or S&S order submission stops.
 * See "S&S Order Configuration" in README.md for the full list and values.
 */

import { parseSSOrderConfig, SSOrderConfigError, summarizeSSOrderConfig } from './ssOrderConfig.js';

/**
 * Environment variable names, exported so tests and documentation cannot
 * drift from the reader.
 */
export const SS_ORDER_CONFIG_ENV_VARS = Object.freeze({
  mode: 'SS_ORDER_MODE',
  accountEmail: 'SS_ACTIVEWEAR_ACCOUNT_EMAIL',
  confirmationEmails: 'SS_ORDER_CONFIRMATION_EMAILS',
  shippingMethod: 'SS_ORDER_SHIPPING_METHOD',
  shipToCustomer: 'SS_SHIP_TO_CUSTOMER',
  shipToAttn: 'SS_SHIP_TO_ATTN',
  shipToAddress: 'SS_SHIP_TO_ADDRESS',
  shipToCity: 'SS_SHIP_TO_CITY',
  shipToState: 'SS_SHIP_TO_STATE',
  shipToZip: 'SS_SHIP_TO_ZIP',
  shipToCountry: 'SS_SHIP_TO_COUNTRY',
});

/**
 * Read and validate the configuration from the environment.
 *
 * Reads at call time, never at module load, so a corrected value takes effect
 * on the next request rather than at the next cold start.
 *
 * @returns {{ ok: boolean, config: object|null, errors: Array<object> }}
 */
export function loadSSOrderConfig() {
  const raw = {};
  for (const [field, envVar] of Object.entries(SS_ORDER_CONFIG_ENV_VARS)) {
    raw[field] = process.env[envVar];
  }
  return parseSSOrderConfig(raw);
}

/**
 * Return the validated configuration or throw.
 *
 * Callers must invoke this before building a request body, so an invalid
 * configuration produces zero supplier calls (TG-001-10 AC2).
 *
 * @returns {object} The validated configuration.
 * @throws {SSOrderConfigError}
 */
export function requireSSOrderConfig() {
  const result = loadSSOrderConfig();
  if (!result.ok) {
    // Audit trail: which fields are wrong and how — never their values.
    console.warn('[ssOrderConfig] BLOCKED S&S submission — invalid configuration', {
      errors: result.errors.map(({ field, code }) => ({ field, code })),
    });
    throw new SSOrderConfigError(result.errors);
  }
  return result.config;
}

/**
 * A log-safe snapshot of the current configuration state, for the audited
 * preflight record and for operational checks (TG-001-10 AC3).
 *
 * @returns {{ ok: boolean, summary: object, errorFields: string[] }}
 */
export function getSSOrderConfigStatus() {
  const result = loadSSOrderConfig();
  return {
    ok: result.ok,
    summary: summarizeSSOrderConfig(result.config),
    errorFields: result.errors.map((e) => `${e.field}:${e.code}`),
  };
}

export { SSOrderConfigError };
