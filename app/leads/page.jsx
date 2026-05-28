'use client';

import { useEffect, useState } from 'react';

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

const TYPE_LABELS = {
  event: 'Event',
  sports_league: 'Sports League',
  school: 'School',
  other: 'Other',
};

function buildOutreachEmail(lead) {
  const hi = lead.contactName ? `Hi ${lead.contactName.split(' ')[0]},` : 'Hi there,';
  const date = lead.eventDate
    ? new Date(lead.eventDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const eventRef = date ? `coming up on ${date}` : 'coming up soon';
  const qtyLine = lead.attendeeCount
    ? `Whether you need shirts for ${lead.attendeeCount}+ attendees or just a core crew, `
    : '';

  const subject = `Custom Shirts for ${lead.name}`;
  const body = `${hi}

I noticed that ${lead.name} is ${eventRef} — we specialize in custom screen-printed shirts for events just like yours.

${qtyLine}we handle everything from design to delivery with fast turnaround and competitive pricing. Our clients include 5K races, charity walks, sports tournaments, and community events.

Would you be open to a free, no-commitment quote? I can turn one around quickly so you have plenty of time before the event.

Best,
Scott
Thread Giant
threadgiant.com`;

  return { subject, body };
}

// ─── Shared mini-components ────────────────────────────────────────────────────

function Badge({ label, color }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      background: `${color}22`,
      color,
      border: `1px solid ${color}44`,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
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
        fontSize: 12,
        color: lead.notes ? 'var(--foreground)' : 'var(--muted)',
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
              color: 'var(--foreground)', fontFamily: 'inherit', resize: 'vertical',
              boxSizing: 'border-box',
            }}
            placeholder="Internal notes about this lead…"
          />
          <button onClick={save} disabled={saving} style={{
            marginTop: 4, padding: '4px 12px', fontSize: 11, borderRadius: 6,
            background: '#00FF66', color: '#000', border: 'none', fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            opacity: saving ? 0.6 : 1,
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
  const [updating, setUpdating] = useState(false);

  async function setStatus(s) {
    if (s === lead.status || updating) return;
    setUpdating(true);
    await onChange({ status: s });
    setUpdating(false);
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
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>
            {lead.name}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Badge label={TYPE_LABELS[lead.type] ?? lead.type} color="var(--muted)" />
            {urgency && <Badge label={urgency.label} color={urgency.color} />}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <Badge label={statusMeta.label} color={statusMeta.color} />
          <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>{lead.source}</span>
        </div>
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
        {lead.eventDate && (
          <span>Date <strong style={{ color: 'var(--foreground)' }}>{formatDate(lead.eventDate)}</strong></span>
        )}
        {lead.location && <span>{lead.location}</span>}
        {lead.attendeeCount != null && (
          <span>~<strong style={{ color: 'var(--foreground)' }}>{lead.attendeeCount}</strong> attendees</span>
        )}
        {lead.estimatedQty != null && (
          <span>→ ~<strong style={{ color: '#00FF66' }}>{lead.estimatedQty} shirts</strong></span>
        )}
      </div>

      {/* Contact */}
      {(lead.contactName || lead.contactEmail || lead.contactPhone) && (
        <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap', alignItems: 'center' }}>
          {lead.contactName && <span>{lead.contactName}</span>}
          {lead.contactEmail && (
            <a href={`mailto:${lead.contactEmail}`} style={{ color: '#00FF66', textDecoration: 'none' }}>
              {lead.contactEmail}
            </a>
          )}
          {lead.contactPhone && <span>{lead.contactPhone}</span>}
        </div>
      )}

      {/* Source link */}
      {lead.sourceUrl && (
        <div>
          <a href={lead.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
            View on Eventbrite →
          </a>
        </div>
      )}

      {/* Quick status buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
        {Object.entries(STATUS_META)
          .filter(([k]) => k !== lead.status)
          .map(([key, meta]) => (
            <button
              key={key}
              onClick={() => setStatus(key)}
              disabled={updating}
              style={{
                padding: '4px 12px', fontSize: 11, borderRadius: 20,
                cursor: updating ? 'not-allowed' : 'pointer',
                background: 'var(--background)', border: `1px solid ${meta.color}55`,
                color: meta.color, fontFamily: 'inherit', fontWeight: 600,
                opacity: updating ? 0.5 : 1, transition: 'all 0.15s',
              }}
            >
              → {meta.label}
            </button>
          ))}
      </div>

      <OutreachPanel lead={lead} />
      <NotesField lead={lead} onSave={onChange} />

      <div style={{ marginTop: 2 }}>
        <button
          onClick={() => onDelete(lead.id)}
          style={{ fontSize: 11, color: '#ff444466', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
        >
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
    name: '', type: 'event', contactName: '', contactEmail: '',
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
        body: JSON.stringify({
          ...form,
          attendeeCount: form.attendeeCount ? Number(form.attendeeCount) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create lead');
      onAdded(data.lead);
      setForm({ name: '', type: 'event', contactName: '', contactEmail: '', contactPhone: '', location: '', eventDate: '', attendeeCount: '' });
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
  const label = {
    fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: '0.05em',
  };

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <button onClick={() => setOpen((v) => !v)} style={{
        padding: '8px 18px', fontSize: 13, borderRadius: 20, cursor: 'pointer',
        background: 'var(--surface)', border: '1px solid var(--border)',
        color: 'var(--foreground)', fontFamily: 'inherit',
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
              <span style={label}>Name *</span>
              <input style={input} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Event or org name" required />
            </div>
            <div>
              <span style={label}>Type</span>
              <select style={input} value={form.type} onChange={(e) => set('type', e.target.value)}>
                <option value="event">Event</option>
                <option value="sports_league">Sports League</option>
                <option value="school">School</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span style={label}>Event Date</span>
              <input type="date" style={input} value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
            </div>
            <div>
              <span style={label}>Approx. Attendees</span>
              <input type="number" style={input} value={form.attendeeCount} onChange={(e) => set('attendeeCount', e.target.value)} placeholder="e.g. 250" min={1} />
            </div>
          </div>

          <div>
            <span style={label}>Location</span>
            <input style={input} value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="City, State" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <span style={label}>Contact Name</span>
              <input style={input} value={form.contactName} onChange={(e) => set('contactName', e.target.value)} placeholder="Jane Smith" />
            </div>
            <div>
              <span style={label}>Contact Email</span>
              <input type="email" style={input} value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} placeholder="jane@event.com" />
            </div>
            <div>
              <span style={label}>Contact Phone</span>
              <input type="tel" style={input} value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} placeholder="(555) 000-0000" />
            </div>
          </div>

          {error && <p style={{ fontSize: 12, color: '#ff4444', margin: 0 }}>{error}</p>}

          <div>
            <button type="submit" disabled={saving} style={{
              padding: '8px 20px', fontSize: 13, borderRadius: 20,
              cursor: saving ? 'not-allowed' : 'pointer',
              background: '#00FF66', color: '#000', border: 'none',
              fontWeight: 700, fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
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
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);

  useEffect(() => {
    fetch('/api/leads')
      .then((r) => {
        if (r.status === 401) throw new Error('Unauthorized — please log in as admin.');
        if (!r.ok) throw new Error('Failed to load leads.');
        return r.json();
      })
      .then((data) => { setLeads(data.leads ?? []); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  async function scan() {
    setScanning(true);
    setScanResult(null);
    setScanError(null);
    try {
      const res = await fetch('/api/leads/scan', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      setScanResult(data);
      const r2 = await fetch('/api/leads');
      const d2 = await r2.json();
      setLeads(d2.leads ?? []);
    } catch (err) {
      setScanError(err.message);
    } finally {
      setScanning(false);
    }
  }

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
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 4px' }}>
            Lead Inbox
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
            Potential clients from Eventbrite and manual entry. Scan weekly for new event organizers.
          </p>
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          style={{
            padding: '10px 20px', fontSize: 13, borderRadius: 20,
            cursor: scanning ? 'not-allowed' : 'pointer',
            background: scanning ? 'var(--surface)' : '#00FF66',
            color: scanning ? 'var(--muted)' : '#000',
            border: scanning ? '1px solid var(--border)' : 'none',
            fontWeight: 700, fontFamily: 'inherit',
            opacity: scanning ? 0.7 : 1, whiteSpace: 'nowrap',
          }}
        >
          {scanning ? 'Scanning Eventbrite…' : '⟳ Scan for Leads'}
        </button>
      </div>

      {/* Scan feedback */}
      {scanResult && (
        <div style={{ ...card, marginBottom: '1rem', borderColor: '#00FF6644', background: 'rgba(0,255,102,0.05)', padding: '0.75rem 1.25rem' }}>
          <span style={{ fontSize: 13, color: '#00FF66', fontWeight: 600 }}>
            Scan complete — found {scanResult.found} events, {scanResult.added} new lead{scanResult.added !== 1 ? 's' : ''} added.
          </span>
        </div>
      )}
      {scanError && (
        <div style={{ ...card, marginBottom: '1rem', borderColor: '#ff444444', background: 'rgba(255,68,68,0.05)', padding: '0.75rem 1.25rem' }}>
          <span style={{ fontSize: 13, color: '#ff4444' }}>{scanError}</span>
        </div>
      )}

      <AddLeadForm onAdded={(lead) => setLeads((prev) => [lead, ...prev])} />

      {loading && (
        <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>
          Loading leads…
        </div>
      )}

      {error && (
        <div style={{ ...card, border: '1px solid #ff4444', color: '#ff4444', padding: '1rem 1.25rem' }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {ALL_FILTER_TABS.map((s) => {
              const meta = s === 'all' ? { label: 'All', color: '#00FF66' } : STATUS_META[s];
              const active = filter === s;
              const count = countFor(s);
              return (
                <button key={s} onClick={() => setFilter(s)} style={{
                  padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  border: active ? `1px solid ${meta.color}` : '1px solid var(--border)',
                  background: active ? `${meta.color}22` : 'var(--surface)',
                  color: active ? meta.color : 'var(--muted)',
                  transition: 'all 0.15s',
                }}>
                  {meta.label} ({count})
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>
              {leads.length === 0
                ? 'No leads yet. Click "Scan for Leads" to find event organizers on Eventbrite, or add one manually above.'
                : `No leads with status "${filter}".`}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visible.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onChange={(patch) => updateLead(lead.id, patch)}
                  onDelete={deleteLead}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
