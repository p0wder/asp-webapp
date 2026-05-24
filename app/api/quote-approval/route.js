import { NextResponse } from 'next/server';
import { list } from '@vercel/blob';
import { getInvoiceById } from '@/lib/printavo';
import { verifyQuoteApprovalAccess } from '@/lib/accessControl';

// GET /api/quote-approval?id=<invoiceId>&token=<token>
// Returns quote summary for the customer-facing approval page.
// Accepts HMAC token (unauthenticated email link) or Clerk session.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const token = searchParams.get('token');

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  let invoice = null;
  try { invoice = await getInvoiceById(id); } catch { /* non-fatal */ }
  if (!invoice) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });

  const access = await verifyQuoteApprovalAccess(id, invoice, { token });
  if (!access.granted) {
    return NextResponse.json({ error: 'Invalid or missing approval link' }, { status: access.status ?? 403 });
  }

  // Check for an existing decision record in blob
  let existingDecision = null;
  try {
    const { blobs } = await list({ prefix: `quote-approvals/invoice-${id}.json` });
    if (blobs.length) {
      const blobRes = await fetch(blobs[0].url);
      const data = await blobRes.json();
      existingDecision = data.decision || null;
    }
  } catch { /* blob miss is fine — no decision yet */ }

  return NextResponse.json({
    invoiceId: id,
    jobName: invoice.nickname,
    visualId: invoice.visualId,
    total: invoice.total,
    statusName: invoice.status?.name,
    customerDueAt: invoice.customerDueAt,
    decision: existingDecision,
  });
}
