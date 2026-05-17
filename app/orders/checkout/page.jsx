'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useCart } from '@/context/CartContext';
import { groupByInvoice, totals } from '@/lib/cart';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount ?? 0);
}

/**
 * Build the input to /api/ss-catalog-lookup from cart items, deduplicating by (style, color).
 * The lineItemId we send is `${styleNumber}|${color}` since these lookups aren't per Printavo
 * line item — they're per cart-item style/color group.
 */
function buildStockLookupItems(cartItems) {
  const seen = new Map();
  for (const item of cartItems) {
    const key = `${item.styleNumber}|${item.color}`;
    if (!seen.has(key)) {
      seen.set(key, {
        lineItemId: key,
        styleNumber: item.styleNumber,
        color: item.color,
      });
    }
  }
  return Array.from(seen.values());
}

export default function CheckoutPage() {
  const { cart, removeItem, setQty, clearCart } = useCart();
  const { itemCount, lineCount, grandTotal } = totals(cart);
  const groups = useMemo(() => groupByInvoice(cart), [cart]);

  // Stock map: sku → availableQty
  const [stockMap, setStockMap] = useState(() => new Map());
  const [stockState, setStockState] = useState('idle'); // idle | loading | ready | error
  const [stockError, setStockError] = useState(null);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  const lookupItems = useMemo(() => buildStockLookupItems(cart.items), [cart.items]);
  const lookupSignature = useMemo(
    () => lookupItems.map((i) => `${i.styleNumber}|${i.color}`).join('||'),
    [lookupItems],
  );

  // Re-query SS Activewear on mount to refresh stock for cart items
  useEffect(() => {
    if (lookupItems.length === 0 || confirmation) {
      setStockState('idle');
      return;
    }
    let cancelled = false;
    setStockState('loading');
    setStockError(null);

    (async () => {
      try {
        const res = await fetch('/api/ss-catalog-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: lookupItems }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Stock lookup failed');
        if (cancelled) return;
        const next = new Map();
        for (const r of data.results) {
          if (r.state === 'matched' && Array.isArray(r.variants)) {
            for (const v of r.variants) next.set(v.sku, v.qty);
          }
        }
        setStockMap(next);
        setStockState('ready');
      } catch (err) {
        if (cancelled) return;
        setStockError(err.message);
        setStockState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupSignature, confirmation]);

  async function handlePlaceOrder() {
    if (submitting || cart.items.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);

    const uniqueInvoices = Array.from(new Set(cart.items.map((i) => `#${i.sourceInvoiceVisualId}`)));
    const payload = {
      lines: cart.items.map((i) => ({ identifier: i.sku, qty: i.qty })),
      poNumber: uniqueInvoices.join(', '),
      comments: `Consolidated from invoices: ${uniqueInvoices.join(', ')}`,
    };

    try {
      const res = await fetch('/api/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Order submission failed');
      setConfirmation(data.order);
      clearCart();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Confirmation panel (US4)
  if (confirmation) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="rounded-xl border p-8" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-bold mb-2 text-green-600 dark:text-green-400">
            Order submitted to SS Activewear
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
            Your consolidated order has been placed. Confirmation email sent to aspmerch@gmail.com and gramigscott@gmail.com.
          </p>
          {(confirmation.orderNum || confirmation.poNumber || confirmation.invoiceNumber) && (
            <dl className="grid grid-cols-2 gap-3 text-sm mb-6">
              {confirmation.orderNum != null && (
                <>
                  <dt style={{ color: 'var(--muted)' }}>Order #</dt>
                  <dd className="font-mono">{confirmation.orderNum}</dd>
                </>
              )}
              {confirmation.poNumber && (
                <>
                  <dt style={{ color: 'var(--muted)' }}>PO #</dt>
                  <dd className="font-mono">{confirmation.poNumber}</dd>
                </>
              )}
              {confirmation.invoiceNumber && (
                <>
                  <dt style={{ color: 'var(--muted)' }}>Invoice #</dt>
                  <dd className="font-mono">{confirmation.invoiceNumber}</dd>
                </>
              )}
            </dl>
          )}
          <details className="mb-6">
            <summary className="cursor-pointer text-xs" style={{ color: 'var(--muted)' }}>
              Full SS Activewear response
            </summary>
            <pre className="mt-3 text-xs p-3 rounded overflow-x-auto" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>
              {JSON.stringify(confirmation, null, 2)}
            </pre>
          </details>
          <Link
            href="/orders"
            className="inline-block px-5 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Back to orders
          </Link>
        </div>
      </div>
    );
  }

  // Empty cart guard
  if (lineCount === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">🛒</div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
          Your cart is empty
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
          Add items from the orders page before checking out.
        </p>
        <Link
          href="/orders"
          className="inline-block px-5 py-2.5 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          Back to orders
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>
            Pre-Checkout Summary
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Review your consolidated order before submitting to SS Activewear.
          </p>
        </div>
        <Link href="/orders/cart" className="text-sm font-medium hover:underline" style={{ color: 'var(--muted)' }}>
          ← Edit cart
        </Link>
      </div>

      {stockState === 'loading' && (
        <div className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
          ⟳ Checking stock at SS Activewear…
        </div>
      )}
      {stockState === 'error' && (
        <div className="text-xs mb-4 text-amber-600 dark:text-amber-400">
          ⚠ Couldn&apos;t refresh stock ({stockError}). Submission still allowed; SS Activewear will report shortages on its end.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.invoiceId} className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="font-bold" style={{ color: 'var(--accent)' }}>
                Invoice #{group.invoiceVisualId}
              </h2>
              <span className="text-sm font-semibold">{formatCurrency(group.subtotal)}</span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {group.items.map((item) => {
                  const available = stockMap.has(item.sku) ? stockMap.get(item.sku) : null;
                  const shortage =
                    available != null && available < item.qty
                      ? { available, severity: available === 0 ? 'out-of-stock' : 'insufficient' }
                      : null;

                  return (
                    <tr key={item.sku} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-3 px-5">
                        <div className="font-medium text-sm">{item.brandName} {item.styleNumber} — {item.size} / {item.color}</div>
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>{item.styleName}</div>
                        {shortage && (
                          <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200">
                            {shortage.severity === 'out-of-stock'
                              ? '⚠ Out of stock'
                              : `⚠ Only ${shortage.available} available (requested ${item.qty})`}
                            <button
                              type="button"
                              onClick={() => setQty(item.sku, shortage.available)}
                              disabled={shortage.severity === 'out-of-stock'}
                              className="px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] font-semibold disabled:opacity-50"
                            >
                              Reduce to {shortage.available}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeItem(item.sku)}
                              className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-semibold"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center text-xs whitespace-nowrap">
                        Qty <span className="font-semibold">{item.qty}</span>
                      </td>
                      <td className="py-3 px-3 text-right text-xs whitespace-nowrap">
                        {formatCurrency(item.unitPrice)} ea
                      </td>
                      <td className="py-3 px-5 text-right text-sm font-semibold whitespace-nowrap">
                        {formatCurrency((item.unitPrice || 0) * item.qty)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm" style={{ color: 'var(--muted)' }}>
            {itemCount} item{itemCount === 1 ? '' : 's'} across {groups.length} invoice{groups.length === 1 ? '' : 's'}
          </div>
          <div className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>
            {formatCurrency(grandTotal)}
          </div>
        </div>

        {submitError && (
          <div className="mb-4 p-3 rounded-lg border border-red-500 bg-red-50 dark:bg-red-950 text-sm text-red-700 dark:text-red-300">
            <div className="font-semibold mb-1">Submission failed</div>
            <div>{submitError}</div>
            <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              Your cart has been preserved — fix the issue and try again.
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handlePlaceOrder}
          disabled={submitting}
          className="w-full px-6 py-4 rounded-lg font-bold text-base transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {submitting ? 'Submitting to SS Activewear…' : 'Place Order'}
        </button>
        <p className="mt-3 text-xs text-center" style={{ color: 'var(--muted)' }}>
          Total shown is garment cost only — shipping, surcharges, and taxes will be calculated by SS Activewear and reflected on their invoice.
        </p>
        <p className="mt-1 text-xs text-center" style={{ color: 'var(--muted)' }}>
          ⚠ Test mode: <code>testOrder: true</code> is hardcoded — no real charge will occur.
        </p>
      </div>
    </div>
  );
}
