import { NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';
import { setQuoteStatus } from '@/lib/printavo';
import { verifyProofToken } from '@/lib/orderStatus';

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const { invoiceId, token, decision, notes } = body;

  if (!invoiceId || !token || !decision) {
    return NextResponse.json({ error: 'invoiceId, token, and decision are required' }, { status: 400 });
  }

  if (!['approved', 'changes_requested'].includes(decision)) {
    return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
  }

  const secret = process.env.STATUS_TOKEN_SECRET;
  if (!secret) return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });

  if (!verifyProofToken(invoiceId, token, secret)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  }

  // Read existing blob
  const { blobs } = await list({ prefix: `proofs/invoice-${invoiceId}.json` });
  if (!blobs.length) return NextResponse.json({ error: 'Proof not found' }, { status: 404 });

  const blobRes = await fetch(blobs[0].url);
  const existing = await blobRes.json();

  // Idempotent — don't overwrite an existing decision
  if (existing.decision) {
    return NextResponse.json({ success: true, alreadyDecided: true, decision: existing.decision });
  }

  // Persist decision to blob
  await put(
    `proofs/invoice-${invoiceId}.json`,
    JSON.stringify({ ...existing, decision, decisionNotes: notes || null, decidedAt: new Date().toISOString() }),
    { access: 'public', addRandomSuffix: false },
  );

  // Update Printavo status — best-effort, requires PROOF_APPROVED_STATUS_ID /
  // PROOF_CHANGES_STATUS_ID env vars to be set in Vercel. Skipped silently if absent.
  const targetStatusId = decision === 'approved'
    ? process.env.PROOF_APPROVED_STATUS_ID
    : process.env.PROOF_CHANGES_STATUS_ID;

  if (targetStatusId) {
    try {
      await setQuoteStatus(invoiceId, targetStatusId);
    } catch (err) {
      console.error('[proof-decision] Printavo status update failed:', err.message);
    }
  }

  return NextResponse.json({ success: true, decision });
}
