'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCart } from '@/context/CartContext';
import { totals } from '@/lib/cart';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount ?? 0);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Canonical size order for display
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

// Map Printavo size enum values → display labels
function sizeLabel(sizeEnum) {
  const map = {
    size_xs: 'XS',
    size_s: 'S',
    size_m: 'M',
    size_l: 'L',
    size_xl: 'XL',
    size_2xl: '2XL',
    size_3xl: '3XL',
    size_4xl: '4XL',
    size_5xl: '5XL',
    size_other: 'Other',
  };
  return map[sizeEnum] || sizeEnum;
}

/**
 * Batch-classify every line item across all loaded invoices against the SS Activewear catalog.
 * Returns a map keyed by line-item id plus a retry function for failed items.
 */
function useLineItemClassification(lineItems) {
  const [classifications, setClassifications] = useState(() => new Map());
  const idSignature = useMemo(() => lineItems.map((li) => li.id).join('|'), [lineItems]);

  const runLookup = useCallback(async (items) => {
    if (items.length === 0) return;
    setClassifications((prev) => {
      const next = new Map(prev);
      for (const li of items) next.set(li.id, { lineItemId: li.id, state: 'pending' });
      return next;
    });

    try {
      const res = await fetch('/api/ss-catalog-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((li) => ({
            lineItemId: li.id,
            styleNumber: li.itemNumber || null,
            color: li.color || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Lookup failed');

      setClassifications((prev) => {
        const next = new Map(prev);
        for (const r of data.results) next.set(r.lineItemId, r);
        return next;
      });
    } catch (err) {
      setClassifications((prev) => {
        const next = new Map(prev);
        for (const li of items) {
          next.set(li.id, { lineItemId: li.id, state: 'failed', error: err.message });
        }
        return next;
      });
    }
  }, []);

  useEffect(() => {
    if (lineItems.length === 0) return;
    runLookup(lineItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSignature, runLookup]);

  const retry = useCallback(
    (lineItemId) => {
      const li = lineItems.find((x) => x.id === lineItemId);
      if (li) runLookup([li]);
    },
    [lineItems, runLookup],
  );

  return { classifications, retry };
}

function SourcingCell({ lineItem, result, onAddToCart, onRetry }) {
  const [justAdded, setJustAdded] = useState(0);
  const state = result?.state || 'pending';

  if (state === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--muted)' }}>
        <span className="inline-block animate-spin">⟳</span> Checking…
      </span>
    );
  }

  if (state === 'matched') {
    if (justAdded > 0) {
      return (
        <span className="inline-flex items-center text-xs font-semibold text-green-600 dark:text-green-400">
          ✓ Added {justAdded}
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={() => {
          const n = onAddToCart(lineItem, result.variants);
          if (n > 0) {
            setJustAdded(n);
            setTimeout(() => setJustAdded(0), 2000);
          }
        }}
        className="px-3 py-1 rounded-md text-xs font-semibold transition-opacity hover:opacity-90"
        style={{ background: 'var(--accent)', color: '#fff' }}
      >
        + Add to Cart
      </button>
    );
  }

  if (state === 'sanmar') {
    return (
      <span
        className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
        title="Auto-routed to Sanmar — no manual action required"
      >
        Sanmar – Auto Order
      </span>
    );
  }

  // failed
  return (
    <button
      type="button"
      onClick={() => onRetry(lineItem.id)}
      className="px-3 py-1 rounded-md text-xs font-semibold border border-red-500 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
      title={result?.error || 'Lookup failed'}
    >
      ⚠ Lookup failed — Retry
    </button>
  );
}

function PaidBadge({ paidInFull }) {
  if (paidInFull) {
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold bg-green-500 text-white">
        ✓ PAID
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold bg-red-600 text-white">
      ✗ UNPAID
    </span>
  );
}

function OrderOverview({ lineItemGroups, classifications, onAddToCart, onRetry }) {
  // Local state: overrides for size quantities keyed by `${lineItemId}:${sizeLabel}`
  const [qtyOverrides, setQtyOverrides] = useState({});

  if (!lineItemGroups?.nodes?.length) {
    return (
      <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
        No line items found for this invoice.
      </p>
    );
  }

  // Flatten all line items across all groups
  const allLineItems = lineItemGroups.nodes.flatMap(
    (group) => group.lineItems?.nodes || []
  );

  if (!allLineItems.length) {
    return (
      <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
        No line items found for this invoice.
      </p>
    );
  }

  // Collect all sizes that appear across all line items (for column headers)
  const usedSizes = new Set();
  allLineItems.forEach((li) => {
    (li.sizes || []).forEach((s) => {
      if (s.count > 0) usedSizes.add(sizeLabel(s.size));
    });
  });
  const sizeColumns = SIZE_ORDER.filter((s) => usedSizes.has(s));
  // Add "Other" at the end if present
  if (usedSizes.has('Other')) sizeColumns.push('Other');

  function handleQtyChange(lineItemId, size, value) {
    const parsed = parseInt(value, 10);
    const next = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setQtyOverrides((prev) => ({ ...prev, [`${lineItemId}:${size}`]: next }));
  }

  // Build an effective line item with overridden sizes for use by onAddToCart
  function effectiveLineItem(li) {
    const sizes = (li.sizes || []).map((s) => {
      const lbl = sizeLabel(s.size);
      const key = `${li.id}:${lbl}`;
      return key in qtyOverrides ? { ...s, count: qtyOverrides[key] } : s;
    });
    return { ...li, sizes };
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            <th className="text-left py-2 pr-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Item #
            </th>
            <th className="text-left py-2 pr-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Color
            </th>
            <th className="text-left py-2 pr-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Description
            </th>
            {sizeColumns.map((s) => (
              <th
                key={s}
                className="text-center py-2 px-2 font-semibold text-xs uppercase tracking-wide"
                style={{ color: 'var(--muted)' }}
              >
                {s}
              </th>
            ))}
            <th className="text-center py-2 px-2 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Qty
            </th>
            <th className="text-right py-2 pl-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Unit Price
            </th>
            <th className="text-right py-2 pl-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Total
            </th>
            <th className="text-right py-2 pl-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Sourcing
            </th>
          </tr>
        </thead>
        <tbody>
          {allLineItems.map((li) => {
            // Build a size → count map for this line item (respecting overrides)
            const sizeMap = {};
            (li.sizes || []).forEach((s) => {
              const lbl = sizeLabel(s.size);
              const key = `${li.id}:${lbl}`;
              sizeMap[lbl] = key in qtyOverrides ? qtyOverrides[key] : s.count;
            });

            // Effective qty = sum of all (possibly overridden) size counts
            const qty = sizeColumns.reduce((sum, s) => sum + (sizeMap[s] || 0), 0) ||
              (li.items ?? (li.sizes || []).reduce((sum, s) => sum + (s.count || 0), 0));
            const lineTotal = li.price != null && qty ? li.price * qty : null;

            return (
              <tr
                key={li.id}
                style={{ borderBottom: '1px solid var(--border)' }}
                className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                <td className="py-2 pr-3 font-mono text-xs font-medium">
                  {li.itemNumber || '—'}
                </td>
                <td className="py-2 pr-3 text-xs">
                  {li.color || '—'}
                </td>
                <td className="py-2 pr-3 text-xs max-w-[200px]">
                  {li.description || '—'}
                </td>
                {sizeColumns.map((s) => {
                  const originalCount = (li.sizes || []).find(
                    (sz) => sizeLabel(sz.size) === s
                  )?.count ?? 0;
                  const key = `${li.id}:${s}`;
                  const currentVal = key in qtyOverrides ? qtyOverrides[key] : originalCount;
                  const isModified = key in qtyOverrides && qtyOverrides[key] !== originalCount;

                  return (
                    <td key={s} className="py-2 px-1 text-center text-xs">
                      <input
                        type="number"
                        min="0"
                        value={currentVal}
                        onChange={(e) => handleQtyChange(li.id, s, e.target.value)}
                        className="w-14 text-center rounded border px-1 py-0.5 text-xs font-medium focus:outline-none focus:ring-2"
                        style={{
                          background: isModified ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : 'var(--surface)',
                          borderColor: isModified ? 'var(--accent)' : 'var(--border)',
                          color: 'var(--foreground)',
                          '--tw-ring-color': 'var(--accent)',
                        }}
                        title={isModified ? `Original: ${originalCount}` : undefined}
                      />
                    </td>
                  );
                })}
                <td className="py-2 px-2 text-center text-xs font-semibold">
                  {qty || '—'}
                </td>
                <td className="py-2 pl-3 text-right text-xs">
                  {li.price != null ? formatCurrency(li.price) : '—'}
                </td>
                <td className="py-2 pl-3 text-right text-xs font-semibold">
                  {lineTotal != null ? formatCurrency(lineTotal) : '—'}
                </td>
                <td className="py-2 pl-3 text-right text-xs">
                  <SourcingCell
                    lineItem={effectiveLineItem(li)}
                    result={classifications?.get(li.id)}
                    onAddToCart={onAddToCart}
                    onRetry={onRetry}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InvoiceCard({ invoice, classifications, onAddToCart, onRetry }) {
  const [expanded, setExpanded] = useState(false);
  const onAddToCartBound = useCallback(
    (lineItem, variants) => onAddToCart(invoice, lineItem, variants),
    [invoice, onAddToCart],
  );

  const customerName =
    invoice.contact?.fullName?.trim() ||
    [invoice.contact?.firstName, invoice.contact?.lastName].filter(Boolean).join(' ') ||
    invoice.contact?.email ||
    'Unknown Customer';

  return (
    <div
      className="rounded-xl border shadow-sm overflow-hidden"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {/* Card body */}
      <div className="p-5 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <span
              className="text-lg font-bold"
              style={{ color: 'var(--accent)' }}
            >
              #{invoice.visualId}
            </span>
            {invoice.nickname && (
              <span className="ml-2 text-sm" style={{ color: 'var(--muted)' }}>
                {invoice.nickname}
              </span>
            )}
          </div>
          <PaidBadge paidInFull={invoice.paidInFull} />
        </div>

        {/* Customer */}
        <div className="flex items-center gap-2 text-sm">
          <span style={{ color: 'var(--muted)' }}>Customer:</span>
          <span className="font-medium">{customerName}</span>
          {invoice.contact?.email && (
            <a
              href={`mailto:${invoice.contact.email}`}
              className="text-xs hover:underline"
              style={{ color: 'var(--muted)' }}
            >
              {invoice.contact.email}
            </a>
          )}
        </div>

        {/* Financials */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div style={{ color: 'var(--muted)' }} className="text-xs uppercase tracking-wide mb-0.5">Total</div>
            <div className="font-semibold text-base">{formatCurrency(invoice.total)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)' }} className="text-xs uppercase tracking-wide mb-0.5">Paid</div>
            <div className="font-semibold text-base" style={{ color: invoice.amountPaid > 0 ? '#22c55e' : 'inherit' }}>
              {formatCurrency(invoice.amountPaid)}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)' }} className="text-xs uppercase tracking-wide mb-0.5">Outstanding</div>
            <div
              className="font-semibold text-base"
              style={{ color: invoice.amountOutstanding > 0 ? '#ef4444' : '#22c55e' }}
            >
              {formatCurrency(invoice.amountOutstanding)}
            </div>
          </div>
        </div>

        {/* Dates */}
        <div className="flex gap-4 text-sm flex-wrap">
          <div>
            <span style={{ color: 'var(--muted)' }}>Due: </span>
            <span className="font-medium">{formatDate(invoice.customerDueAt)}</span>
          </div>
          <div>
            <span style={{ color: 'var(--muted)' }}>Created: </span>
            <span>{formatDate(invoice.createdAt)}</span>
          </div>
        </div>

        {/* Production note */}
        {invoice.productionNote && (
          <div
            className="text-sm rounded-lg p-3 mt-1"
            style={{ background: 'var(--background)', borderLeft: '3px solid var(--accent)' }}
          >
            <div className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>
              Production Note
            </div>
            <div className="whitespace-pre-wrap">{invoice.productionNote}</div>
          </div>
        )}

        {/* Customer note */}
        {invoice.customerNote && (
          <div
            className="text-sm rounded-lg p-3 mt-1"
            style={{ background: 'var(--background)', borderLeft: '3px solid var(--accent-alt)' }}
          >
            <div className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>
              Customer Note
            </div>
            <div className="whitespace-pre-wrap">{invoice.customerNote}</div>
          </div>
        )}
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        style={{ borderTop: '1px solid var(--border)', color: 'var(--foreground)' }}
        aria-expanded={expanded}
      >
        <span style={{ color: 'var(--muted)' }} className="text-xs uppercase tracking-wide font-semibold">
          Order Overview
        </span>
        <span
          className="transition-transform duration-200"
          style={{ display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▾
        </span>
      </button>

      {/* Expandable details */}
      {expanded && (
        <div
          className="px-5 pb-5"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--background)' }}
        >
          <OrderOverview
            lineItemGroups={invoice.lineItemGroups}
            classifications={classifications}
            onAddToCart={onAddToCartBound}
            onRetry={onRetry}
          />
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Flatten every line item across every loaded invoice into a single list for batch lookup
  const allLineItems = useMemo(
    () =>
      invoices.flatMap((inv) =>
        (inv.lineItemGroups?.nodes || []).flatMap((g) => g.lineItems?.nodes || []),
      ),
    [invoices],
  );
  const { classifications, retry } = useLineItemClassification(allLineItems);

  const { cart, addItem } = useCart();
  const cartTotals = totals(cart);

  // Expand a Printavo line item into one CartItem per (size, color) variant
  const handleAddToCart = useCallback(
    (invoice, lineItem, variants) => {
      let added = 0;
      for (const sizeEntry of lineItem.sizes || []) {
        if (!(sizeEntry.count > 0)) continue;
        const sizeLbl = sizeLabel(sizeEntry.size);
        const variant = variants.find(
          (v) =>
            (v.sizeName || '').trim().toUpperCase() === sizeLbl.toUpperCase() &&
            (v.colorName || '').trim().toLowerCase() === (lineItem.color || '').trim().toLowerCase(),
        );
        if (!variant) {
          console.warn('[orders] no SS variant for', lineItem.itemNumber, sizeLbl, lineItem.color);
          continue;
        }
        addItem({
          sku: variant.sku,
          styleNumber: lineItem.itemNumber,
          styleName: variant.styleName,
          brandName: variant.brandName,
          color: variant.colorName || lineItem.color,
          size: variant.sizeName,
          qty: sizeEntry.count,
          unitPrice: variant.customerPrice ?? 0,
          sourceInvoiceId: invoice.id,
          sourceInvoiceVisualId: invoice.visualId,
          sourceLineItemId: lineItem.id,
          addedAt: new Date().toISOString(),
        });
        added += sizeEntry.count;
      }
      return added;
    },
    [addItem],
  );

  async function fetchInvoices() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ready-to-order');
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to load invoices');
      setInvoices(data.invoices || []);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchInvoices();
  }, []);

  const paidCount = invoices.filter((i) => i.paidInFull).length;
  const unpaidCount = invoices.filter((i) => !i.paidInFull).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Sticky cart strip — visible while scrolling long invoice lists (T021) */}
      {cartTotals.itemCount > 0 && (
        <div
          className="sticky top-0 z-10 -mx-4 px-4 py-2 mb-4 flex items-center justify-between gap-3 backdrop-blur"
          style={{ background: 'color-mix(in srgb, var(--surface) 92%, transparent)', borderBottom: '1px solid var(--border)' }}
        >
          <span className="text-sm">
            🛒 <span className="font-bold">{cartTotals.itemCount}</span> item{cartTotals.itemCount === 1 ? '' : 's'} in cart
          </span>
          <Link
            href="/orders/cart"
            className="px-3 py-1 rounded-md text-xs font-semibold"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            View cart →
          </Link>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>
            Ready to Order
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Invoices awaiting garment ordering from S&amp;S Activewear
          </p>
        </div>
        <button
          onClick={fetchInvoices}
          disabled={loading}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {/* Summary badges */}
      {!loading && !error && invoices.length > 0 && (
        <div className="flex gap-3 mb-6 flex-wrap">
          <div className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--muted)' }}>Total: </span>
            <span className="font-bold">{invoices.length}</span>
          </div>
          <div className="px-4 py-2 rounded-lg text-sm font-medium bg-green-500 text-white">
            ✓ Paid: {paidCount}
          </div>
          <div className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white">
            ✗ Unpaid: {unpaidCount}
          </div>
          {lastRefresh && (
            <div className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
              Updated {lastRefresh.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="text-4xl mb-3 animate-spin inline-block">⟳</div>
            <p style={{ color: 'var(--muted)' }}>Loading invoices…</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-xl border border-red-500 bg-red-50 dark:bg-red-950 p-6 text-center">
          <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
          <button
            onClick={fetchInvoices}
            className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && invoices.length === 0 && (
        <div className="text-center py-20" style={{ color: 'var(--muted)' }}>
          <div className="text-5xl mb-4">📦</div>
          <p className="text-lg font-medium">No invoices ready to order</p>
          <p className="text-sm mt-1">Invoices with "Ready to Order" status will appear here.</p>
        </div>
      )}

      {/* Invoice cards */}
      {!loading && !error && invoices.length > 0 && (
        <div className="flex flex-col gap-4">
          {invoices.map((invoice) => (
            <InvoiceCard
              key={invoice.id}
              invoice={invoice}
              classifications={classifications}
              onAddToCart={handleAddToCart}
              onRetry={retry}
            />
          ))}
        </div>
      )}
    </div>
  );
}
