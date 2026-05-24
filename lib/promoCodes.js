import { randomUUID } from 'crypto';

/**
 * @typedef {{
 *   id: string,
 *   code: string,
 *   type: 'percent' | 'fixed',
 *   value: number,
 *   expiresAt: string | null,
 *   maxUses: number | null,
 *   useCount: number,
 *   enabled: boolean,
 *   createdAt: string,
 *   restrictedToEmail: string | null,
 * }} PromoCode
 */

/**
 * Build a new PromoCode object. Not persisted — call saveCode() to persist.
 * @param {{ code: string, type: 'percent'|'fixed', value: number, expiresAt?: string|null, maxUses?: number|null, restrictedToEmail?: string|null }} opts
 */
export function createPromoCode({ code, type, value, expiresAt = null, maxUses = null, restrictedToEmail = null }) {
  if (!code || typeof code !== 'string') throw new Error('code is required');
  if (type !== 'percent' && type !== 'fixed') throw new Error('type must be "percent" or "fixed"');
  if (typeof value !== 'number' || value <= 0) throw new Error('value must be a positive number');
  if (type === 'percent' && value > 100) throw new Error('percent discount cannot exceed 100');
  return {
    id: randomUUID(),
    code: code.trim().toUpperCase(),
    type,
    value,
    expiresAt: expiresAt || null,
    maxUses: maxUses ? Number(maxUses) : null,
    useCount: 0,
    enabled: true,
    createdAt: new Date().toISOString(),
    restrictedToEmail: restrictedToEmail ? restrictedToEmail.trim().toLowerCase() : null,
  };
}

/**
 * Returns null when the code is valid and usable, or a string reason when it is not.
 * @param {PromoCode | null} promoCode
 * @param {string} [nowIso]
 * @param {string | null} [email] - customer email; required to redeem restricted codes
 * @returns {string | null}
 */
export function validateCode(promoCode, nowIso = new Date().toISOString(), email = null) {
  if (!promoCode) return 'Code not found';
  if (!promoCode.enabled) return 'Code is disabled';
  if (promoCode.expiresAt && nowIso > promoCode.expiresAt) return 'Code has expired';
  if (promoCode.maxUses !== null && promoCode.useCount >= promoCode.maxUses) {
    return 'Code has reached its usage limit';
  }
  if (promoCode.restrictedToEmail) {
    if (!email || email.trim().toLowerCase() !== promoCode.restrictedToEmail) {
      return 'This code is not valid for your account';
    }
  }
  return null;
}

/**
 * Returns the discount amount in dollars for the given subtotal.
 * @param {PromoCode} promoCode
 * @param {number} subtotal - dollars
 * @returns {number}
 */
export function applyDiscount(promoCode, subtotal) {
  if (promoCode.type === 'percent') {
    return parseFloat(((subtotal * promoCode.value) / 100).toFixed(2));
  }
  return parseFloat(Math.min(promoCode.value, subtotal).toFixed(2));
}

/**
 * Returns a new PromoCode with useCount incremented by 1.
 * @param {PromoCode} promoCode
 * @returns {PromoCode}
 */
export function incrementUse(promoCode) {
  return { ...promoCode, useCount: promoCode.useCount + 1 };
}

/**
 * Human-readable discount label, e.g. "10% off" or "$5.00 off".
 * @param {PromoCode} promoCode
 * @returns {string}
 */
export function discountLabel(promoCode) {
  if (promoCode.type === 'percent') return `${promoCode.value}% off`;
  return `$${promoCode.value.toFixed(2)} off`;
}
