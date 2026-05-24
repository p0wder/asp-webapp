'use client';

import { useEffect, useState } from 'react';

const STATUS_COLORS = {
  default: { bg: 'rgba(0,255,102,0.1)', text: '#00FF66', border: 'rgba(0,255,102,0.3)' },
  muted:   { bg: 'var(--surface)',      text: 'var(--muted)', border: 'var(--border)' },
};

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);
}

function StatusBadge({ name, color }) {
  const bg = color ? `${color}22` : STATUS_COLORS.default.bg;
  const fg = color || STATUS_COLORS.default.text;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      background: bg,
      color: fg,
      border: `1px solid ${fg}44`,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}>
      {name || 'Unknown'}
    </span>
  );
}

function QuoteCard({ quote }) {
  const customerName = quote.contact?.fullName || '—';
  const email = quote.contact?.email || '';

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '1rem 1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', marginBottom: 2 }}>
            {quote.nickname || '(no job name)'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {customerName}{email ? ` · ${email}` : ''}
          </div>
        </div>
        <StatusBadge name={quote.status?.name} color={quote.status?.color} />
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
        <span>Quote <strong style={{ color: 'var(--foreground)' }}>#{quote.visualId}</strong></span>
        <span>Submitted <strong style={{ color: 'var(--foreground)' }}>{formatDate(quote.createdAt)}</strong></span>
        {quote.customerDueAt && (
          <span>Due <strong style={{ color: 'var(--foreground)' }}>{formatDate(quote.customerDueAt)}</strong></span>
        )}
        {quote.total != null && (
          <span>Est. <strong style={{ color: 'var(--foreground)' }}>{formatCurrency(quote.total)}</strong></span>
        )}
      </div>

      {/* Actions */}
      {quote.publicUrl && (
        <div style={{ marginTop: 4 }}>
          <a
            href={quote.publicUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 12,
              color: '#00FF66',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Open in Printavo →
          </a>
        </div>
      )}
    </div>
  );
}

export default function QuotesDashboard() {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    fetch('/api/quotes')
      .then((r) => {
        if (r.status === 401) throw new Error('Unauthorized — please log in.');
        if (!r.ok) throw new Error('Failed to load quotes.');
        return r.json();
      })
      .then((data) => { setQuotes(data.quotes || []); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const statuses = ['All', ...Array.from(new Set(quotes.map((q) => q.status?.name).filter(Boolean)))];

  const visible = filter === 'All'
    ? quotes
    : quotes.filter((q) => q.status?.name === filter);

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem' };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 4px' }}>
          Quote Pipeline
        </h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
          All open quotes from Printavo — click any quote to open it in Printavo for full details.
        </p>
      </div>

      {loading && (
        <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>
          Loading quotes…
        </div>
      )}

      {error && (
        <div style={{ ...card, border: '1px solid #ff4444', color: '#ff4444', padding: '1rem 1.25rem' }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Status filter tabs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  border: filter === s ? '1px solid #00FF66' : '1px solid var(--border)',
                  background: filter === s ? 'rgba(0,255,102,0.1)' : 'var(--surface)',
                  color: filter === s ? '#00FF66' : 'var(--muted)',
                  transition: 'all 0.15s',
                }}
              >
                {s}
                {s === 'All'
                  ? ` (${quotes.length})`
                  : ` (${quotes.filter((q) => q.status?.name === s).length})`}
              </button>
            ))}
          </div>

          {/* Quote list */}
          {visible.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>
              {filter === 'All' ? 'No open quotes found.' : `No quotes with status "${filter}".`}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visible.map((q) => <QuoteCard key={q.id} quote={q} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
