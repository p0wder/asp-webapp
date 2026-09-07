'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Customer payment page (TG-001-04).
 *
 * The amount is no longer held in client state or read from `?amount=`. It is
 * fetched from `/api/create-payment-session`, which derives it from the
 * Printavo invoice balance, and it is displayed read-only. There is nothing
 * on this page a customer can edit that changes what they are charged.
 */

function formatCurrency(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    (cents || 0) / 100,
  );
}

function PayForm() {
  const searchParams = useSearchParams();
  const invoiceId = searchParams.get('invoiceId') || '';
  // Access token for customers reaching this page from an emailed link.
  // Signed-in customers are authorised by their Clerk session instead.
  const token = searchParams.get('token') || '';

  const [amountCents, setAmountCents] = useState(null);
  const [loadingAmount, setLoadingAmount] = useState(Boolean(invoiceId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isValid = Boolean(invoiceId) && Number.isInteger(amountCents) && amountCents > 0;

  const loadAmount = useCallback(async () => {
    if (!invoiceId) return;
    setLoadingAmount(true);
    setError(null);
    try {
      const query = new URLSearchParams({ invoiceId, ...(token ? { token } : {}) });
      const res = await fetch(`/api/create-payment-session?${query}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'We could not load this invoice.');
        setAmountCents(null);
      } else {
        setAmountCents(data.amountCents);
      }
    } catch {
      setError('Network error — please reload the page.');
    } finally {
      setLoadingAmount(false);
    }
  }, [invoiceId, token]);

  useEffect(() => {
    loadAmount();
  }, [loadAmount]);

  async function handlePay() {
    if (!isValid) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/create-payment-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `amountCents` is sent as an assertion the server checks against its
        // own figure, not as the amount to charge. A mismatch means the page
        // is stale and the request is refused rather than silently repriced.
        body: JSON.stringify({ invoiceId, amountCents, ...(token ? { token } : {}) }),
      });
      const data = await res.json();

      if (!res.ok || !data.sessionUrl) {
        setError(data.error || 'Something went wrong. Please try again.');
        // A stale amount is recoverable: refresh it so the customer can retry.
        if (data.code === 'AMOUNT_MISMATCH') await loadAmount();
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
            Balance Due (USD)
          </label>
          {/* Read-only by design. The figure comes from the invoice balance in
              Printavo, not from the URL or from anything typed here. */}
          <div style={{
            height: 44,
            padding: '0 14px',
            display: 'flex',
            alignItems: 'center',
            fontSize: 22,
            fontWeight: 700,
            color: isValid ? '#00FF66' : 'var(--muted)',
            background: isValid ? 'rgba(0,255,102,0.06)' : 'var(--background)',
            border: `1px solid ${isValid ? 'rgba(0,255,102,0.3)' : 'var(--border)'}`,
            borderRadius: 8,
          }}>
            {isValid ? formatCurrency(amountCents) : loadingAmount ? 'Loading…' : '—'}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0', opacity: 0.8 }}>
            This is the current balance on your invoice.
          </p>
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
          disabled={!isValid || loading || loadingAmount}
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
          {loading
            ? 'Redirecting to Stripe…'
            : `Pay ${isValid ? formatCurrency(amountCents) : 'Now'} →`}
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
