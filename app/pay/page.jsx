'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import Link from 'next/link';

function formatCurrency(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    (cents || 0) / 100,
  );
}

function PayForm() {
  const searchParams = useSearchParams();
  const invoiceId = searchParams.get('invoiceId') || '';
  const amountParam = parseInt(searchParams.get('amount') || '0', 10);

  const [amountCents, setAmountCents] = useState(amountParam || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const parsedCents = parseInt(amountCents, 10);
  const isValid = invoiceId && Number.isInteger(parsedCents) && parsedCents > 0;

  async function handlePay() {
    if (!isValid) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/create-payment-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, amountCents: parsedCents }),
      });
      const data = await res.json();

      if (!res.ok || !data.sessionUrl) {
        setError(data.error || 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }

      window.location.href = data.sessionUrl;
    } catch {
      setError('Network error — please try again.');
      setLoading(false);
    }
  }

  const card = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '2rem',
  };

  const inputStyle = {
    width: '100%',
    height: 44,
    padding: '10px 14px',
    fontSize: 15,
    background: 'var(--background)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--foreground)',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    outline: 'none',
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '3rem 1rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 8px' }}>
          Pay Your Invoice
        </h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
          Secure payment powered by Stripe.
        </p>
      </div>

      <div style={card}>
        {invoiceId && (
          <div style={{
            background: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            fontSize: 13,
            color: 'var(--muted)',
          }}>
            Invoice ID: <strong style={{ color: 'var(--foreground)', fontFamily: 'monospace' }}>{invoiceId}</strong>
          </div>
        )}

        {!invoiceId && (
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Invoice ID
            </label>
            <input
              style={inputStyle}
              placeholder="Provided by Thread Giant"
              value={invoiceId}
              readOnly
            />
          </div>
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Amount (USD)
          </label>
          {amountParam > 0 ? (
            <div style={{
              height: 44,
              padding: '0 14px',
              display: 'flex',
              alignItems: 'center',
              fontSize: 22,
              fontWeight: 700,
              color: '#00FF66',
              background: 'rgba(0,255,102,0.06)',
              border: '1px solid rgba(0,255,102,0.3)',
              borderRadius: 8,
            }}>
              {formatCurrency(amountParam)}
            </div>
          ) : (
            <input
              type="number"
              min="1"
              step="1"
              style={inputStyle}
              placeholder="Amount in cents (e.g. 25000 = $250.00)"
              value={amountCents}
              onChange={(e) => setAmountCents(e.target.value)}
            />
          )}
        </div>

        {error && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid #ff4444',
            borderRadius: 8,
            padding: '0.75rem 1rem',
            fontSize: 13,
            color: '#ff4444',
            marginBottom: '1rem',
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handlePay}
          disabled={!isValid || loading}
          style={{
            width: '100%',
            padding: '14px 0',
            fontSize: 15,
            fontWeight: 700,
            background: isValid ? '#00FF66' : 'var(--border)',
            color: isValid ? '#000' : 'var(--muted)',
            border: 'none',
            borderRadius: 50,
            cursor: isValid && !loading ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}
        >
          {loading ? 'Redirecting to Stripe…' : `Pay ${amountParam > 0 ? formatCurrency(amountParam) : 'Now'} →`}
        </button>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: '1rem', opacity: 0.7 }}>
          You&apos;ll be taken to Stripe&apos;s secure checkout. Thread Giant never sees your card details.
        </p>
      </div>

      <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: 13, color: 'var(--muted)' }}>
        Questions?{' '}
        <Link href="/contact" style={{ color: '#00FF66', textDecoration: 'none', fontWeight: 600 }}>
          Contact us →
        </Link>
      </p>
    </div>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>}>
      <PayForm />
    </Suspense>
  );
}
