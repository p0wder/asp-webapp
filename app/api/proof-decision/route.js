import { NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';
import { getInvoiceById, setQuoteStatus, ART_APPROVED_STATUS_ID, DESIGN_NEEDED_STATUS_ID } from '@/lib/printavo';
import { verifyProofAccess } from '@/lib/accessControl';

// Supports both HMAC token access (unauthenticated) and Clerk session access (logged-in customers)
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const { invoiceId, token, decision, notes } = body;

  if (!invoiceId || !decision) {
    return NextResponse.json({ error: 'invoiceId and decision are required' }, { status: 400 });
  }

  if (!['approved', 'changes_requested'].includes(decision)) {
    return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
  }

  // Fetch invoice to get contact email for Clerk access check
  let invoice = null;
  try { invoice = await getInvoiceById(invoiceId); } catch { /* non-fatal */ }
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  const access = await verifyProofAccess(invoiceId, invoice, { token });
  if (!access.granted) {
    return NextResponse.json({ error: 'Invalid token' }, { status: access.status ?? 403 });
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

  // Update Printavo status — best-effort, non-fatal
  const targetStatusId = decision === 'approved' ? ART_APPROVED_STATUS_ID : DESIGN_NEEDED_STATUS_ID;
  try {
    await setQuoteStatus(invoiceId, targetStatusId);
  } catch (err) {
    console.error('[proof-decision] Printavo status update failed:', err.message);
  }

  return NextResponse.json({ success: true, decision });
}
