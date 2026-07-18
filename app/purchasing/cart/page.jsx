'use client';

import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { totals } from '@/lib/cart';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount ?? 0);
}

function VendorBadge({ vendor }) {
  const label = vendor === 'sanmar' ? 'SanMar' : 'S&S Activewear';
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--muted)' }}
    >
      {label}
    </span>
  );
}

export default function CartPage() {
  const { cart, removeItem, setQty } = useCart();
  const { itemCount, lineCount, grandTotal } = totals(cart);

  if (lineCount === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">🛒</div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
          Your cart is empty
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
          Add items from the orders page to build a consolidated order.
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
            Cart
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {itemCount} item{itemCount === 1 ? '' : 's'} across {lineCount} line{lineCount === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href="/purchasing"
          className="text-sm font-medium hover:underline"
          style={{ color: 'var(--muted)' }}
        >
          ← Back to orders
        </Link>
      </div>

      <div
        className="rounded-lg px-4 py-3 mb-4 text-sm"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
      >
        💡 <strong style={{ color: 'var(--foreground)' }}>Wholesale pricing</strong> — Unit prices shown are your vendor cost to purchase the blank garments (S&amp;S Activewear or SanMar, per item). These are not the prices charged to your customer.
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        {cart.items.map((item, idx) => (
          <div
            key={`${item.vendor}-${item.sku}-${item.sourceInvoiceId}`}
            className="px-4 py-4 flex flex-col gap-2"
            style={{ borderBottom: idx < cart.items.length - 1 ? '1px solid var(--border)' : 'none' }}
          >
            {/* Top row: item info + remove */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <div className="font-medium text-sm">{item.brandName} {item.styleNumber}</div>
                  <VendorBadge vendor={item.vendor} />
                </div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>{item.styleName}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>From invoice #{item.sourceInvoiceVisualId}</div>
              </div>
              <button
                type="button"
                onClick={() => removeItem(item.sku, item.vendor, item.sourceInvoiceId)}
                aria-label={`Remove ${item.sku}`}
                className="text-sm hover:text-red-600 transition-colors flex-shrink-0"
                style={{ color: 'var(--muted)' }}
                title="Remove"
              >
                🗑
              </button>
            </div>
            {/* Bottom row: size/color, qty input, price */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                {item.size} / {item.color}
              </div>
              <div className="flex items-center gap-3 ml-auto">
                <input
                  type="number"
                  min="1"
                  value={item.qty}
                  onChange={(e) => setQty(item.sku, item.vendor, item.sourceInvoiceId, parseInt(e.target.value, 10) || 0)}
                  className="w-16 px-2 py-1 rounded border text-center text-sm"
                  style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
                <div className="text-xs text-right">
                  <div style={{ color: 'var(--muted)' }}>{formatCurrency(item.unitPrice)} ea</div>
                  <div className="font-semibold">{formatCurrency((item.unitPrice || 0) * item.qty)}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-6 flex-wrap gap-4">
        <div className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
          Total: <span style={{ color: 'var(--accent)' }}>{formatCurrency(grandTotal)}</span>
        </div>
        <Link
          href="/purchasing/checkout"
          className="px-6 py-3 rounded-lg font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          Continue to Checkout →
        </Link>
      </div>
    </div>
  );
}
