'use client';

import { useEffect, useState } from 'react';

const PRINTAVO_BASE = 'https://www.printavo.com/orders';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount ?? 0);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function PaidBadge({ paidInFull, amountPaid, amountOutstanding }) {
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

function InvoiceCard({ invoice }) {
  const customerName =
    invoice.contact?.fullName?.trim() ||
    [invoice.contact?.firstName, invoice.contact?.lastName].filter(Boolean).join(' ') ||
    invoice.contact?.email ||
    'Unknown Customer';

  const printavoUrl = `${PRINTAVO_BASE}/${invoice.visualId}`;

  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-3 shadow-sm"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <a
            href={printavoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg font-bold hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            #{invoice.visualId}
          </a>
          {invoice.nickname && (
            <span className="ml-2 text-sm" style={{ color: 'var(--muted)' }}>
              {invoice.nickname}
            </span>
          )}
        </div>
        <PaidBadge
          paidInFull={invoice.paidInFull}
          amountPaid={invoice.amountPaid}
          amountOutstanding={invoice.amountOutstanding}
        />
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

      {/* View in Printavo */}
      <div className="mt-1">
        <a
          href={printavoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium hover:underline"
          style={{ color: 'var(--muted)' }}
        >
          View in Printavo →
        </a>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

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
            <InvoiceCard key={invoice.id} invoice={invoice} />
          ))}
        </div>
      )}
    </div>
  );
}
