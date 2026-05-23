'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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
 * Returns the sizes to render for a line item, plus the target qty the user
 * must allocate across them.
 *
 * - When SS classification matches: SS variants are authoritative. The size
 *   list comes from unique sizeName values across variants, sorted by sizeOrder.
 *   Sizes whose label matches a Printavo bucket (S → S, M → M, …) are pre-filled
 *   from the Printavo counts. The target = sum of all Printavo size counts so
 *   the user re-allocates any qty Printavo bucketed as "Other".
 *
 * - When SS lookup is pending / Sanmar / failed: Printavo sizes are used as a
 *   fallback (filtered to sizes with count > 0 plus "Other" if any).
 *
 * @returns { mode: 'ss'|'printavo', sizes: Array<{ sizeName, sizeOrder, prefillQty }>, targetQty: number }
 */
function getRowSizes(lineItem, classification) {
  const printavoEntries = (lineItem.sizes || []).filter((s) => (s.count || 0) > 0);
  const targetQty = printavoEntries.reduce((sum, s) => sum + (s.count || 0), 0);

  const matched = classification?.state === 'matched' && classification.variants?.length > 0;

  if (!matched) {
    // Printavo fallback — show only sizes with qty, in canonical order
    const sizes = printavoEntries
      .map((s) => ({
        sizeName: sizeLabel(s.size),
        sizeOrder: SIZE_ORDER.indexOf(sizeLabel(s.size)),
        prefillQty: s.count || 0,
      }))
      .sort((a, b) => {
        // Move sizes not in SIZE_ORDER (incl. "Other") to the end
        const ax = a.sizeOrder === -1 ? 999 : a.sizeOrder;
        const bx = b.sizeOrder === -1 ? 999 : b.sizeOrder;
        return ax - bx;
      });
    return { mode: 'printavo', sizes, targetQty };
  }

  // SS sizes — unique, sorted by sizeOrder
  const bySize = new Map();
  for (const v of classification.variants) {
    if (!v.sizeName) continue;
    if (!bySize.has(v.sizeName)) {
      bySize.set(v.sizeName, { sizeName: v.sizeName, sizeOrder: v.sizeOrder || v.sizeName });
    }
  }

  // Pre-fill from Printavo where labels match (case-insensitive)
  const printavoByLabel = new Map(
    printavoEntries.map((s) => [sizeLabel(s.size).toUpperCase(), s.count || 0]),
  );

  const sizes = [...bySize.values()]
    .map((s) => ({
      ...s,
      prefillQty: printavoByLabel.get(s.sizeName.toUpperCase()) || 0,
    }))
    .sort((a, b) => String(a.sizeOrder).localeCompare(String(b.sizeOrder)));

  // Single-size products (e.g. "Adjustable" caps, OSFA) have nowhere else for
  // the Printavo qty to land — pre-fill that single size to the row's target.
  if (sizes.length === 1 && targetQty > 0) {
    sizes[0].prefillQty = targetQty;
  }

  return { mode: 'ss', sizes, targetQty };
}

// Printavo invoice prices are set at customer-facing rates; we mark up 15% on
// these invoices, so cost ≈ printavoPrice × 0.85. Used only as a fallback for
// rows we can't match to an SS variant (Sanmar, pending, failed).
const PRINTAVO_MARKUP_INVERSE = 0.85;

/**
 * Compute the unit price + line total a row will cost us (SS Activewear) — not
 * what we charge the customer. SS variants carry per-size `customerPrice` (the
 * wholesale cost SS quotes us), so we sum qty × price across the sizes actually
 * ordered and surface a range when those sizes span multiple price tiers
 * (typical for 2XL+ upcharges).
 *
 * Returns `{ unitPriceLabel, total }`:
 *   - matched rows  → SS customerPrice (range if ordered sizes differ)
 *   - other rows    → Printavo price × 0.85 as a markup-inverse approximation
 */
function getRowCost(li, rowSizes, classification, getQty) {
  const matched =
    classification?.state === 'matched' && classification.variants?.length > 0;

  if (matched) {
    const priceBySize = new Map();
    for (const v of classification.variants) {
      if (v?.sizeName != null && typeof v.customerPrice === 'number') {
        priceBySize.set(v.sizeName, v.customerPrice);
      }
    }

    let total = 0;
    let hasAnyOrdered = false;
    const orderedPrices = new Set();
    const allPrices = new Set();
    for (const s of rowSizes.sizes) {
      const price = priceBySize.get(s.sizeName);
      if (price == null) continue;
      allPrices.add(price);
      const qty = getQty(s);
      if (qty > 0) {
        hasAnyOrdered = true;
        orderedPrices.add(price);
        total += qty * price;
      }
    }

    const pricesForLabel = hasAnyOrdered ? orderedPrices : allPrices;
    if (pricesForLabel.size === 0) return { unitPriceLabel: null, total: null };
    const sorted = [...pricesForLabel].sort((a, b) => a - b);
    const unitPriceLabel =
      sorted.length === 1
        ? formatCurrency(sorted[0])
        : `${formatCurrency(sorted[0])}–${formatCurrency(sorted[sorted.length - 1])}`;

    return { unitPriceLabel, total: hasAnyOrdered ? total : null };
  }

  if (li.price == null) return { unitPriceLabel: null, total: null };
  const unitCost = li.price * PRINTAVO_MARKUP_INVERSE;
  const qty = rowSizes.sizes.reduce((sum, s) => sum + getQty(s), 0);
  return {
    unitPriceLabel: formatCurrency(unitCost),
    total: qty > 0 ? unitCost * qty : null,
  };
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

function SourcingCell({ lineItem, result, onAddToCart, onRetry, disabled, disabledReason }) {
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
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          const n = onAddToCart(lineItem, result.variants);
          if (n > 0) {
            setJustAdded(n);
            setTimeout(() => setJustAdded(0), 2000);
          }
        }}
        className="px-3 py-2 sm:py-1 rounded-md text-xs font-semibold transition-opacity"
        style={{
          background: disabled ? 'var(--surface)' : 'var(--accent)',
          color: disabled ? 'var(--muted)' : '#fff',
          border: disabled ? '1px solid var(--border)' : 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.7 : 1,
        }}
        title={disabled ? (disabledReason || 'Not ready') : undefined}
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
      className="px-3 py-2 sm:py-1 rounded-md text-xs font-semibold border border-red-500 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
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

/**
 * Per-row size editor — a CSS grid of (label, input) pairs that align across
 * wrapped rows, plus a status line with running total and a small hint text
 * explaining the "entered / invoice qty" format. Sizes come from getRowSizes()
 * so each row shows only the sizes that apply to its product.
 */
function SizeEditor({ rowSizes, getQty, onChange, status, maxPairs = 4 }) {
  const { sizes, targetQty } = rowSizes;
  const sum = sizes.reduce((acc, s) => acc + getQty(s), 0);

  const statusText =
    status === 'ok' ? `✓ ${sum} / ${targetQty}`
    : status === 'over' ? `⚠ ${sum} / ${targetQty} — ${sum - targetQty} over`
    : status === 'under' ? `· ${sum} / ${targetQty} — ${targetQty - sum} to go`
    : `· ${sum} / ${targetQty}`;
  const statusColor =
    status === 'ok' ? '#16a34a'
    : status === 'over' ? '#dc2626'
    : status === 'under' ? '#ca8a04'
    : 'var(--muted)';

  const pairsPerRow = Math.min(sizes.length, maxPairs);

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="grid items-center gap-x-2 gap-y-1.5 text-xs"
        style={{ gridTemplateColumns: `repeat(${pairsPerRow}, max-content 48px)` }}
      >
        {sizes.map((s) => {
          const val = getQty(s);
          const isPrefilled = val === s.prefillQty && val !== 0;
          return (
            <Fragment key={s.sizeName}>
              <span
                className="font-medium text-right whitespace-nowrap"
                style={{ color: 'var(--muted)' }}
              >
                {s.sizeName}
              </span>
              <input
                type="number"
                min="0"
                value={val}
                onChange={(e) => onChange(s.sizeName, e.target.value)}
                className="w-12 text-center rounded border px-1 py-0.5 text-xs font-medium focus:outline-none focus:ring-2"
                style={{
                  background: isPrefilled ? 'var(--surface)' : 'var(--background)',
                  borderColor: 'var(--border)',
                  color: 'var(--foreground)',
                  '--tw-ring-color': 'var(--accent)',
                }}
              />
            </Fragment>
          );
        })}
      </div>
      <div
        className="text-xs font-semibold w-fit cursor-help"
        style={{ color: statusColor }}
        title="entered / invoice qty"
      >
        {statusText}
      </div>
    </div>
  );
}

function OrderOverview({ lineItemGroups, classifications, onAddToCart, onRetry }) {
  // Per-row, per-size user-entered quantities. Shape: { [lineItemId]: { [sizeName]: qty } }
  // Sparse: a missing entry falls back to the prefill from getRowSizes(), so the user
  // sees Printavo's numbers by default and only overrides change state.
  const [rowQuantities, setRowQuantities] = useState({});

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

  function handleSizeChange(lineItemId, sizeName, value) {
    const parsed = parseInt(value, 10);
    const next = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setRowQuantities((prev) => ({
      ...prev,
      [lineItemId]: { ...(prev[lineItemId] || {}), [sizeName]: next },
    }));
  }

  function getQtyForSize(lineItemId, size) {
    const override = rowQuantities[lineItemId]?.[size.sizeName];
    return override !== undefined ? override : size.prefillQty;
  }

  // Build a snapshot of per-size quantities for handleAddToCart. The cart layer
  // needs the resolved sizes (post-override) keyed by SS sizeName.
  function effectiveLineItem(li, rowSizes) {
    const sizeAllocations = rowSizes.sizes.reduce((acc, s) => {
      acc[s.sizeName] = getQtyForSize(li.id, s);
      return acc;
    }, {});
    return { ...li, sizeAllocations };
  }

  function getLineItemRenderProps(li) {
    const classification = classifications?.get(li.id);
    const rowSizes = getRowSizes(li, classification);
    const qty = rowSizes.sizes.reduce((sum, s) => sum + getQtyForSize(li.id, s), 0);
    const { unitPriceLabel, total: lineTotal } = getRowCost(
      li, rowSizes, classification, (s) => getQtyForSize(li.id, s),
    );
    const status =
      qty === 0 ? 'idle'
      : qty < rowSizes.targetQty ? 'under'
      : qty === rowSizes.targetQty ? 'ok'
      : 'over';
    // Only block add-to-cart when nothing's been allocated yet. Going under
    // or over the invoice qty is allowed — the status indicator surfaces the
    // mismatch but doesn't enforce it (users routinely buy extras as overrun).
    const addDisabled = rowSizes.mode === 'ss' && qty === 0;
    const addDisabledReason = addDisabled ? `Allocate at least 1 across the available sizes` : null;
    return { classification, rowSizes, qty, unitPriceLabel, lineTotal, status, addDisabled, addDisabledReason, effectiveLi: effectiveLineItem(li, rowSizes) };
  }

  return (
    <>
      {/* Mobile card list — hidden at sm+ */}
      <div className="mt-3 flex flex-col gap-2 sm:hidden">
        {allLineItems.map((li) => {
          const { classification, rowSizes, qty, unitPriceLabel, lineTotal, status, addDisabled, addDisabledReason, effectiveLi } = getLineItemRenderProps(li);
          return (
            <div
              key={li.id}
              className="rounded-lg border p-3 flex flex-col gap-2"
              style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs font-medium">{li.itemNumber || '—'}</span>
                <SourcingCell
                  lineItem={effectiveLi}
                  result={classification}
                  onAddToCart={onAddToCart}
                  onRetry={onRetry}
                  disabled={addDisabled}
                  disabledReason={addDisabledReason}
                />
              </div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {[li.color, li.description].filter(Boolean).join(' · ') || '—'}
              </p>
              <SizeEditor
                rowSizes={rowSizes}
                getQty={(s) => getQtyForSize(li.id, s)}
                onChange={(sizeName, v) => handleSizeChange(li.id, sizeName, v)}
                status={status}
                maxPairs={3}
              />
              <div className="flex gap-4 text-xs">
                <span>Qty: <span className="font-semibold">{qty || '—'}</span></span>
                <span>Unit: {unitPriceLabel ?? '—'}</span>
                <span>Total: <span className="font-semibold">{lineTotal != null ? formatCurrency(lineTotal) : '—'}</span></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table — hidden below sm */}
      <div className="mt-3 overflow-x-auto hidden sm:block">
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
              <th className="text-left py-2 px-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                Sizes
              </th>
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
              const { classification, rowSizes, qty, unitPriceLabel, lineTotal, status, addDisabled, addDisabledReason, effectiveLi } = getLineItemRenderProps(li);
              return (
                <tr
                  key={li.id}
                  style={{ borderBottom: '1px solid var(--border)' }}
                  className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <td className="py-2 pr-3 font-mono text-xs font-medium align-top">
                    {li.itemNumber || '—'}
                  </td>
                  <td className="py-2 pr-3 text-xs align-top">
                    {li.color || '—'}
                  </td>
                  <td className="py-2 pr-3 text-xs max-w-[200px] align-top">
                    {li.description || '—'}
                  </td>
                  <td className="py-2 px-3 align-top">
                    <SizeEditor
                      rowSizes={rowSizes}
                      getQty={(s) => getQtyForSize(li.id, s)}
                      onChange={(sizeName, v) => handleSizeChange(li.id, sizeName, v)}
                      status={status}
                    />
                  </td>
                  <td className="py-2 px-2 text-center text-xs font-semibold align-top">
                    {qty || '—'}
                  </td>
                  <td className="py-2 pl-3 text-right text-xs align-top">
                    {unitPriceLabel ?? '—'}
                  </td>
                  <td className="py-2 pl-3 text-right text-xs font-semibold align-top">
                    {lineTotal != null ? formatCurrency(lineTotal) : '—'}
                  </td>
                  <td className="py-2 pl-3 text-right text-xs align-top">
                    <SourcingCell
                      lineItem={effectiveLi}
                      result={classification}
                      onAddToCart={onAddToCart}
                      onRetry={onRetry}
                      disabled={addDisabled}
                      disabledReason={addDisabledReason}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Maps a per-line-item SS classification entry to the `source` value the
 * `/api/orders-partial-state` contract expects.
 *
 *  - `matched`             → 'ss-activewear'  (SS Activewear catalog hit)
 *  - `sanmar` | `no-match` → 'sanmar'         (auto-routed / no SS hit)
 *  - `pending` | `failed`  → 'unresolved-lookup'
 *
 * Callers should skip invoices that have any `pending` classification so the
 * server isn't asked to evaluate before lookups settle.
 */
function classificationToSource(classification) {
  const s = classification?.state;
  if (s === 'matched') return 'ss-activewear';
  if (s === 'sanmar' || s === 'no-match') return 'sanmar';
  return 'unresolved-lookup';
}

/**
 * Drill-down table shown under the partial badge — lists the per-line-item
 * shortfall surfaced by `/api/orders-partial-state`. Mirrors the look of
 * the existing OrderOverview table chrome (Tailwind + CSS-var palette).
 */
function PartialDrilldown({ summary }) {
  const rows = summary?.lineItems || [];
  if (rows.length === 0) {
    return (
      <p className="text-sm italic px-1 py-2" style={{ color: 'var(--muted)' }}>
        No line-item detail available.
      </p>
    );
  }

  const sourceLabel = (src) => {
    if (src === 'ss-activewear') return 'SS Activewear';
    if (src === 'sanmar') return 'Sanmar — Auto Order';
    return 'Lookup pending';
  };

  return (
    <>
      {/* Mobile cards — hidden at sm+ */}
      <div className="mt-2 flex flex-col gap-2 sm:hidden">
        {rows.map((li) => (
          <div
            key={li.sourceLineItemId}
            className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border p-2.5 text-xs"
            style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
          >
            <span>
              <span className="font-mono font-medium">{li.sku || '—'}</span>
              {li.description && (
                <span style={{ color: 'var(--muted)' }}> · {li.description}</span>
              )}
            </span>
            <span className="text-right" style={{ color: 'var(--muted)' }}>
              {sourceLabel(li.source)}
            </span>
            <span style={{ color: 'var(--muted)' }}>
              Ordered: <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{li.alreadyOrdered ?? 0}</span>
            </span>
            <span className="text-right" style={{ color: 'var(--muted)' }}>
              Needed: <span
                className="font-semibold"
                style={{ color: (li.stillNeeded || 0) > 0 ? '#ca8a04' : 'var(--foreground)' }}
              >{li.stillNeeded ?? 0}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Desktop table — hidden below sm */}
      <div className="mt-2 overflow-x-auto hidden sm:block">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th className="text-left py-2 pr-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                Line
              </th>
              <th className="text-left py-2 px-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                Source
              </th>
              <th className="text-right py-2 px-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                Already Ordered
              </th>
              <th className="text-right py-2 pl-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                Still Needed
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((li) => (
              <tr
                key={li.sourceLineItemId}
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <td className="py-2 pr-3 text-xs align-top">
                  <span className="font-mono font-medium">{li.sku || '—'}</span>
                  {li.description ? (
                    <span style={{ color: 'var(--muted)' }}> · {li.description}</span>
                  ) : null}
                </td>
                <td className="py-2 px-3 text-xs align-top" style={{ color: 'var(--muted)' }}>
                  {sourceLabel(li.source)}
                </td>
                <td className="py-2 px-3 text-xs text-right align-top font-semibold">
                  {li.alreadyOrdered ?? 0}
                </td>
                <td
                  className="py-2 pl-3 text-xs text-right align-top font-semibold"
                  style={{ color: (li.stillNeeded || 0) > 0 ? '#ca8a04' : 'var(--muted)' }}
                >
                  {li.stillNeeded ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function InvoiceCard({ invoice, classifications, partialState, onRetryPartialState, onAddToCart, onRetry }) {
  const [expanded, setExpanded] = useState(false);
  const [partialOpen, setPartialOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const onAddToCartBound = useCallback(
    (lineItem, variants) => onAddToCart(invoice, lineItem, variants),
    [invoice, onAddToCart],
  );

  const handlePartialRetry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetryPartialState(invoice);
    } finally {
      setRetrying(false);
    }
  }, [invoice, onRetryPartialState, retrying]);

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

        {/* Partial-state badge (FR-013/FR-014/FR-015/FR-020) */}
        {partialState?.state === 'partial' && partialState.partialItemsSummary && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setPartialOpen((v) => !v)}
              aria-expanded={partialOpen}
              className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-90"
              style={{
                background: '#ca8a04',
                color: '#fff',
                border: '1px solid #a16207',
              }}
            >
              <span>
                Partial — {partialState.partialItemsSummary.totalItemsStillNeeded} item
                {partialState.partialItemsSummary.totalItemsStillNeeded === 1 ? '' : 's'} still need ordering
              </span>
              <span
                className="transition-transform duration-200"
                style={{ display: 'inline-block', transform: partialOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                ▾
              </span>
            </button>
            {partialOpen && (
              <div
                className="rounded-lg p-3"
                style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
              >
                <PartialDrilldown summary={partialState.partialItemsSummary} />
              </div>
            )}
          </div>
        )}
        {partialState?.state === 'unavailable' && (
          <div
            className="flex items-center gap-3 self-start px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{
              background: 'var(--surface)',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
            }}
            title={partialState.unavailableMessage || partialState.unavailableReason || 'Lookup failed'}
          >
            <span>Partial status unavailable</span>
            <button
              type="button"
              onClick={handlePartialRetry}
              disabled={retrying}
              className="px-2 py-0.5 rounded text-xs font-semibold transition-opacity disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}

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

/**
 * Build the `/api/orders-partial-state` request body for one invoice.
 * Returns null when the invoice has no usable line items or any of its
 * classifications are still pending — the caller should skip those.
 */
function buildPartialStateRequestEntry(invoice, classifications) {
  const groups = invoice.lineItemGroups?.nodes || [];
  const lineItems = groups.flatMap((g) => g.lineItems?.nodes || []);
  if (lineItems.length === 0) return null;

  const payloadLines = [];
  for (const li of lineItems) {
    const classification = classifications.get(li.id);
    // Gate: skip whole invoice if any line is still pending (or hasn't been
    // classified yet). Failed lookups DO resolve — they map to `unresolved-lookup`.
    if (!classification || classification.state === 'pending') return null;

    const sizeSum = (li.sizes || []).reduce((acc, s) => acc + (s.count || 0), 0);
    const invoiceQty = li.items != null ? li.items : sizeSum;

    payloadLines.push({
      sourceLineItemId: li.id,
      sku: li.itemNumber || '',
      description: li.description || '',
      invoiceQty,
      source: classificationToSource(classification),
    });
  }

  if (payloadLines.length === 0) return null;

  return {
    sourceInvoiceId: invoice.id,
    sourceInvoiceVisualId: invoice.visualId,
    lineItems: payloadLines,
  };
}

export default function OrdersPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  // Map keyed by sourceInvoiceVisualId → per-invoice partial-state result
  // from /api/orders-partial-state. Updated in batch after invoices+
  // classifications resolve, or per-invoice on manual retry.
  const [partialStateByInvoiceId, setPartialStateByInvoiceId] = useState(() => new Map());

  // Flatten every line item across every loaded invoice into a single list for batch lookup
  const allLineItems = useMemo(
    () =>
      invoices.flatMap((inv) =>
        (inv.lineItemGroups?.nodes || []).flatMap((g) => g.lineItems?.nodes || []),
      ),
    [invoices],
  );
  const { classifications, retry } = useLineItemClassification(allLineItems);

  // Batch partial-state lookup. Fires once per (invoices, classifications) pair —
  // specifically when every line item across every invoice has a non-pending
  // classification (matched | sanmar | no-match | failed). One POST carries the
  // whole batch; per-invoice retries take a separate path (handlePartialStateRetry).
  useEffect(() => {
    if (invoices.length === 0) return;

    const requestInvoices = [];
    for (const inv of invoices) {
      const entry = buildPartialStateRequestEntry(inv, classifications);
      if (entry) requestInvoices.push(entry);
    }

    // Not every invoice is ready yet — bail out, the effect re-runs as
    // classifications populate.
    if (requestInvoices.length !== invoices.length) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/orders-partial-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoices: requestInvoices }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          // Treat the whole batch as unavailable so each card shows a retry button.
          setPartialStateByInvoiceId(() => {
            const next = new Map();
            for (const inv of requestInvoices) {
              next.set(inv.sourceInvoiceVisualId, {
                sourceInvoiceVisualId: inv.sourceInvoiceVisualId,
                state: 'unavailable',
                partialItemsSummary: null,
                unavailableReason: 'batch-request-failed',
                unavailableMessage: data?.error || `HTTP ${res.status}`,
              });
            }
            return next;
          });
          return;
        }
        setPartialStateByInvoiceId(() => {
          const next = new Map();
          for (const r of data.results || []) {
            next.set(r.sourceInvoiceVisualId, r);
          }
          return next;
        });
      } catch (err) {
        if (cancelled) return;
        setPartialStateByInvoiceId(() => {
          const next = new Map();
          for (const inv of requestInvoices) {
            next.set(inv.sourceInvoiceVisualId, {
              sourceInvoiceVisualId: inv.sourceInvoiceVisualId,
              state: 'unavailable',
              partialItemsSummary: null,
              unavailableReason: 'batch-request-failed',
              unavailableMessage: err.message,
            });
          }
          return next;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [invoices, classifications]);

  // Manual retry — re-POSTs a single invoice (the route accepts an array;
  // we pass a one-element array) and updates only that invoice's map entry.
  const handlePartialStateRetry = useCallback(
    async (invoice) => {
      const entry = buildPartialStateRequestEntry(invoice, classifications);
      if (!entry) return;
      try {
        const res = await fetch('/api/orders-partial-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoices: [entry] }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setPartialStateByInvoiceId((prev) => {
            const next = new Map(prev);
            next.set(invoice.visualId, {
              sourceInvoiceVisualId: invoice.visualId,
              state: 'unavailable',
              partialItemsSummary: null,
              unavailableReason: 'batch-request-failed',
              unavailableMessage: data?.error || `HTTP ${res.status}`,
            });
            return next;
          });
          return;
        }
        const result = (data.results || []).find(
          (r) => r.sourceInvoiceVisualId === invoice.visualId,
        );
        if (!result) return;
        setPartialStateByInvoiceId((prev) => {
          const next = new Map(prev);
          next.set(invoice.visualId, result);
          return next;
        });
      } catch (err) {
        setPartialStateByInvoiceId((prev) => {
          const next = new Map(prev);
          next.set(invoice.visualId, {
            sourceInvoiceVisualId: invoice.visualId,
            state: 'unavailable',
            partialItemsSummary: null,
            unavailableReason: 'batch-request-failed',
            unavailableMessage: err.message,
          });
          return next;
        });
      }
    },
    [classifications],
  );

  const { cart, addItem } = useCart();
  const cartTotals = totals(cart);

  // Expand a Printavo line item into one CartItem per (size, color) variant.
  // The OrderOverview component computes per-SS-size quantities (allowing for
  // hat sizes like S/M, L/XL, etc.) and attaches them as lineItem.sizeAllocations.
  const handleAddToCart = useCallback(
    (invoice, lineItem, variants) => {
      let added = 0;
      const allocations = lineItem.sizeAllocations || {};

      const findVariant = (sizeName) =>
        variants.find(
          (v) =>
            (v.sizeName || '').trim().toUpperCase() === sizeName.toUpperCase() &&
            (v.colorName || '').trim().toLowerCase() === (lineItem.color || '').trim().toLowerCase(),
        );

      for (const [sizeName, qty] of Object.entries(allocations)) {
        if (!(qty > 0)) continue;
        const variant = findVariant(sizeName);
        if (!variant) {
          console.warn('[orders] no SS variant for', lineItem.itemNumber, sizeName, lineItem.color);
          continue;
        }
        addItem({
          sku: variant.sku,
          styleNumber: lineItem.itemNumber,
          styleName: variant.styleName,
          brandName: variant.brandName,
          color: variant.colorName || lineItem.color,
          size: variant.sizeName,
          qty,
          unitPrice: variant.customerPrice ?? 0,
          sourceInvoiceId: invoice.id,
          sourceInvoiceVisualId: invoice.visualId,
          sourceLineItemId: lineItem.id,
          addedAt: new Date().toISOString(),
        });
        added += qty;
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
          <p className="text-sm mt-1">Invoices with &ldquo;Ready to Order&rdquo; status will appear here.</p>
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
              partialState={partialStateByInvoiceId.get(invoice.visualId)}
              onRetryPartialState={handlePartialStateRetry}
              onAddToCart={handleAddToCart}
              onRetry={retry}
            />
          ))}
        </div>
      )}
    </div>
  );
}
