'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';

function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);
}

function formatDate(str) {
  if (!str) return null;
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function QuoteApprovalInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const token = searchParams.get('token');
  const { user } = useUser();

  const [quoteData, setQuoteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedDecision, setSubmittedDecision] = useState(null);

  useEffect(() => {
    if (!id) {
      setError('Missing approval link parameters. Please use the link from your email.');
      setLoading(false);
      return;
    }
    const params = new URLSearchParams({ id });
    if (token) params.set('token', token);
    fetch(`/api/quote-approval?${params}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'Unable to load quote. Please check your link.'); return; }
        setQuoteData(json);
      })
      .catch(() => setError('Network error — please try again.'))
      .finally(() => setLoading(false));
  }, [id, token]);

  const submitDecision = async (decision) => {
    if (decision === 'revision') {
      if (!notes.trim() || notes.trim().length < 10) {
        setNotesError('Please describe the changes needed (at least 10 characters).');
        return;
      }
    }
    setNotesError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/quote-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: id, token, decision, notes: notes.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Something went wrong. Please try again.');
        return;
      }
      setSubmitted(true);
      setSubmittedDecision(decision);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const containerStyle = { maxWidth: 560, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'inherit' };
  const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--muted)', fontSize: 15 }}>
          Loading quote…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <div style={{ fontSize: 40, marginBottom: '1rem' }}>😕</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 8px' }}>
            Quote unavailable
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 1.5rem', lineHeight: 1.6 }}>{error}</p>
          <a href="mailto:hello@threadgiant.com" style={{ color: '#00FF66', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            Contact us →
          </a>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={containerStyle}>
        {user && (
          <div style={{ marginBottom: '1rem' }}>
            <a href="/my-orders" style={{ color: '#00FF66', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              ← Back to my orders
            </a>
          </div>
        )}
        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
          <div style={{ fontSize: 48, marginBottom: '1rem' }}>
            {submittedDecision === 'approved' ? '✅' : '📝'}
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 8px' }}>
            {submittedDecision === 'approved' ? 'Quote approved!' : 'Revision request sent'}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>
            {submittedDecision === 'approved'
              ? "Great! We'll move forward with your order. We'll be in touch once your proof is ready."
              : "Got it — we'll review your notes and send an updated quote shortly."}
          </p>
        </div>
      </div>
    );
  }

  const existingDecision = quoteData?.decision;

  return (
    <div style={containerStyle}>
      {user && (
        <div style={{ marginBottom: '1rem' }}>
          <a href="/my-orders" style={{ color: '#00FF66', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            ← Back to my orders
          </a>
        </div>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 4px' }}>
          Quote Approval
        </h1>
        {(quoteData?.jobName || quoteData?.visualId) && (
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
            {quoteData.jobName && <span>{quoteData.jobName}</span>}
            {quoteData.jobName && quoteData.visualId && <span> · </span>}
            {quoteData.visualId && <span>Quote #{quoteData.visualId}</span>}
          </p>
        )}
      </div>

      {/* Quote summary card */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {quoteData?.jobName && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: 'var(--muted)' }}>Job</span>
              <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{quoteData.jobName}</span>
            </div>
          )}
          {quoteData?.visualId && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: 'var(--muted)' }}>Quote #</span>
              <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>#{quoteData.visualId}</span>
            </div>
          )}
          {quoteData?.customerDueAt && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: 'var(--muted)' }}>Due date</span>
              <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{formatDate(quoteData.customerDueAt)}</span>
            </div>
          )}
          {quoteData?.total != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 4 }}>
              <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Estimate total</span>
              <span style={{ color: 'var(--foreground)', fontWeight: 700, fontSize: 16 }}>{formatCurrency(quoteData.total)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Already-decided locked states */}
      {existingDecision === 'approved' && (
        <div style={{ background: 'rgba(0,255,102,0.1)', border: '1px solid #00FF66', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1.5rem', color: '#00FF66', fontWeight: 600, fontSize: 15, textAlign: 'center' }}>
          Quote approved ✓
        </div>
      )}
      {existingDecision === 'revision' && (
        <div style={{ background: 'rgba(255,200,0,0.1)', border: '1px solid #FFC800', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1.5rem', color: '#B8900A', fontWeight: 600, fontSize: 15, textAlign: 'center' }}>
          Revision request received — we'll be in touch
        </div>
      )}

      {/* Action buttons — only when no decision yet */}
      {!existingDecision && (
        <div style={cardStyle}>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
            Please review the quote above. Approving locks in this estimate and moves your order forward.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={() => submitDecision('approved')}
              disabled={submitting || showNotes}
              style={{ width: '100%', padding: '14px 0', fontSize: 16, fontWeight: 700, background: '#00FF66', border: 'none', borderRadius: 50, cursor: (submitting || showNotes) ? 'not-allowed' : 'pointer', color: '#000', fontFamily: 'inherit', opacity: (submitting || showNotes) ? 0.5 : 1, transition: 'opacity 0.15s' }}
            >
              Approve Quote
            </button>

            {!showNotes ? (
              <button
                onClick={() => setShowNotes(true)}
                disabled={submitting}
                style={{ width: '100%', padding: '14px 0', fontSize: 16, fontWeight: 600, background: 'transparent', border: '2px solid var(--border)', borderRadius: 50, cursor: submitting ? 'not-allowed' : 'pointer', color: 'var(--foreground)', fontFamily: 'inherit', opacity: submitting ? 0.5 : 1 }}
              >
                Request Revision
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Describe the changes needed *
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); setNotesError(''); }}
                  placeholder="e.g. Please reduce the quantity to 48 pieces, or adjust the color..."
                  rows={4}
                  style={{ width: '100%', padding: '10px 12px', fontSize: 14, background: '#F8F7F5', border: `1px solid ${notesError ? '#ff4444' : 'var(--border)'}`, borderRadius: 8, outline: 'none', boxSizing: 'border-box', color: '#1E0033', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5 }}
                />
                {notesError && <p style={{ fontSize: 11, color: '#ff4444', margin: 0 }}>{notesError}</p>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => { setShowNotes(false); setNotes(''); setNotesError(''); }}
                    style={{ flex: 1, padding: '12px 0', fontSize: 14, fontWeight: 500, background: 'transparent', border: '1px solid var(--border)', borderRadius: 50, cursor: 'pointer', color: 'var(--muted)', fontFamily: 'inherit' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => submitDecision('revision')}
                    disabled={submitting}
                    style={{ flex: 2, padding: '12px 0', fontSize: 15, fontWeight: 700, background: 'var(--foreground)', border: 'none', borderRadius: 50, cursor: submitting ? 'not-allowed' : 'pointer', color: 'var(--background)', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}
                  >
                    {submitting ? 'Sending…' : 'Submit Revision Request'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', paddingTop: '0.5rem' }}>
        <a href="mailto:hello@threadgiant.com" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
          Questions? Contact us →
        </a>
      </div>
    </div>
  );
}

export default function QuoteApprovalPage() {
  return (
    <Suspense fallback={
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '4rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: 15 }}>
        Loading quote…
      </div>
    }>
      <QuoteApprovalInner />
    </Suspense>
  );
}
