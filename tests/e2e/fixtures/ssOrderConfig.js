/**
 * Shared S&S order-configuration fixture (TG-001-10).
 *
 * Not a spec file — Playwright's default `testMatch` only collects
 * `*.spec.js` / `*.test.js`, so this is never run as a test.
 *
 * The configuration is fail-closed with no defaults, so any test that expects
 * `createSSOrder` to reach the supplier must install a valid one first.
 */

import { SS_ORDER_CONFIG_ENV_VARS } from '../../../lib/ssOrderConfigEnv.js';

/** A complete, valid configuration in test mode. */
export const VALID_SS_CONFIG = Object.freeze({
  mode: 'test',
  accountEmail: 'orders@example.test',
  confirmationEmails: 'orders@example.test,owner@example.test',
  shippingMethod: '54',
  shipToCustomer: 'Americana Screen Printing',
  shipToAttn: 'Terry',
  shipToAddress: '209 E 29th St',
  shipToCity: 'South Sioux City',
  shipToState: 'NE',
  shipToZip: '68776',
  shipToCountry: 'US',
});

/**
 * Write a configuration into `process.env` and return a restore function.
 *
 * @param {object} [overrides] Field values to change; `undefined` unsets one.
 * @returns {() => void} Restores every touched variable to its prior value.
 */
export function installSSConfig(overrides = {}) {
  const merged = { ...VALID_SS_CONFIG, ...overrides };
  const previous = {};

  for (const [field, envVar] of Object.entries(SS_ORDER_CONFIG_ENV_VARS)) {
    previous[envVar] = process.env[envVar];
    const value = merged[field];
    if (value === undefined) delete process.env[envVar];
    else process.env[envVar] = value;
  }

  return () => {
    for (const [envVar, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[envVar];
      else process.env[envVar] = value;
    }
  };
}
