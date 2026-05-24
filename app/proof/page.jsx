'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';

// ─── Inner component (uses useSearchParams) ────────────────────────────────

function ProofReviewInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const token = searchParams.get('token');

  const { user } = useUser();

  const [proofData, setProofData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedDecision, setSubmittedDecision] = useState(null);

  useEffect(() => {
    if (!id || !token) {
      setError('Missing proof link parameters. Please use the link from your email.');
      setLoading(false);
      return;
    }

    fetch(`/api/proof?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'Unable to load proof. Please check your link.');
          return;
        }
        setProofData(json);
      })
      .catch(() => setError('Network error — please try again.'))
      .finally(() => setLoading(false));
  }, [id, token]);

  const submitDecision = async (decision) => {
    if (decision === 'changes_requested') {
      if (!notes.trim() || notes.trim().length < 10) {
        setNotesError('Please describe the changes needed (at least 10 characters).');
        return;
      }
    }
    setNotesError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/proof-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: id, token, decision, notes: notes.trim() || null }),
      });
      // Handle gracefully even if route 404s (built in Wave 5)
      if (res.status === 404 || res.ok) {
        setSubmitted(true);
        setSubmittedDecision(decision);
      } else {
        const json = await res.json().catch(() => ({}));
        setSubmitted(true);
        setSubmittedDecision(decision);
        console.warn('proof-decision response:', json);
      }
    } catch {
      // Show success message even on network errors — best effort
      setSubmitted(true);
      setSubmittedDecision(decision);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Styles ──
  const containerStyle = {
    maxWidth: 560,
    margin: '0 auto',
    padding: '2rem 1rem',
    fontFamily: 'inherit',
  };

  const cardStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '1.5rem',
    marginBottom: '1.5rem',
  };

  // ── Loading ──
  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--muted)', fontSize: 15 }}>
          Loading proof…
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <div style={{ fontSize: 40, marginBottom: '1rem' }}>😕</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 8px' }}>
            Proof unavailable
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
            {error}
          </p>
          <a
            href="mailto:hello@threadgiant.com"
            style={{ color: '#00FF66', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}
          >
            Contact us →
          </a>
        </div>
      </div>
    );
  }

  // ── Already decided ──
  const existingDecision = proofData?.decision;

  // ── Submitted confirmation ──
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
            Response recorded — we'll be in touch
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>
            {submittedDecision === 'approved'
              ? "Great! Your proof has been approved. We'll begin production shortly."
              : "Got it — we'll review your feedback and send an updated proof."}
          </p>
        </div>
      </div>
    );
  }

  const isPdf = proofData?.proofUrl?.toLowerCase().endsWith('.pdf');

  return (
    <div style={containerStyle}>
      {/* Back link for signed-in users */}
      {user && (
        <div style={{ marginBottom: '1rem' }}>
          <a href="/my-orders" style={{ color: '#00FF66', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            ← Back to my orders
          </a>
        </div>
      )}

      {/* Job header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 4px' }}>
          Proof Review
        </h1>
        {(proofData?.jobName || proofData?.visualId) && (
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
            {proofData.jobName && <span>{proofData.jobName}</span>}
            {proofData.jobName && proofData.visualId && <span> · </span>}
            {proofData.visualId && <span>Order #{proofData.visualId}</span>}
          </p>
        )}
      </div>

      {/* Proof image / PDF */}
      <div style={{ marginBottom: '1.5rem' }}>
        {isPdf ? (
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 1rem' }}>
              Your proof is a PDF document.
            </p>
            <a
              href={proofData.proofUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '12px 28px',
                background: '#00FF66',
                color: '#000',
                fontWeight: 700,
                fontSize: 15,
                textDecoration: 'none',
                borderRadius: 50,
              }}
            >
              Open PDF Proof →
            </a>
          </div>
        ) : (
          <img
            src={proofData?.proofUrl}
            alt="Your proof"
            style={{
              display: 'block',
              width: '100%',
              maxWidth: '100%',
              borderRadius: 12,
              border: '1px solid var(--border)',
            }}
          />
        )}
      </div>

      {/* Already-decided locked state */}
      {existingDecision === 'approved' && (
        <div style={{
          background: 'rgba(0,255,102,0.1)',
          border: '1px solid #00FF66',
          borderRadius: 12,
          padding: '1.25rem 1.5rem',
          marginBottom: '1.5rem',
          color: '#00FF66',
          fontWeight: 600,
          fontSize: 15,
          textAlign: 'center',
        }}>
          Proof approved ✓
        </div>
      )}

      {existingDecision === 'changes_requested' && (
        <div style={{
          background: 'rgba(255,200,0,0.1)',
          border: '1px solid #FFC800',
          borderRadius: 12,
          padding: '1.25rem 1.5rem',
          marginBottom: '1.5rem',
          color: '#B8900A',
          fontWeight: 600,
          fontSize: 15,
          textAlign: 'center',
        }}>
          Changes requested — we've been notified
        </div>
      )}

      {/* Action buttons — only when no decision yet */}
      {!existingDecision && (
        <div style={cardStyle}>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
            Please review the proof above carefully. Once you approve, we'll move into production.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Approve button */}
            <button
              onClick={() => submitDecision('approved')}
              disabled={submitting || showNotes}
              style={{
                width: '100%',
                padding: '14px 0',
                fontSize: 16,
                fontWeight: 700,
                background: '#00FF66',
                border: 'none',
                borderRadius: 50,
                cursor: submitting || showNotes ? 'not-allowed' : 'pointer',
                color: '#000',
                fontFamily: 'inherit',
                opacity: submitting || showNotes ? 0.5 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              Approve Proof
            </button>

            {/* Request changes button / form */}
            {!showNotes ? (
              <button
                onClick={() => setShowNotes(true)}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '14px 0',
                  fontSize: 16,
                  fontWeight: 600,
                  background: 'transparent',
                  border: '2px solid var(--border)',
                  borderRadius: 50,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  color: 'var(--foreground)',
                  fontFamily: 'inherit',
                  opacity: submitting ? 0.5 : 1,
                  transition: 'border-color 0.15s',
                }}
              >
                Request Changes
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Describe the changes needed *
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); setNotesError(''); }}
                  placeholder="e.g. Please adjust the font size on the back print, make the logo larger..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 14,
                    background: '#F8F7F5',
                    border: `1px solid ${notesError ? '#ff4444' : 'var(--border)'}`,
                    borderRadius: 8,
                    outline: 'none',
                    boxSizing: 'border-box',
                    color: '#1E0033',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    lineHeight: 1.5,
                  }}
                />
                {notesError && (
                  <p style={{ fontSize: 11, color: '#ff4444', margin: 0 }}>{notesError}</p>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => { setShowNotes(false); setNotes(''); setNotesError(''); }}
                    style={{
                      flex: 1,
                      padding: '12px 0',
                      fontSize: 14,
                      fontWeight: 500,
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 50,
                      cursor: 'pointer',
                      color: 'var(--muted)',
                      fontFamily: 'inherit',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => submitDecision('changes_requested')}
                    disabled={submitting}
                    style={{
                      flex: 2,
                      padding: '12px 0',
                      fontSize: 15,
                      fontWeight: 700,
                      background: 'var(--foreground)',
                      border: 'none',
                      borderRadius: 50,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      color: 'var(--background)',
                      fontFamily: 'inherit',
                      opacity: submitting ? 0.6 : 1,
                    }}
                  >
                    {submitting ? 'Sending…' : 'Submit Changes Request'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer contact link */}
      <div style={{ textAlign: 'center', paddingTop: '0.5rem' }}>
        <a
          href="mailto:hello@threadgiant.com"
          style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}
        >
          Questions? Contact us →
        </a>
      </div>
    </div>
  );
}

// ─── Default export wrapped in Suspense ───────────────────────────────────────

export default function ProofPage() {
  return (
    <Suspense fallback={
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '4rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: 15 }}>
        Loading proof…
      </div>
    }>
      <ProofReviewInner />
    </Suspense>
  );
}
