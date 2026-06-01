'use client';

import { useEffect, useRef, useState } from 'react';

// ─── Pure display helpers ──────────────────────────────────────────────────────

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86_400_000);
}

function urgencyOf(lead) {
  const d = daysUntil(lead.eventDate);
  if (d === null) return null;
  if (d < 0) return { label: 'Past', color: '#666666' };
  if (d <= 14) return { label: `Urgent · ${d}d`, color: '#ff4444' };
  if (d <= 42) return { label: `Hot · ${d}d`, color: '#00FF66' };
  if (d <= 90) return { label: `Warm · ${d}d`, color: '#f5a623' };
  return { label: `${d}d out`, color: 'var(--muted)' };
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_META = {
  new:       { label: 'New',       color: '#00FF66' },
  contacted: { label: 'Contacted', color: '#4FC3F7' },
  quoted:    { label: 'Quoted',    color: '#f5a623' },
  won:       { label: 'Won',       color: '#00c44f' },
  lost:      { label: 'Lost',      color: '#ff4444' },
  skipped:   { label: 'Skipped',   color: '#666666' },
};

const TYPE_META = {
  event:         { label: 'Event',         color: '#a78bfa' },
  running_event: { label: '5K / Race',     color: '#60a5fa' },
  festival:      { label: 'Festival',      color: '#f472b6' },
  pub_crawl:     { label: 'Pub Crawl',     color: '#fb923c' },
  sports_league: { label: 'Sports League', color: '#34d399' },
  school:        { label: 'School',        color: '#facc15' },
  other:         { label: 'Other',         color: '#94a3b8' },
};

// Per-type outreach email templates
function buildOutreachEmail(lead) {
  if (lead.type === 'school') {
    const subject = `Custom Jerseys & Spirit Wear — ${lead.name}`;
    const body = `Hi there,

I wanted to reach out about custom screen-printed apparel for ${lead.name}.

We specialize in team jerseys, spirit wear, and event shirts for schools in the area — football, basketball, soccer, lacrosse, and more. We handle everything from artwork to delivery with pricing built for school budgets.

Whether it's uniforms for a sports team, shirts for a school event, or custom gear for a student organization, we'd love to help.

Would you be interested in a free, no-commitment quote?

Best,
Scott
Thread Giant
threadgiant.com`;
    return { subject, body };
  }

  if (lead.type === 'sports_league') {
    const subject = `Custom Jerseys for ${lead.name}`;
    const body = `Hi there,

I wanted to reach out about custom jerseys and team apparel for ${lead.name}.

We print custom designs for local sports leagues — jerseys, uniforms, warm-ups, fan shirts — with fast turnaround and competitive team pricing.

We work with recreational leagues, travel teams, and youth organizations throughout the area.

Would you be open to a free quote for the upcoming season?

Best,
Scott
Thread Giant
threadgiant.com`;
    return { subject, body };
  }

  if (lead.type === 'pub_crawl') {
    const subject = `Custom Shirts for ${lead.name}`;
    const body = `Hi there,

I came across ${lead.name} and wanted to reach out — custom matching shirts are a staple for pub crawls and bar events, and we'd love to help make yours memorable.

We do screen-printed shirts with fast turnaround, great prices on group orders, and designs that people actually want to wear again.

Would you be interested in a free quote?

Best,
Scott
Thread Giant
threadgiant.com`;
    return { subject, body };
  }

  if (lead.type === 'festival') {
    const subject = `Custom Shirts & Staff Apparel for ${lead.name}`;
    const body = `Hi there,

I noticed ${lead.name} is coming up and wanted to reach out. Festivals often need custom shirts for staff, volunteers, vendors, and attendees — and we specialize in exactly that.

We handle screen printing for events of all sizes with quick turnaround and competitive pricing.

Would you be open to a free quote?

Best,
Scott
Thread Giant
threadgiant.com`;
    return { subject, body };
  }

  // Generic event (5K run, charity walk, etc.)
  const hi = lead.contactName ? `Hi ${lead.contactName.split(' ')[0]},` : 'Hi there,';
  const date = lead.eventDate
    ? new Date(lead.eventDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const eventRef = date ? `coming up on ${date}` : 'coming up soon';
  const qtyLine = lead.attendeeCount
    ? `Whether you need shirts for ${lead.attendeeCount}+ participants or just a core crew, `
    : '';

  return {
    subject: `Custom Shirts for ${lead.name}`,
    body: `${hi}

I noticed that ${lead.name} is ${eventRef} — we specialize in custom screen-printed shirts for events just like yours.

${qtyLine}we handle everything from design to delivery with fast turnaround and competitive pricing.

Would you be open to a free, no-commitment quote?

Best,
Scott
Thread Giant
threadgiant.com`,
  };
}

// ─── Shared mini-components ────────────────────────────────────────────────────

function Badge({ label, color }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, background: `${color}22`, color,
      border: `1px solid ${color}44`, textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      {label}
    </span>
  );
}

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={copy} style={{
      padding: '4px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
      background: copied ? '#00FF66' : 'var(--surface)', border: '1px solid var(--border)',
      color: copied ? '#000' : 'var(--muted)', fontFamily: 'inherit', fontWeight: 600,
    }}>
      {copied ? 'Copied!' : label}
    </button>
  );
}

// ─── Scan controls ─────────────────────────────────────────────────────────────

function ScanControls({ onScanComplete }) {
  const [location, setLocation] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem('leads:scanLocation');
    if (saved) setLocation(saved);
  }, []);

  function handleLocationChange(val) {
    setLocation(val);
    setScanResult(null);
    setScanError(null);
    clearTimeout(debounceRef.current);
    if (val.trim().length >= 3) {
      setShowSuggestions(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/leads/location-suggest?q=${encodeURIComponent(val)}`);
          const data = await res.json();
          setSuggestions(data.suggestions ?? []);
        } catch { setSuggestions([]); }
      }, 500);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }

  function selectSuggestion(label) {
    setLocation(label);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  async function scan() {
    const loc = location.trim();
    if (!loc) { setScanError('Enter a city or zip code first.'); return; }
    localStorage.setItem('leads:scanLocation', loc);
    setScanning(true);
    setScanResult(null);
    setScanError(null);
    try {
      const res = await fetch('/api/leads/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: loc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      setScanResult(data);
      onScanComplete();
    } catch (err) {
      setScanError(err.message);
    } finally {
      setScanning(false);
    }
  }

  const inputStyle = {
    width: '100%', fontSize: 13, padding: '9px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--background)',
    color: 'var(--foreground)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <input
            value={location}
            onChange={(e) => handleLocationChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="City or zip (e.g. Charlotte, NC)"
            style={inputStyle}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, marginTop: 4, overflow: 'hidden',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            }}>
              {suggestions.map((s) => (
                <div key={s.label} onMouseDown={() => selectSuggestion(s.label)} style={{
                  padding: '9px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--foreground)',
                  borderBottom: '1px solid var(--border)', transition: 'background 0.1s',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--background)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {s.label}
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={scan} disabled={scanning} style={{
          padding: '9px 20px', fontSize: 13, borderRadius: 8, whiteSpace: 'nowrap',
          cursor: scanning ? 'not-allowed' : 'pointer',
          background: scanning ? 'var(--surface)' : '#00FF66',
          color: scanning ? 'var(--muted)' : '#000',
          border: scanning ? '1px solid var(--border)' : 'none',
          fontWeight: 700, fontFamily: 'inherit', opacity: scanning ? 0.7 : 1,
        }}>
          {scanning ? 'Scanning…' : '⟳ Scan for Leads'}
        </button>
      </div>

      {scanResult && (
        <div style={{
          marginTop: 10, padding: '8px 14px', borderRadius: 8,
          background: 'rgba(0,255,102,0.07)', border: '1px solid #00FF6633',
          fontSize: 13, color: '#00FF66', fontWeight: 600,
        }}>
          Scan complete near {scanResult.location} — {scanResult.added} new lead{scanResult.added !== 1 ? 's' : ''} added
          {scanResult.breakdown && (
            <span style={{ fontWeight: 400, color: '#00FF6699', marginLeft: 6 }}>
              ({scanResult.breakdown.events} events · {scanResult.breakdown.schools} schools)
            </span>
          )}
        </div>
      )}
      {scanError && (
        <div style={{
          marginTop: 10, padding: '8px 14px', borderRadius: 8,
          background: 'rgba(255,68,68,0.07)', border: '1px solid #ff444433',
          fontSize: 13, color: '#ff4444',
        }}>
          {scanError}
        </div>
      )}
    </div>
  );
}

// ─── Lead sub-components ───────────────────────────────────────────────────────

function OutreachPanel({ lead }) {
  const [open, setOpen] = useState(false);
  const email = buildOutreachEmail(lead);

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} style={{
        fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none',
        cursor: 'pointer', padding: 0, fontFamily: 'inherit', textDecoration: 'underline',
      }}>
        {open ? 'Hide outreach email ↑' : 'View outreach email ↓'}
      </button>
      {open && (
        <div style={{ marginTop: 8, padding: '0.75rem', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subject</span>
              <CopyButton text={email.subject} label="Copy subject" />
            </div>
            <div style={{ fontSize: 13, padding: '6px 8px', background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)', color: 'var(--foreground)' }}>
              {email.subject}
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Body</span>
              <CopyButton text={email.body} label="Copy body" />
            </div>
            <pre style={{
              fontSize: 12, padding: '8px', background: 'var(--surface)', borderRadius: 6,
              border: '1px solid var(--border)', color: 'var(--foreground)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
              fontFamily: 'inherit', lineHeight: 1.6,
            }}>
              {email.body}
            </pre>
          </div>
          {lead.contactEmail && (
            <div style={{ marginTop: 10 }}>
              <a
                href={`mailto:${lead.contactEmail}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}
                style={{ fontSize: 12, color: '#00FF66', fontWeight: 600, textDecoration: 'none' }}
              >
                Open in email client →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotesField({ lead, onSave }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(lead.notes || '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (value === (lead.notes || '')) { setOpen(false); return; }
    setSaving(true);
    await onSave({ notes: value });
    setSaving(false);
    setOpen(false);
  }

  const preview = lead.notes ? lead.notes.slice(0, 50) + (lead.notes.length > 50 ? '…' : '') : null;

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} style={{
        fontSize: 12, color: lead.notes ? 'var(--foreground)' : 'var(--muted)',
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        fontFamily: 'inherit', textDecoration: 'underline',
      }}>
        {open ? 'Close notes ↑' : (preview ? `Notes: ${preview}` : 'Add notes ↓')}
      </button>
      {open && (
        <div style={{ marginTop: 6 }}>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            style={{
              width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--foreground)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
            }}
            placeholder="Internal notes about this lead…"
          />
          <button onClick={save} disabled={saving} style={{
            marginTop: 4, padding: '4px 12px', fontSize: 11, borderRadius: 6,
            background: '#00FF66', color: '#000', border: 'none', fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
          }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

function LeadCard({ lead, onChange, onDelete }) {
  const urgency = urgencyOf(lead);
  const statusMeta = STATUS_META[lead.status] ?? STATUS_META.new;
  const typeMeta = TYPE_META[lead.type] ?? TYPE_META.other;
  const [updating, setUpdating] = useState(false);

  async function setStatus(s) {
    if (s === lead.status || updating) return;
    setUpdating(true);
    await onChange({ status: s });
    setUpdating(false);
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>
            {lead.name}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Badge label={typeMeta.label} color={typeMeta.color} />
            {urgency && <Badge label={urgency.label} color={urgency.color} />}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <Badge label={statusMeta.label} color={statusMeta.color} />
          <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>{lead.source}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
        {lead.eventDate && <span>Date <strong style={{ color: 'var(--foreground)' }}>{formatDate(lead.eventDate)}</strong></span>}
        {lead.location && <span>{lead.location}</span>}
        {lead.attendeeCount != null && <span>~<strong style={{ color: 'var(--foreground)' }}>{lead.attendeeCount.toLocaleString()}</strong> {lead.type === 'school' ? 'enrolled' : 'attendees'}</span>}
        {lead.estimatedQty != null && <span>→ ~<strong style={{ color: '#00FF66' }}>{lead.estimatedQty} shirts</strong></span>}
      </div>

      {(lead.contactName || lead.contactEmail || lead.contactPhone) && (
        <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap', alignItems: 'center' }}>
          {lead.contactName && <span>{lead.contactName}</span>}
          {lead.contactEmail && <a href={`mailto:${lead.contactEmail}`} style={{ color: '#00FF66', textDecoration: 'none' }}>{lead.contactEmail}</a>}
          {lead.contactPhone && <span>{lead.contactPhone}</span>}
        </div>
      )}

      {lead.sourceUrl && (
        <a href={lead.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
          View {lead.source === 'nces' ? 'school website' : 'event'} →
        </a>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
        {Object.entries(STATUS_META).filter(([k]) => k !== lead.status).map(([key, meta]) => (
          <button key={key} onClick={() => setStatus(key)} disabled={updating} style={{
            padding: '4px 12px', fontSize: 11, borderRadius: 20, cursor: updating ? 'not-allowed' : 'pointer',
            background: 'var(--background)', border: `1px solid ${meta.color}55`,
            color: meta.color, fontFamily: 'inherit', fontWeight: 600,
            opacity: updating ? 0.5 : 1, transition: 'all 0.15s',
          }}>
            → {meta.label}
          </button>
        ))}
      </div>

      <OutreachPanel lead={lead} />
      <NotesField lead={lead} onSave={onChange} />

      <div style={{ marginTop: 2 }}>
        <button onClick={() => onDelete(lead.id)} style={{
          fontSize: 11, color: '#ff444466', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit',
        }}>
          Delete lead
        </button>
      </div>
    </div>
  );
}

function AddLeadForm({ onAdded }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: '', type: 'sports_league', contactName: '', contactEmail: '',
    contactPhone: '', location: '', eventDate: '', attendeeCount: '',
  });

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, attendeeCount: form.attendeeCount ? Number(form.attendeeCount) : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create lead');
      onAdded(data.lead);
      setForm({ name: '', type: 'sports_league', contactName: '', contactEmail: '', contactPhone: '', location: '', eventDate: '', attendeeCount: '' });
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const input = {
    width: '100%', fontSize: 13, padding: '6px 8px', borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--background)',
    color: 'var(--foreground)', fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const labelStyle = {
    fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: '0.05em',
  };

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <button onClick={() => setOpen((v) => !v)} style={{
        padding: '8px 18px', fontSize: 13, borderRadius: 20, cursor: 'pointer',
        background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground)', fontFamily: 'inherit',
      }}>
        {open ? 'Cancel ↑' : '+ Add Lead Manually'}
      </button>

      {open && (
        <form onSubmit={submit} style={{
          marginTop: 12, padding: '1.25rem', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 10, display: 'grid', gap: 12,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span style={labelStyle}>Name *</span>
              <input style={input} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Team, school, or event name" required />
            </div>
            <div>
              <span style={labelStyle}>Type</span>
              <select style={input} value={form.type} onChange={(e) => set('type', e.target.value)}>
                <option value="sports_league">Sports League / Team</option>
                <option value="school">School</option>
                <option value="festival">Festival</option>
                <option value="pub_crawl">Pub Crawl / Bar Event</option>
                <option value="running_event">5K / Race</option>
                <option value="event">Other Event</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span style={labelStyle}>Event Date</span>
              <input type="date" style={input} value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
            </div>
            <div>
              <span style={labelStyle}>Approx. Participants</span>
              <input type="number" style={input} value={form.attendeeCount} onChange={(e) => set('attendeeCount', e.target.value)} placeholder="e.g. 150" min={1} />
            </div>
          </div>

          <div>
            <span style={labelStyle}>Location</span>
            <input style={input} value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="City, State" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <span style={labelStyle}>Contact Name</span>
              <input style={input} value={form.contactName} onChange={(e) => set('contactName', e.target.value)} placeholder="Coach / Organizer" />
            </div>
            <div>
              <span style={labelStyle}>Contact Email</span>
              <input type="email" style={input} value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} placeholder="coach@team.com" />
            </div>
            <div>
              <span style={labelStyle}>Contact Phone</span>
              <input type="tel" style={input} value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} placeholder="(555) 000-0000" />
            </div>
          </div>

          {error && <p style={{ fontSize: 12, color: '#ff4444', margin: 0 }}>{error}</p>}
          <div>
            <button type="submit" disabled={saving} style={{
              padding: '8px 20px', fontSize: 13, borderRadius: 20, cursor: saving ? 'not-allowed' : 'pointer',
              background: '#00FF66', color: '#000', border: 'none', fontWeight: 700, fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
            }}>
              {saving ? 'Adding…' : 'Add Lead'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

const ALL_FILTER_TABS = ['all', 'new', 'contacted', 'quoted', 'won', 'lost', 'skipped'];

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  function fetchLeads() {
    return fetch('/api/leads')
      .then((r) => {
        if (r.status === 401) throw new Error('Unauthorized — please log in as admin.');
        if (!r.ok) throw new Error('Failed to load leads.');
        return r.json();
      })
      .then((data) => { setLeads(data.leads ?? []); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { fetchLeads(); }, []);

  async function updateLead(id, patch) {
    const res = await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (res.ok) setLeads((prev) => prev.map((l) => (l.id === id ? data.lead : l)));
  }

  async function deleteLead(id) {
    const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    if (res.ok) setLeads((prev) => prev.filter((l) => l.id !== id));
  }

  const countFor = (s) => s === 'all' ? leads.length : leads.filter((l) => l.status === s).length;
  const visible = filter === 'all' ? leads : leads.filter((l) => l.status === filter);
  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem' };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 4px' }}>Lead Inbox</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
          Scans local races and schools automatically. Add sports leagues, pub crawls, and festivals manually.
        </p>
      </div>

      <ScanControls onScanComplete={fetchLeads} />
      <AddLeadForm onAdded={(lead) => setLeads((prev) => [lead, ...prev])} />

      {loading && <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>Loading leads…</div>}
      {error && <div style={{ ...card, border: '1px solid #ff4444', color: '#ff4444', padding: '1rem 1.25rem' }}>{error}</div>}

      {!loading && !error && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {ALL_FILTER_TABS.map((s) => {
              const meta = s === 'all' ? { label: 'All', color: '#00FF66' } : STATUS_META[s];
              const active = filter === s;
              return (
                <button key={s} onClick={() => setFilter(s)} style={{
                  padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  border: active ? `1px solid ${meta.color}` : '1px solid var(--border)',
                  background: active ? `${meta.color}22` : 'var(--surface)',
                  color: active ? meta.color : 'var(--muted)',
                  transition: 'all 0.15s',
                }}>
                  {meta.label} ({countFor(s)})
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>
              {leads.length === 0
                ? 'No leads yet. Enter a city above to scan for local races and schools, or add a lead manually.'
                : `No leads with status "${filter}".`}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visible.map((lead) => (
                <LeadCard key={lead.id} lead={lead} onChange={(patch) => updateLead(lead.id, patch)} onDelete={deleteLead} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
