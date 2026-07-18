/**
 * Pure cart operations for the SS Activewear / SanMar ordering workflow.
 *
 * All functions take a `cart` value and return a new `cart` — no mutation, no I/O.
 * Persistence is the responsibility of `lib/cartStorage.js`.
 *
 * See .specify/specs/001-ssactivewear-cart-ordering/data-model.md for the schema.
 * Each item carries a `vendor: 'ss-activewear' | 'sanmar'` tag (added in
 * CART_VERSION 2) so checkout can submit a mixed cart as two independent
 * vendor orders.
 */

export const CART_VERSION = 2;

export function emptyCart() {
  return { version: CART_VERSION, items: [], updatedAt: new Date().toISOString() };
}

function clampQty(qty) {
  const n = Math.floor(Number(qty));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function touch(cart, items) {
  return { version: CART_VERSION, items, updatedAt: new Date().toISOString() };
}

/**
 * Composite dedup key. Two cart rows are the same iff (sku, vendor,
 * sourceInvoiceId) match. The same SKU from two different source invoices
 * MUST yield two distinct rows so per-invoice attribution survives through
 * to vendor order submission (FR-016 / spec 002-printavo-order-notification).
 * `vendor` is included because SS Activewear and SanMar SKU formats can
 * theoretically collide and because checkout needs to split the cart by
 * vendor to submit two independent orders.
 */
function sameRow(a, b) {
  return a.sku === b.sku && a.vendor === b.vendor && a.sourceInvoiceId === b.sourceInvoiceId;
}

/**
 * Add an item to the cart. If a row already exists with the same
 * (sku, sourceInvoiceId), increments its qty instead of appending a duplicate.
 * Items with qty ≤ 0 after coercion are ignored.
 */
export function addItem(cart, item) {
  const qty = clampQty(item.qty);
  if (qty <= 0) return cart;
  const idx = cart.items.findIndex((i) => sameRow(i, item));
  if (idx >= 0) {
    const next = cart.items.slice();
    next[idx] = { ...next[idx], qty: next[idx].qty + qty };
    return touch(cart, next);
  }
  return touch(cart, [...cart.items, { ...item, qty, addedAt: item.addedAt || new Date().toISOString() }]);
}

/**
 * Remove a row identified by (sku, vendor, sourceInvoiceId).
 */
export function removeItem(cart, sku, vendor, sourceInvoiceId) {
  return touch(
    cart,
    cart.items.filter((i) => !(i.sku === sku && i.vendor === vendor && i.sourceInvoiceId === sourceInvoiceId)),
  );
}

/**
 * Set qty for the row identified by (sku, vendor, sourceInvoiceId). qty ≤ 0
 * is equivalent to removeItem.
 */
export function setQty(cart, sku, vendor, sourceInvoiceId, qty) {
  const next = clampQty(qty);
  if (next <= 0) return removeItem(cart, sku, vendor, sourceInvoiceId);
  return touch(
    cart,
    cart.items.map((i) =>
      i.sku === sku && i.vendor === vendor && i.sourceInvoiceId === sourceInvoiceId ? { ...i, qty: next } : i,
    ),
  );
}

export function clearCart(cart) {
  return touch(cart, []);
}

/**
 * Group cart items by their source invoice. Returns an ordered array preserving the
 * order each invoice was first added to the cart.
 */
export function groupByInvoice(cart) {
  const seen = new Map();
  for (const item of cart.items) {
    if (!seen.has(item.sourceInvoiceId)) {
      seen.set(item.sourceInvoiceId, {
        invoiceId: item.sourceInvoiceId,
        invoiceVisualId: item.sourceInvoiceVisualId,
        items: [],
        subtotal: 0,
      });
    }
    const g = seen.get(item.sourceInvoiceId);
    g.items.push(item);
    g.subtotal += (item.unitPrice || 0) * item.qty;
  }
  return Array.from(seen.values());
}

export function totals(cart) {
  let itemCount = 0;
  let grandTotal = 0;
  for (const i of cart.items) {
    itemCount += i.qty;
    grandTotal += (i.unitPrice || 0) * i.qty;
  }
  return { itemCount, lineCount: cart.items.length, grandTotal };
}
