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

/** Icon for payment profile type */
function ProfileIcon({ type }) {
  if (type === 'Card') return <span>💳</span>;
  if (type === 'Bank') return <span>🏦</span>;
  return <span>💰</span>;
}

/**
 * Per-invoice partial-items breakdown on the confirmation screen (US2).
 * Shows which line items were ordered vs. still need follow-up for each
 * partial source invoice.
 */
function PartialItemsTable({ visualId, summary }) {
  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
    >
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="font-mono text-sm">#{visualId}</span>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          {summary.totalItemsStillNeeded} item{summary.totalItemsStillNeeded === 1 ? '' : 's'} still need ordering
        </span>
      </div>
      <table className="w-full text-xs">
        <thead style={{ color: 'var(--muted)' }}>
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">Line item</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium text-right">Ordered</th>
            <th className="px-3 py-2 font-medium text-right">Still needed</th>
          </tr>
        </thead>
        <tbody>
          {summary.lineItems.map((li) => (
            <tr key={li.sourceLineItemId} style={{ borderTop: '1px solid var(--border)' }}>
              <td className="px-3 py-2">{li.description}</td>
              <td className="px-3 py-2">
                {li.source === 'ss-activewear'
                  ? 'SS Activewear'
                  : li.source === 'sanmar'
                    ? 'Sanmar — Auto Order'
                    : 'Lookup pending'}
              </td>
              <td className="px-3 py-2 text-right font-mono">{li.alreadyOrdered ?? 0}</td>
              <td className="px-3 py-2 text-right font-mono font-semibold">{li.stillNeeded}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Renders the per-invoice Printavo status outcome chip on the confirmation
 * screen. For failed updates, a Retry button is rendered alongside the chip
 * (US4 / FR-010) that posts to /api/printavo-status-update.
 */
function StatusChip({ entry, onRetry, retrying }) {
  const update = entry.statusUpdate || {};
  let label;
  let tone; // 'success' | 'warn' | 'error' | 'muted'
  if (update.outcome === 'updated') {
    if (update.reason === 'already-in-or-past-target') {
      label = 'Status already updated';
      tone = 'muted';
    } else {
      label = 'Status updated to Goods In Transit';
      tone = 'success';
    }
  } else if (update.outcome === 'failed') {
    label = `Status update failed — ${update.errorMessage || 'unknown error'}`;
    tone = 'error';
  } else if (update.outcome === 'skipped' && update.reason === 'partial') {
    label = 'Partial — Printavo status unchanged';
    tone = 'warn';
  } else if (update.outcome === 'skipped' && update.reason === 'skipped-not-ready') {
    label = 'Skipped — already past Ready to Order';
    tone = 'muted';
  } else if (update.outcome === 'skipped' && update.reason === 'already-in-or-past-target') {
    label = 'Status already updated';
    tone = 'muted';
  } else if (update.outcome === 'skipped') {
    label = 'Skipped';
    tone = 'muted';
  } else {
    label = 'Unknown';
    tone = 'muted';
  }
  const toneClass = {
    success: 'bg-green-600 text-white',
    warn: 'bg-amber-500 text-white',
    error: 'bg-red-600 text-white',
    muted: 'bg-neutral-400 text-white',
  }[tone];
  return (
    <div className="flex items-center gap-2">
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${toneClass}`}>{label}</span>
      {update.outcome === 'failed' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="px-2.5 py-1 rounded-md text-xs font-semibold border transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  const { cart, removeItem, setQty, clearCart } = useCart();
  const { itemCount, lineCount, grandTotal } = totals(cart);
  const groups = useMemo(() => groupByInvoice(cart), [cart]);

  // Stock map: sku → availableQty
  const [stockMap, setStockMap] = useState(() => new Map());
  const [stockState, setStockState] = useState('idle'); // idle | loading | ready | error
  const [stockError, setStockError] = useState(null);

  // Payment profiles
  const [profiles, setProfiles] = useState([]);
  const [profilesState, setProfilesState] = useState('idle'); // idle | loading | ready | error
  const [selectedProfileId, setSelectedProfileId] = useState(null);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  // Per-invoice retry state for failed Printavo status updates (US4).
  // Keyed by sourceInvoiceId — value is `true` while the retry POST is
  // in-flight. We do not persist any other UI state here; the chip label
  // is derived from the (updated) statusUpdate on the confirmation entry.
  const [retryingByInvoiceId, setRetryingByInvoiceId] = useState({});

  async function handleRetryStatusUpdate(entry) {
    const invoiceId = entry.sourceInvoiceId;
    if (!invoiceId || retryingByInvoiceId[invoiceId]) return;
    setRetryingByInvoiceId((prev) => ({ ...prev, [invoiceId]: true }));
    try {
      const res = await fetch('/api/printavo-status-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          // Goods-In-Transit status ID — mirror of GOODS_IN_TRANSIT_STATUS_ID
          // in `lib/printavo.js`. Hardcoded here to avoid importing a
          // server-only module into this client component.
          targetStatusId: '292756',
        }),
      });
      const data = await res.json();

      setConfirmation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          perInvoice: prev.perInvoice.map((p) => {
            if (p.sourceInvoiceId !== invoiceId) return p;
            if (res.ok && data.ok && data.skipped === false) {
              // Successful status flip to Goods In Transit.
              return {
                ...p,
                statusUpdate: {
                  outcome: 'updated',
                  reason: 'fully-ordered-eligible',
                  newStatus: data.newStatus,
                  previousStatus: data.previousStatus,
                  errorMessage: null,
                  retryEndpoint: null,
                },
              };
            }
            if (res.ok && data.ok && data.skipped === true) {
              // Idempotent skip — invoice was already in or past target.
              return {
                ...p,
                statusUpdate: {
                  outcome: 'updated',
                  reason: 'already-in-or-past-target',
                  newStatus: data.currentStatus,
                  errorMessage: null,
                  retryEndpoint: null,
                },
              };
            }
            // Failure — surface the new error inside the chip.
            return {
              ...p,
              statusUpdate: {
                ...(p.statusUpdate || {}),
                outcome: 'failed',
                errorMessage: data?.error || 'Retry failed',
                retryEndpoint: '/api/printavo-status-update',
              },
            };
          }),
        };
      });
    } catch (err) {
      setConfirmation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          perInvoice: prev.perInvoice.map((p) =>
            p.sourceInvoiceId !== invoiceId
              ? p
              : {
                  ...p,
                  statusUpdate: {
                    ...(p.statusUpdate || {}),
                    outcome: 'failed',
                    errorMessage: err?.message || 'Retry failed',
                    retryEndpoint: '/api/printavo-status-update',
                  },
                },
          ),
        };
      });
    } finally {
      setRetryingByInvoiceId((prev) => {
        const next = { ...prev };
        delete next[invoiceId];
        return next;
      });
    }
  }

  const lookupItems = useMemo(() => buildStockLookupItems(cart.items), [cart.items]);
  const lookupSignature = useMemo(
    () => lookupItems.map((i) => `${i.styleNumber}|${i.color}`).join('||'),
    [lookupItems],
  );

  // Fetch payment profiles on mount
  useEffect(() => {
    if (confirmation) return;
    setProfilesState('loading');
    fetch('/api/payment-profiles')
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error || 'Failed to load payment profiles');
        setProfiles(data.profiles || []);
        // Default to the first profile returned by SS Activewear
        if (data.profiles && data.profiles.length > 0) {
          setSelectedProfileId(data.profiles[0].profileID);
        }
        setProfilesState('ready');
      })
      .catch((err) => {
        console.error('[checkout] payment profiles error:', err.message);
        setProfilesState('error');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmation]);

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
    if (!selectedProfileId) {
      alert('Please select a payment method before placing your order.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    const uniqueInvoices = Array.from(new Set(cart.items.map((i) => `#${i.sourceInvoiceVisualId}`)));
    const payload = {
      lines: cart.items.map((i) => ({
        identifier: i.sku,
        qty: i.qty,
        sourceInvoiceId: i.sourceInvoiceId,
        sourceInvoiceVisualId: i.sourceInvoiceVisualId,
        sourceLineItemId: i.sourceLineItemId,
      })),
      poNumber: uniqueInvoices.join(', '),
      comments: `Consolidated from invoices: ${uniqueInvoices.join(', ')}`,
      paymentProfileId: selectedProfileId,
    };

    try {
      const res = await fetch('/api/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Order submission failed');
      setConfirmation(data);
      clearCart();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Confirmation panel (US1 + US2)
  if (confirmation) {
    const ssOrder = confirmation.ssOrder || {};
    const perInvoice = confirmation.perInvoice || [];
    const attribution = confirmation.attributionRecord || {};
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
          {(ssOrder.orderNum || ssOrder.poNumber || ssOrder.invoiceNumber) && (
            <dl className="grid grid-cols-2 gap-3 text-sm mb-6">
              {ssOrder.orderNum != null && (
                <>
                  <dt style={{ color: 'var(--muted)' }}>Order #</dt>
                  <dd className="font-mono">{ssOrder.orderNum}</dd>
                </>
              )}
              {ssOrder.poNumber && (
                <>
                  <dt style={{ color: 'var(--muted)' }}>PO #</dt>
                  <dd className="font-mono">{ssOrder.poNumber}</dd>
                </>
              )}
              {ssOrder.invoiceNumber && (
                <>
                  <dt style={{ color: 'var(--muted)' }}>Invoice #</dt>
                  <dd className="font-mono">{ssOrder.invoiceNumber}</dd>
                </>
              )}
            </dl>
          )}

          {perInvoice.length > 0 && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--muted)' }}>
                Printavo status per invoice
              </h2>
              <ul className="space-y-2">
                {perInvoice.map((entry) => (
                  <li
                    key={entry.sourceInvoiceId}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-sm"
                    style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
                  >
                    <span className="font-mono">#{entry.sourceInvoiceVisualId}</span>
                    <StatusChip
                      entry={entry}
                      onRetry={() => handleRetryStatusUpdate(entry)}
                      retrying={!!retryingByInvoiceId[entry.sourceInvoiceId]}
                    />
                  </li>
                ))}
              </ul>
              {attribution.writeOk === false && (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                  ⚠ Attribution record write failed: {attribution.writeError}. Future partial-state derivation for these invoices may show &ldquo;unavailable&rdquo; until this is corrected.
                </p>
              )}
            </section>
          )}

          {perInvoice.some((p) => p.classification === 'partial' && p.partialItemsSummary) && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--muted)' }}>
                Partial — needs follow-up
              </h2>
              <div className="space-y-4">
                {perInvoice
                  .filter((p) => p.classification === 'partial' && p.partialItemsSummary)
                  .map((entry) => (
                    <PartialItemsTable
                      key={entry.sourceInvoiceId}
                      visualId={entry.sourceInvoiceVisualId}
                      summary={entry.partialItemsSummary}
                    />
                  ))}
              </div>
            </section>
          )}

          <details className="mb-6">
            <summary className="cursor-pointer text-xs" style={{ color: 'var(--muted)' }}>
              Full /api/place-order response
            </summary>
            <pre className="mt-3 text-xs p-3 rounded overflow-x-auto" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>
              {JSON.stringify(confirmation, null, 2)}
            </pre>
          </details>
          <Link
            href="/purchasing"
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
          href="/purchasing"
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
        <Link href="/purchasing/cart" className="text-sm font-medium hover:underline" style={{ color: 'var(--muted)' }}>
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
                              onClick={() => setQty(item.sku, item.sourceInvoiceId, shortage.available)}
                              disabled={shortage.severity === 'out-of-stock'}
                              className="px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] font-semibold disabled:opacity-50"
                            >
                              Reduce to {shortage.available}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeItem(item.sku, item.sourceInvoiceId)}
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

      {/* Payment method selector */}
      <div className="mt-6 rounded-xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--foreground)' }}>
          Payment Method
        </h3>
        {profilesState === 'loading' && (
          <div className="text-xs" style={{ color: 'var(--muted)' }}>⟳ Loading payment methods…</div>
        )}
        {profilesState === 'error' && (
          <div className="text-xs text-red-600 dark:text-red-400">
            ⚠ Could not load payment methods. Please refresh and try again.
          </div>
        )}
        {profilesState === 'ready' && profiles.length === 0 && (
          <div className="text-xs text-amber-600 dark:text-amber-400">
            ⚠ No payment methods found on your S&amp;S Activewear account. Please add a credit card or bank account at ssactivewear.com.
          </div>
        )}
        {profilesState === 'ready' && profiles.length > 0 && (
          <div className="flex flex-col gap-2">
            {profiles.map((profile) => (
              <label
                key={profile.profileID}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors"
                style={{
                  borderColor: selectedProfileId === profile.profileID ? 'var(--accent)' : 'var(--border)',
                  background: selectedProfileId === profile.profileID ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface)',
                }}
              >
                <input
                  type="radio"
                  name="paymentProfile"
                  value={profile.profileID}
                  checked={selectedProfileId === profile.profileID}
                  onChange={() => setSelectedProfileId(profile.profileID)}
                  className="accent-[var(--accent)]"
                />
                <ProfileIcon type={profile.profileType} />
                <span className="text-sm" style={{ color: 'var(--foreground)' }}>{profile.name}</span>
              </label>
            ))}
          </div>
        )}
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
          disabled={submitting || !selectedProfileId || profilesState !== 'ready'}
          className="w-full px-6 py-4 rounded-lg font-bold text-base transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {submitting ? 'Submitting to SS Activewear…' : 'Place Order'}
        </button>
        <p className="mt-3 text-xs text-center" style={{ color: 'var(--muted)' }}>
          Total shown is garment cost only — shipping, surcharges, and taxes will be calculated by SS Activewear and reflected on their invoice.
        </p>
        <p className="mt-1 text-xs text-center" style={{ color: 'var(--muted)' }}>
          ⚠ Live order: this will be charged and shipped for real by SS Activewear.
        </p>
      </div>
    </div>
  );
}
