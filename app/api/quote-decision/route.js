import { NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';
import { getInvoiceById, setQuoteStatus, QUOTE_STATUS_ID, QUOTE_APPROVED_STATUS_ID } from '@/lib/printavo';
import { verifyQuoteApprovalAccess } from '@/lib/accessControl';

// POST /api/quote-decision
// Records a customer's quote approval or revision request.
// Body: { invoiceId, token, decision: 'approved'|'revision', notes? }
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { invoiceId, token, decision, notes } = body;

  if (!invoiceId || !decision) {
    return NextResponse.json({ error: 'invoiceId and decision are required' }, { status: 400 });
  }
  if (!['approved', 'revision'].includes(decision)) {
    return NextResponse.json({ error: 'decision must be "approved" or "revision"' }, { status: 400 });
  }

  let invoice = null;
  try { invoice = await getInvoiceById(invoiceId); } catch { /* non-fatal */ }
  if (!invoice) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });

  const access = await verifyQuoteApprovalAccess(invoiceId, invoice, { token });
  if (!access.granted) {
    return NextResponse.json({ error: 'Invalid token' }, { status: access.status ?? 403 });
  }

  // Idempotent — return early if already decided
  try {
    const { blobs } = await list({ prefix: `quote-approvals/invoice-${invoiceId}.json` });
    if (blobs.length) {
      const existing = await fetch(blobs[0].url).then((r) => r.json());
      if (existing.decision) {
        return NextResponse.json({ success: true, alreadyDecided: true, decision: existing.decision });
      }
    }
  } catch { /* continue */ }

  // Persist decision
  console.log(`[quote-decision] ▶ invoiceId=${invoiceId} decision=${decision}`);
  await put(
    `quote-approvals/invoice-${invoiceId}.json`,
    JSON.stringify({ invoiceId, decision, notes: notes || null, decidedAt: new Date().toISOString() }),
    { access: 'public', addRandomSuffix: false },
  );

  // Update Printavo status — best-effort, non-fatal
  const targetStatusId = decision === 'approved' ? QUOTE_APPROVED_STATUS_ID : QUOTE_STATUS_ID;
  if (targetStatusId) {
    try {
      await setQuoteStatus(invoiceId, targetStatusId);
      console.log(`[quote-decision] ◀ status updated to ${targetStatusId}`);
    } catch (err) {
      console.error('[quote-decision] Printavo status update failed:', err.message);
    }
  } else {
    console.warn(
      `[quote-decision] ${decision === 'approved' ? 'QUOTE_APPROVED_STATUS_ID' : 'QUOTE_STATUS_ID'} is null — ` +
      'run scripts/find-printavo-status-id.mjs and populate lib/printavo.js'
    );
  }

  return NextResponse.json({ success: true, decision });
}
