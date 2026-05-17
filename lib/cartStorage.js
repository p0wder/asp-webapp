/**
 * localStorage adapter for the SS Activewear cart.
 *
 * SSR-safe: every function guards `typeof window` so it's a no-op on the server.
 * Cross-tab sync: subscribe() wires the `storage` event filtered to our key.
 *
 * See .specify/specs/001-ssactivewear-cart-ordering/data-model.md.
 */

import { CART_VERSION, emptyCart } from '@/lib/cart';

export const CART_STORAGE_KEY = 'asp.cart.v1';

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

// useSyncExternalStore requires getSnapshot() to return a stable reference between
// calls when the underlying state is unchanged. We cache the parsed cart keyed on the
// raw localStorage string; a new object is only created when the raw value changes.
let cachedRaw = null;
let cachedCart = emptyCart();

function parseRaw(raw) {
  if (!raw) return emptyCart();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== CART_VERSION || !Array.isArray(parsed.items)) {
      return emptyCart();
    }
    return parsed;
  } catch {
    return emptyCart();
  }
}

export function readCart() {
  if (!isBrowser()) return cachedCart;
  const raw = window.localStorage.getItem(CART_STORAGE_KEY);
  if (raw === cachedRaw) return cachedCart;
  cachedRaw = raw;
  cachedCart = parseRaw(raw);
  return cachedCart;
}

export function writeCart(cart) {
  if (!isBrowser()) return;
  try {
    const raw = JSON.stringify(cart);
    window.localStorage.setItem(CART_STORAGE_KEY, raw);
    // Keep the cache hot so the very next readCart() returns the same reference
    cachedRaw = raw;
    cachedCart = cart;
  } catch (err) {
    console.warn('[cartStorage] failed to persist cart:', err.message);
  }
}

/**
 * Subscribe to cross-tab updates. The callback fires whenever another tab writes to
 * our storage key. Returns an unsubscribe function.
 */
export function subscribe(callback) {
  if (!isBrowser()) return () => {};
  const handler = (e) => {
    if (e.key === CART_STORAGE_KEY) callback();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
