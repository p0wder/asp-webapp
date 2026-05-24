'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';

const TIMELINE_STEPS = [
  { key: 'quote_received',  label: 'Quote Received' },
  { key: 'under_review',    label: 'Under Review' },
  { key: 'proof_ready',     label: 'Proof Ready' },
  { key: 'approved',        label: 'Approved' },
  { key: 'in_production',   label: 'In Production' },
  { key: 'complete',        label: 'Complete' },
];

const STATUS_STEP_MAP = {
  'quote': 0, 'quote received': 0, 'new': 0,
  'under review': 1, 'reviewing': 1,
  'proof ready': 2, 'proof sent': 2,
  'approved': 3, 'proof approved': 3,
  'in production': 4, 'production': 4, 'printing': 4,
  'complete': 5, 'shipped': 5, 'delivered': 5, 'ready': 5,
};

function resolveStep(statusName) {
  if (!statusName) return 0;
  const key = statusName.toLowerCase().trim();
  for (const [match, step] of Object.entries(STATUS_STEP_MAP)) {
    if (key.includes(match)) return step;
  }
  return 0;
}

function formatDate(str) {
  if (!str) return null;
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function OrderStatusContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const token = searchParams.get('token');
  const { user } = useUser();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) { setError('No order ID provided.'); setLoading(false); return; }
    fetch(`/api/order-status?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token || '')}`)
      .then((r) => {
        if (r.status === 403) throw new Error('This link has expired or is invalid.');
        if (r.status === 404) throw new Error('Order not found.');
        if (!r.ok) throw new Error('Could not load order status.');
        return r.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [id, token]);

  const activeStep = data ? resolveStep(data.status?.name) : -1;

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--muted)' }}>
      Loading order status…
    </div>
  );

  if (error) return (
    <div style={{ maxWidth: 480, margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: '1rem' }}>🔍</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 12px' }}>
        Order Not Found
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 2rem', lineHeight: 1.7 }}>{error}</p>
      <Link href="/contact" style={{ color: '#00FF66', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
        Contact us →
      </Link>
    </div>
  );

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '2rem 1rem' }}>
      {user && (
        <Link href="/my-orders" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none', marginBottom: '1.5rem' }}>
          ← Back to my orders
        </Link>
      )}

      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 6px' }}>
          {data.jobName || 'Your Order'}
        </h1>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)' }}>
          {data.visualId && <span>Order <strong style={{ color: 'var(--foreground)' }}>#{data.visualId}</strong></span>}
          {data.customerName && <span>{data.customerName}</span>}
          {data.dueAt && <span>Due <strong style={{ color: 'var(--foreground)' }}>{formatDate(data.dueAt)}</strong></span>}
        </div>
      </div>

      {/* Status badge */}
      {data.status && (
        <div style={{ marginBottom: '2rem' }}>
          <span style={{
            display: 'inline-block', padding: '6px 16px', borderRadius: 20,
            fontSize: 13, fontWeight: 700,
            background: data.status.color ? `${data.status.color}22` : 'rgba(0,255,102,0.1)',
            color: data.status.color || '#00FF66',
            border: `1px solid ${data.status.color || '#00FF66'}44`,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {data.status.name}
          </span>
        </div>
      )}

      {/* Timeline */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem', marginBottom: '2rem' }}>
        <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', margin: '0 0 1.25rem' }}>Order Progress</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {TIMELINE_STEPS.map((step, i) => {
            const done = i < activeStep;
            const active = i === activeStep;
            const pending = i > activeStep;
            return (
              <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, flexShrink: 0,
                    background: done ? '#00FF66' : active ? '#00FF66' : 'var(--border)',
                    color: done || active ? '#000' : 'var(--muted)',
                    border: active ? '2px solid #00FF66' : 'none',
                    boxShadow: active ? '0 0 0 4px rgba(0,255,102,0.15)' : 'none',
                  }}>
                    {done ? '✓' : i + 1}
                  </div>
                  {i < TIMELINE_STEPS.length - 1 && (
                    <div style={{ width: 2, height: 28, background: done ? '#00FF66' : 'var(--border)', marginTop: 2 }} />
                  )}
                </div>
                <div style={{ paddingBottom: i < TIMELINE_STEPS.length - 1 ? 8 : 0, paddingTop: 4 }}>
                  <p style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: pending ? 'var(--muted)' : 'var(--foreground)', margin: 0 }}>
                    {step.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
        Questions?{' '}
        <Link href="/contact" style={{ color: '#00FF66', textDecoration: 'none', fontWeight: 600 }}>
          Contact us →
        </Link>
      </p>
    </div>
  );
}

export default function OrderStatusPage() {
  return (
    <Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>}>
      <OrderStatusContent />
    </Suspense>
  );
}
