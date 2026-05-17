'use client';

import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { totals } from '@/lib/cart';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount ?? 0);
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
          Add items from the orders page to build a consolidated SS Activewear order.
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
            Cart
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {itemCount} item{itemCount === 1 ? '' : 's'} across {lineCount} line{lineCount === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href="/orders"
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
        💡 <strong style={{ color: 'var(--foreground)' }}>Wholesale pricing</strong> — Unit prices shown are your S&amp;S Activewear cost to purchase the blank garments. These are not the prices charged to your customer.
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead style={{ borderBottom: '2px solid var(--border)' }}>
            <tr>
              <th className="text-left py-3 px-4 text-xs uppercase tracking-wide font-semibold" style={{ color: 'var(--muted)' }}>Item</th>
              <th className="text-left py-3 px-4 text-xs uppercase tracking-wide font-semibold" style={{ color: 'var(--muted)' }}>Size / Color</th>
              <th className="text-center py-3 px-4 text-xs uppercase tracking-wide font-semibold" style={{ color: 'var(--muted)' }}>Qty</th>
              <th className="text-right py-3 px-4 text-xs uppercase tracking-wide font-semibold" style={{ color: 'var(--muted)' }}>Unit</th>
              <th className="text-right py-3 px-4 text-xs uppercase tracking-wide font-semibold" style={{ color: 'var(--muted)' }}>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cart.items.map((item) => (
              <tr key={item.sku} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="py-3 px-4">
                  <div className="font-medium">{item.brandName} {item.styleNumber}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>{item.styleName}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    From invoice #{item.sourceInvoiceVisualId}
                  </div>
                </td>
                <td className="py-3 px-4 text-xs">
                  <div>{item.size}</div>
                  <div style={{ color: 'var(--muted)' }}>{item.color}</div>
                </td>
                <td className="py-3 px-4 text-center">
                  <input
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={(e) => setQty(item.sku, parseInt(e.target.value, 10) || 0)}
                    className="w-16 px-2 py-1 rounded border text-center text-sm"
                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  />
                </td>
                <td className="py-3 px-4 text-right text-xs">{formatCurrency(item.unitPrice)}</td>
                <td className="py-3 px-4 text-right text-xs font-semibold">{formatCurrency((item.unitPrice || 0) * item.qty)}</td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => removeItem(item.sku)}
                    aria-label={`Remove ${item.sku}`}
                    className="text-sm hover:text-red-600 transition-colors"
                    style={{ color: 'var(--muted)' }}
                    title="Remove"
                  >
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className="flex items-center justify-between mt-6 flex-wrap gap-4">
        <div className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
          Total: <span style={{ color: 'var(--accent)' }}>{formatCurrency(grandTotal)}</span>
        </div>
        <Link
          href="/orders/checkout"
          className="px-6 py-3 rounded-lg font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          Continue to Checkout →
        </Link>
      </div>
    </div>
  );
}
