'use client';

import { useCallback, useEffect, useState } from 'react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isExpired(code) {
  return !!code.expiresAt && new Date().toISOString() > code.expiresAt;
}

function isExhausted(code) {
  return code.maxUses !== null && code.useCount >= code.maxUses;
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

// ─── Shared UI ────────────────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
      style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', color: copied ? '#00FF66' : 'var(--muted)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

function Badge({ children, color }) {
  const map = {
    green: { background: 'rgba(0,255,102,0.12)', color: '#00FF66' },
    red: { background: 'rgba(255,68,68,0.12)', color: '#ff4444' },
    blue: { background: 'rgba(100,160,255,0.12)', color: '#64a0ff' },
    gray: { background: 'rgba(128,128,128,0.12)', color: 'var(--muted)' },
  };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap', ...(map[color] || map.gray) }}>
      {children}
    </span>
  );
}

// ─── Promo Codes Tab ──────────────────────────────────────────────────────────

function PromoCodesTab() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [form, setForm] = useState({
    code: '', type: 'percent', value: '', expiresAt: '', maxUses: '',
    restrictedToEmail: '',
  });
  const [formError, setFormError] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/promo-codes');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setCodes(data.codes || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

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
          restrictedToEmail: form.restrictedToEmail.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      setForm({ code: '', type: 'percent', value: '', expiresAt: '', maxUses: '', restrictedToEmail: '' });
      await fetchCodes();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setFormSaving(false);
    }
  };

  const toggleEnabled = async (code) => {
    await fetch(`/api/promo-codes/${code.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !code.enabled }),
    });
    fetchCodes();
  };

  const handleDelete = async (code) => {
    if (!confirm(`Delete "${code.code}"? This cannot be undone.`)) return;
    await fetch(`/api/promo-codes/${code.id}`, { method: 'DELETE' });
    fetchCodes();
  };

  const activeCodes = codes.filter(isActive);
  const inactiveCodes = codes.filter((c) => !isActive(c));
  // Broad = no email restriction; personal = restricted to one email
  const broadActive = activeCodes.filter((c) => !c.restrictedToEmail);
  const personalActive = activeCodes.filter((c) => !!c.restrictedToEmail);

  const inputStyle = { width: '100%', height: 38, padding: '8px 10px', fontSize: 13, background: '#F8F7F5', border: '1px solid var(--border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box', color: '#1E0033', fontFamily: 'inherit' };
  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' };

  const CodeTable = ({ rows, showToggle = true }) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Code', 'Discount', 'Restricted to', 'Expires', 'Uses', 'Status', 'Campaign link', 'Actions'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 10px', fontWeight: 700, color: 'var(--foreground)', fontFamily: 'monospace' }}>{c.code}</td>
              <td style={{ padding: '10px 10px', color: 'var(--foreground)' }}>
                {c.type === 'percent' ? `${c.value}% off` : `${fmt(c.value)} off`}
              </td>
              <td style={{ padding: '10px 10px', color: 'var(--muted)', fontSize: 12 }}>
                {c.restrictedToEmail
                  ? <span style={{ color: '#64a0ff' }}>{c.restrictedToEmail}</span>
                  : <span style={{ opacity: 0.5 }}>Anyone</span>}
              </td>
              <td style={{ padding: '10px 10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(c.expiresAt)}</td>
              <td style={{ padding: '10px 10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{c.useCount} / {c.maxUses ?? '∞'}</td>
              <td style={{ padding: '10px 10px' }}>
                {isActive(c) ? <Badge color="green">Active</Badge>
                  : !c.enabled ? <Badge color="gray">Disabled</Badge>
                  : isExpired(c) ? <Badge color="red">Expired</Badge>
                  : <Badge color="red">Exhausted</Badge>}
              </td>
              <td style={{ padding: '10px 10px' }}>
                {!c.restrictedToEmail && (
                  <CopyButton
                    label="Copy link"
                    text={`${typeof window !== 'undefined' ? window.location.origin : ''}/quote?promo=${encodeURIComponent(c.code)}`}
                  />
                )}
              </td>
              <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                {showToggle && (
                  <button
                    type="button"
                    onClick={() => toggleEnabled(c)}
                    style={{ fontSize: 12, color: isActive(c) ? 'var(--muted)' : '#00FF66', background: 'none', border: `1px solid ${isActive(c) ? 'var(--border)' : 'rgba(0,255,102,0.3)'}`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', marginRight: 6, fontFamily: 'inherit' }}
                  >
                    {isActive(c) ? 'Disable' : 'Enable'}
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
  );

  return (
    <div>
      {/* Create form */}
      <div style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 1.25rem' }}>Create promo code</h2>
        <form onSubmit={handleCreate} noValidate>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 4 }}>Code *</label>
              <input style={inputStyle} placeholder="SUMMER25" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 4 }}>Type *</label>
              <select style={inputStyle} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="percent">% off</option>
                <option value="fixed">$ off</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 4 }}>Amount *</label>
              <input style={inputStyle} type="number" min="0.01" step="0.01" placeholder={form.type === 'percent' ? '10' : '5.00'} value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 4 }}>Expires</label>
              <input style={{ ...inputStyle, colorScheme: 'light' }} type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 4 }}>Max uses</label>
              <input style={inputStyle} type="number" min="1" placeholder="Unlimited" value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 4 }}>
                Restrict to email <span style={{ fontWeight: 400, textTransform: 'none', opacity: 0.6 }}>— leave blank for broad use</span>
              </label>
              <input style={inputStyle} type="email" placeholder="customer@example.com" value={form.restrictedToEmail} onChange={(e) => setForm((f) => ({ ...f, restrictedToEmail: e.target.value }))} />
            </div>
          </div>
          {formError && <p style={{ fontSize: 12, color: '#ff4444', margin: '0 0 10px' }}>{formError}</p>}
          <button type="submit" disabled={formSaving} style={{ padding: '10px 28px', borderRadius: 50, background: '#00FF66', border: 'none', color: '#000', fontWeight: 700, fontSize: 14, cursor: formSaving ? 'not-allowed' : 'pointer', opacity: formSaving ? 0.6 : 1, fontFamily: 'inherit' }}>
            {formSaving ? 'Creating…' : 'Create code'}
          </button>
        </form>
      </div>

      {/* Broad codes */}
      <div style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 4px' }}>
          Broad codes <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--muted)' }}>({broadActive.length} active)</span>
        </h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 1rem' }}>Open to anyone — share via campaign link or social.</p>
        {loading && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>}
        {error && <p style={{ fontSize: 13, color: '#ff4444' }}>{error}</p>}
        {!loading && broadActive.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>No broad codes yet.</p>}
        {!loading && broadActive.length > 0 && <CodeTable rows={broadActive} />}
      </div>

      {/* Per-customer codes */}
      <div style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 4px' }}>
          Personal codes <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--muted)' }}>({personalActive.length} active)</span>
        </h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 1rem' }}>Restricted to a specific customer email — only they can redeem it.</p>
        {!loading && personalActive.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>No personal codes yet. Create one above with a customer email in the "Restrict to email" field.</p>}
        {!loading && personalActive.length > 0 && <CodeTable rows={personalActive} />}
      </div>

      {/* Inactive */}
      {inactiveCodes.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <button type="button" onClick={() => setShowInactive((v) => !v)} style={{ fontSize: 13, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <span>{showInactive ? '▾' : '▸'}</span>
            Expired / disabled ({inactiveCodes.length})
          </button>
          {showInactive && (
            <div style={{ ...card, marginBottom: 0, opacity: 0.8 }}>
              <CodeTable rows={inactiveCodes} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Campaigns Tab (placeholder) ──────────────────────────────────────────────

function CampaignsTab({ codes }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setCustomersLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCode, setSelectedCode] = useState('');

  const activeBroadCodes = codes.filter((c) => c.enabled && !c.restrictedToEmail);

  const load = async () => {
    setCustomersLoading(true);
    setError('');
    try {
      const res = await fetch('/api/printavo-customers?page=1');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setCustomers(data.customers || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setCustomersLoading(false);
    }
  };

  const filtered = customers.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name?.toLowerCase().includes(q) || c.companyName?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q);
  });

  const campaignLink = selectedCode
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/quote?promo=${encodeURIComponent(selectedCode)}`
    : '';

  const inputStyle = { height: 38, padding: '8px 10px', fontSize: 13, background: '#F8F7F5', border: '1px solid var(--border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box', color: '#1E0033', fontFamily: 'inherit' };
  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' };

  return (
    <div>
      {/* Campaign link builder */}
      <div style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 4px' }}>Campaign link</h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 1rem' }}>
          Pick a broad promo code and share this link — it auto-fills the code in the quote form.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={{ ...inputStyle, minWidth: 200 }} value={selectedCode} onChange={(e) => setSelectedCode(e.target.value)}>
            <option value="">Pick a code…</option>
            {activeBroadCodes.map((c) => (
              <option key={c.id} value={c.code}>{c.code} ({c.type === 'percent' ? `${c.value}% off` : `$${c.value} off`})</option>
            ))}
          </select>
          {campaignLink && (
            <>
              <span style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all', flex: 1, minWidth: 0 }}>{campaignLink}</span>
              <CopyButton text={campaignLink} label="Copy link" />
            </>
          )}
        </div>
        {activeBroadCodes.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>Create a broad promo code in the Promo Codes tab first.</p>
        )}
      </div>

      {/* Customer list */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 2px' }}>Printavo customer list</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Export emails to paste into your mailer of choice.</p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={{ fontSize: 13, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {loading ? 'Loading…' : customers.length ? 'Refresh' : 'Load customers'}
          </button>
        </div>

        {error && <p style={{ fontSize: 13, color: '#ff4444', marginBottom: 10 }}>{error}</p>}

        {customers.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <input style={{ ...inputStyle, width: 240 }} placeholder="Search name, company, email…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <button
                type="button"
                onClick={() => downloadCSV(filtered, 'customers.csv')}
                style={{ fontSize: 13, color: '#00FF66', background: 'none', border: '1px solid rgba(0,255,102,0.4)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Export CSV ({filtered.length})
              </button>
            </div>
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
                  {filtered.map((c) => (
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
          </>
        )}

        {!loading && customers.length === 0 && !error && (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Click "Load customers" to pull your Printavo list.</p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'promo-codes', label: 'Promo Codes' },
  { id: 'campaigns', label: 'Campaigns' },
];

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState('promo-codes');
  const [codes, setCodes] = useState([]);

  // Fetch codes once for use across tabs (Campaigns tab needs them for the link builder)
  useEffect(() => {
    fetch('/api/promo-codes')
      .then((r) => r.json())
      .then((d) => setCodes(d.codes || []))
      .catch(() => {});
  }, []);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'inherit' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 4px' }}>Marketing</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>Manage promo codes and run campaigns for your customers.</p>
        </div>
        <a
          href="/purchasing"
          style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px' }}
        >
          ← Purchasing
        </a>
      </div>

      {/* Sub-nav */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: '2rem' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: activeTab === tab.id ? 700 : 400,
              color: activeTab === tab.id ? 'var(--foreground)' : 'var(--muted)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #00FF66' : '2px solid transparent',
              cursor: 'pointer',
              fontFamily: 'inherit',
              marginBottom: -1,
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'promo-codes' && <PromoCodesTab />}
      {activeTab === 'campaigns' && <CampaignsTab codes={codes} />}
    </div>
  );
}
