'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isExpired(code) {
  if (!code.expiresAt) return false;
  return new Date().toISOString() > code.expiresAt;
}

function isExhausted(code) {
  if (code.maxUses === null) return false;
  return code.useCount >= code.maxUses;
}

function isActive(code) {
  return code.enabled && !isExpired(code) && !isExhausted(code);
}

function downloadCSV(rows, filename) {
  const header = ['Name', 'Company', 'Email', 'Phone', 'Created'];
  const body = rows.map((r) =>
    [r.name, r.companyName, r.email, r.phone, fmtDate(r.createdAt)]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = [header.join(','), ...body].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="text-xs px-2 py-1 rounded border"
      style={{ borderColor: 'var(--border)', color: copied ? '#00FF66' : 'var(--muted)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

function Badge({ children, color }) {
  const colors = {
    green: { background: 'rgba(0,255,102,0.12)', color: '#00FF66' },
    red: { background: 'rgba(255,68,68,0.12)', color: '#ff4444' },
    gray: { background: 'rgba(128,128,128,0.12)', color: 'var(--muted)' },
  };
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={colors[color] || colors.gray}>
      {children}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PromoCodesPage() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showExpired, setShowExpired] = useState(false);

  // Create form
  const [form, setForm] = useState({ code: '', type: 'percent', value: '', expiresAt: '', maxUses: '' });
  const [formError, setFormError] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  // Customers panel
  const [showCustomers, setShowCustomers] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedPromoForLink, setSelectedPromoForLink] = useState('');

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/promo-codes');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load codes');
      setCodes(data.codes || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.code.trim()) return setFormError('Code is required');
    const numValue = Number(form.value);
    if (!numValue || numValue <= 0) return setFormError('Value must be a positive number');
    if (form.type === 'percent' && numValue > 100) return setFormError('Percent cannot exceed 100');

    setFormSaving(true);
    try {
      const res = await fetch('/api/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code.trim(),
          type: form.type,
          value: numValue,
          expiresAt: form.expiresAt || null,
          maxUses: form.maxUses ? Number(form.maxUses) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create code');
      setForm({ code: '', type: 'percent', value: '', expiresAt: '', maxUses: '' });
      await fetchCodes();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setFormSaving(false);
    }
  };

  const toggleEnabled = async (code) => {
    try {
      await fetch(`/api/promo-codes/${code.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !code.enabled }),
      });
      await fetchCodes();
    } catch {
      // Non-fatal — table will re-sync on next load
    }
  };

  const handleDelete = async (code) => {
    if (!confirm(`Delete code "${code.code}"? This cannot be undone.`)) return;
    try {
      await fetch(`/api/promo-codes/${code.id}`, { method: 'DELETE' });
      await fetchCodes();
    } catch {
      // Non-fatal
    }
  };

  const loadCustomers = async () => {
    setCustomersLoading(true);
    setCustomersError('');
    try {
      const res = await fetch('/api/printavo-customers?page=1');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load customers');
      setCustomers(data.customers || []);
    } catch (e) {
      setCustomersError(e.message);
    } finally {
      setCustomersLoading(false);
    }
  };

  const filteredCustomers = customers.filter((c) => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.companyName?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });

  const activeCodes = codes.filter(isActive);
  const inactiveCodes = codes.filter((c) => !isActive(c));

  const campaignLink = selectedPromoForLink
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/quote?promo=${encodeURIComponent(selectedPromoForLink)}`
    : '';

  // ── Styles ──
  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' };
  const label = { display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 5 };
  const input = { width: '100%', height: 38, padding: '8px 10px', fontSize: 13, background: '#F8F7F5', border: '1px solid var(--border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box', color: '#1E0033', fontFamily: 'inherit' };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'inherit' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 4px' }}>Promotions</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>Create and manage discount codes for customer quotes.</p>
        </div>
        <a
          href="/purchasing"
          style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px' }}
        >
          ← Purchasing
        </a>
      </div>

      {/* Create new code */}
      <div style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 1.25rem' }}>Create new promo code</h2>
        <form onSubmit={handleCreate} noValidate>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={label}>Code *</label>
              <input
                style={input}
                placeholder="SUMMER25"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                required
              />
            </div>
            <div>
              <label style={label}>Type *</label>
              <select style={input} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="percent">% off</option>
                <option value="fixed">$ off</option>
              </select>
            </div>
            <div>
              <label style={label}>Amount *</label>
              <input
                style={input}
                type="number"
                min="0.01"
                step="0.01"
                placeholder={form.type === 'percent' ? '10' : '5.00'}
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                required
              />
            </div>
            <div>
              <label style={label}>Expires</label>
              <input
                style={{ ...input, colorScheme: 'light' }}
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              />
            </div>
            <div>
              <label style={label}>Max uses</label>
              <input
                style={input}
                type="number"
                min="1"
                placeholder="Unlimited"
                value={form.maxUses}
                onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
              />
            </div>
          </div>
          {formError && <p style={{ fontSize: 12, color: '#ff4444', margin: '0 0 10px' }}>{formError}</p>}
          <button
            type="submit"
            disabled={formSaving}
            style={{ padding: '10px 28px', borderRadius: 50, background: '#00FF66', border: 'none', color: '#000', fontWeight: 700, fontSize: 14, cursor: formSaving ? 'not-allowed' : 'pointer', opacity: formSaving ? 0.6 : 1, fontFamily: 'inherit' }}
          >
            {formSaving ? 'Creating…' : 'Create code'}
          </button>
        </form>
      </div>

      {/* Active codes table */}
      <div style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 1rem' }}>
          Active codes <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--muted)' }}>({activeCodes.length})</span>
        </h2>

        {loading && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>}
        {error && <p style={{ fontSize: 13, color: '#ff4444' }}>{error}</p>}

        {!loading && activeCodes.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>No active promo codes yet.</p>
        )}

        {!loading && activeCodes.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Code', 'Discount', 'Expires', 'Uses', 'Status', 'Campaign link', 'Actions'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeCodes.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 10px', fontWeight: 700, color: 'var(--foreground)', fontFamily: 'monospace' }}>{c.code}</td>
                    <td style={{ padding: '10px 10px', color: 'var(--foreground)' }}>
                      {c.type === 'percent' ? `${c.value}% off` : fmt(c.value) + ' off'}
                    </td>
                    <td style={{ padding: '10px 10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(c.expiresAt)}</td>
                    <td style={{ padding: '10px 10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {c.useCount} / {c.maxUses ?? '∞'}
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <Badge color="green">Active</Badge>
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <CopyButton
                        label="Copy link"
                        text={`${typeof window !== 'undefined' ? window.location.origin : ''}/quote?promo=${encodeURIComponent(c.code)}`}
                      />
                    </td>
                    <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={() => toggleEnabled(c)}
                        style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', marginRight: 6, fontFamily: 'inherit' }}
                      >
                        Disable
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        style={{ fontSize: 12, color: '#ff4444', background: 'none', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expired / disabled codes */}
      {inactiveCodes.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={() => setShowExpired((v) => !v)}
            style={{ fontSize: 13, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}
          >
            <span>{showExpired ? '▾' : '▸'}</span>
            Expired / disabled codes ({inactiveCodes.length})
          </button>

          {showExpired && (
            <div style={{ ...card, marginBottom: 0, opacity: 0.8 }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Code', 'Discount', 'Expires', 'Uses', 'Status', 'Actions'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inactiveCodes.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 10px', fontWeight: 700, color: 'var(--muted)', fontFamily: 'monospace' }}>{c.code}</td>
                        <td style={{ padding: '10px 10px', color: 'var(--muted)' }}>
                          {c.type === 'percent' ? `${c.value}% off` : fmt(c.value) + ' off'}
                        </td>
                        <td style={{ padding: '10px 10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(c.expiresAt)}</td>
                        <td style={{ padding: '10px 10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {c.useCount} / {c.maxUses ?? '∞'}
                        </td>
                        <td style={{ padding: '10px 10px' }}>
                          {!c.enabled ? <Badge color="gray">Disabled</Badge>
                            : isExpired(c) ? <Badge color="red">Expired</Badge>
                            : <Badge color="red">Exhausted</Badge>}
                        </td>
                        <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                          {!c.enabled && (
                            <button
                              type="button"
                              onClick={() => toggleEnabled(c)}
                              style={{ fontSize: 12, color: '#00FF66', background: 'none', border: '1px solid rgba(0,255,102,0.3)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', marginRight: 6, fontFamily: 'inherit' }}
                            >
                              Enable
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(c)}
                            style={{ fontSize: 12, color: '#ff4444', background: 'none', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Customer outreach panel */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showCustomers ? '1.25rem' : 0 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 2px' }}>Customer outreach</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Pull your Printavo customer list and export emails for a campaign.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowCustomers((v) => !v);
              if (!showCustomers && customers.length === 0) loadCustomers();
            }}
            style={{ fontSize: 13, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
          >
            {showCustomers ? 'Hide' : 'Show customers'}
          </button>
        </div>

        {showCustomers && (
          <>
            {/* Campaign link builder */}
            <div style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', margin: '0 0 8px' }}>Campaign link</p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  style={{ ...input, width: 'auto', minWidth: 160 }}
                  value={selectedPromoForLink}
                  onChange={(e) => setSelectedPromoForLink(e.target.value)}
                >
                  <option value="">Pick a promo code…</option>
                  {activeCodes.map((c) => (
                    <option key={c.id} value={c.code}>{c.code} ({c.type === 'percent' ? `${c.value}% off` : fmt(c.value) + ' off'})</option>
                  ))}
                </select>
                {campaignLink && (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all', flex: 1 }}>{campaignLink}</span>
                    <CopyButton text={campaignLink} label="Copy link" />
                  </>
                )}
              </div>
            </div>

            {/* Filter + export */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <input
                style={{ ...input, width: 240 }}
                placeholder="Search name, company, email…"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              <button
                type="button"
                onClick={() => loadCustomers()}
                disabled={customersLoading}
                style={{ fontSize: 13, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {customersLoading ? 'Loading…' : 'Refresh'}
              </button>
              {filteredCustomers.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadCSV(filteredCustomers, 'customers.csv')}
                  style={{ fontSize: 13, color: '#00FF66', background: 'none', border: '1px solid rgba(0,255,102,0.4)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Export CSV ({filteredCustomers.length})
                </button>
              )}
            </div>

            {customersError && <p style={{ fontSize: 13, color: '#ff4444', marginBottom: 10 }}>{customersError}</p>}

            {!customersLoading && filteredCustomers.length === 0 && !customersError && (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>No customers found.</p>
            )}

            {filteredCustomers.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Name', 'Company', 'Email', 'Phone', 'Created'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', color: 'var(--foreground)' }}>{c.name || '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{c.companyName || '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--foreground)' }}>{c.email || '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{c.phone || '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(c.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
