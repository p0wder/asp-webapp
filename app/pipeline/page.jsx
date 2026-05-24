'use client';

import { useEffect, useState, useRef } from 'react';

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

// Pinned quote-stage filter tabs shown before the dynamic ones.
const PINNED_TABS = [
  { label: 'Needs Approval', matches: ['quote approval sent', 'urgent follow up on quote'] },
  { label: 'Quote Approved', matches: ['quote approved'] },
  { label: 'Open Quotes',    matches: ['quote'] },
];

function quoteMatchesPinnedTab(quote, tab) {
  const name = (quote.status?.name || '').toLowerCase();
  return tab.matches.some((m) => name.includes(m));
}

function QuoteApprovalLink({ quoteId }) {
  const [copied, setCopied] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(null);

  async function fetchAndCopy() {
    setFetching(true);
    setError(null);
    try {
      const res = await fetch(`/api/quote-approval-link?id=${encodeURIComponent(quoteId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate link');
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  return (
    <div style={{ marginTop: 2 }}>
      <button
        onClick={fetchAndCopy}
        disabled={fetching}
        style={{ fontSize: 12, color: copied ? '#00FF66' : 'var(--muted)', background: 'none', border: 'none', cursor: fetching ? 'wait' : 'pointer', padding: 0, fontFamily: 'inherit', textDecoration: 'underline', opacity: fetching ? 0.6 : 1 }}
      >
        {fetching ? 'Generating…' : copied ? 'Approval link copied!' : 'Copy customer approval link'}
      </button>
      {error && <span style={{ fontSize: 11, color: '#ff4444', marginLeft: 6 }}>{error}</span>}
    </div>
  );
}

function ProofUpload({ quoteId }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [approvalLink, setApprovalLink] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef();

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setApprovalLink(null);
    try {
      const uploadRes = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        body: file,
      });
      if (!uploadRes.ok) throw new Error('Upload failed');
      const { url: proofUrl } = await uploadRes.json();

      const proofRes = await fetch('/api/proof-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: quoteId, proofUrl }),
      });
      if (!proofRes.ok) throw new Error('Failed to generate approval link');
      const data = await proofRes.json();
      setApprovalLink(data.approvalLink);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(approvalLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', textDecoration: 'underline' }}
      >
        {open ? 'Hide proof upload ↑' : 'Upload proof ↓'}
      </button>

      {open && (
        <div style={{ marginTop: 8, padding: '0.75rem', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{ padding: '6px 14px', fontSize: 12, borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground)', cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: uploading ? 0.6 : 1 }}
          >
            {uploading ? 'Uploading…' : 'Choose file (image / PDF)'}
          </button>

          {error && (
            <p style={{ fontSize: 12, color: '#ff4444', margin: '6px 0 0' }}>{error}</p>
          )}

          {approvalLink && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer approval link</p>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  readOnly
                  value={approvalLink}
                  style={{ flex: 1, fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)', fontFamily: 'monospace', minWidth: 0 }}
                />
                <button
                  onClick={copyLink}
                  style={{ padding: '5px 12px', fontSize: 11, borderRadius: 6, background: copied ? '#00FF66' : 'var(--surface)', border: '1px solid var(--border)', color: copied ? '#000' : 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', fontWeight: 600 }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuoteCard({ quote, allStatuses, onStatusUpdate }) {
  const customerName = quote.contact?.fullName || '—';
  const email = quote.contact?.email || '';
  const [statusOpen, setStatusOpen] = useState(false);
  const [selectedStatusId, setSelectedStatusId] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(null);

  async function handleStatusUpdate() {
    if (!selectedStatusId) return;
    setUpdating(true);
    setUpdateError(null);
    try {
      const res = await fetch('/api/quote-status-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.id, statusId: selectedStatusId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      onStatusUpdate(quote.id, data.status);
      setStatusOpen(false);
      setSelectedStatusId('');
    } catch (err) {
      setUpdateError(err.message);
    } finally {
      setUpdating(false);
    }
  }

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {quote.publicUrl && (
          <div>
            <a
              href={quote.publicUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, color: '#00FF66', textDecoration: 'none', fontWeight: 600 }}
            >
              Open in Printavo →
            </a>
          </div>
        )}

        {PINNED_TABS[0].matches.some((m) => (quote.status?.name || '').toLowerCase().includes(m)) && (
          <QuoteApprovalLink quoteId={quote.id} />
        )}

        <ProofUpload quoteId={quote.id} />

        {/* Inline status update */}
        <div style={{ marginTop: 2 }}>
          <button
            onClick={() => { setStatusOpen((v) => !v); setUpdateError(null); }}
            style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', textDecoration: 'underline' }}
          >
            {statusOpen ? 'Cancel status update ↑' : 'Update status ↓'}
          </button>

          {statusOpen && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={selectedStatusId}
                onChange={(e) => setSelectedStatusId(e.target.value)}
                style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontFamily: 'inherit' }}
              >
                <option value="">— pick status —</option>
                {allStatuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={handleStatusUpdate}
                disabled={!selectedStatusId || updating}
                style={{ padding: '5px 14px', fontSize: 12, borderRadius: 6, background: '#00FF66', color: '#000', border: 'none', fontWeight: 700, cursor: (!selectedStatusId || updating) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: (!selectedStatusId || updating) ? 0.5 : 1 }}
              >
                {updating ? 'Saving…' : 'Confirm'}
              </button>
              {updateError && (
                <span style={{ fontSize: 11, color: '#ff4444' }}>{updateError}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function QuotesDashboard() {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('Needs Approval');

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

  // Derive unique statuses from quotes for the status picker
  const allStatuses = Array.from(
    new Map(
      quotes
        .filter((q) => q.status?.id && q.status?.name)
        .map((q) => [q.status.id, { id: q.status.id, name: q.status.name }])
    ).values()
  );

  function handleStatusUpdate(quoteId, newStatus) {
    setQuotes((prev) =>
      prev.map((q) => q.id === quoteId ? { ...q, status: newStatus || q.status } : q)
    );
  }

  // Build tab list: pinned tabs first, then "All"
  const tabs = [
    ...PINNED_TABS.map((tab) => ({
      label: tab.label,
      count: quotes.filter((q) => quoteMatchesPinnedTab(q, tab)).length,
      filter: tab.label,
    })),
    { label: 'All', count: quotes.length, filter: 'All' },
  ];

  const visible = filter === 'All'
    ? quotes
    : quotes.filter((q) => {
        const tab = PINNED_TABS.find((t) => t.label === filter);
        return tab ? quoteMatchesPinnedTab(q, tab) : true;
      });

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
            {tabs.map(({ label, count, filter: tabFilter }) => (
              <button
                key={label}
                onClick={() => setFilter(tabFilter)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  border: filter === tabFilter ? '1px solid #00FF66' : '1px solid var(--border)',
                  background: filter === tabFilter ? 'rgba(0,255,102,0.1)' : 'var(--surface)',
                  color: filter === tabFilter ? '#00FF66' : 'var(--muted)',
                  transition: 'all 0.15s',
                }}
              >
                {label} ({count})
              </button>
            ))}
          </div>

          {/* Quote list */}
          {visible.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>
              {filter === 'All' ? 'No open quotes found.' : `No quotes in "${filter}".`}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visible.map((q) => (
                <QuoteCard
                  key={q.id}
                  quote={q}
                  allStatuses={allStatuses}
                  onStatusUpdate={handleStatusUpdate}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
