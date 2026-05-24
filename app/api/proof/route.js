import { NextResponse } from 'next/server';
import { list } from '@vercel/blob';
import { getInvoiceById } from '@/lib/printavo';
import { verifyProofToken } from '@/lib/orderStatus';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const token = searchParams.get('token');

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const secret = process.env.STATUS_TOKEN_SECRET;
  if (!verifyProofToken(id, token, secret)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  }

  // Fetch proof blob
  const { blobs } = await list({ prefix: `proofs/invoice-${id}.json` });
  if (!blobs.length) return NextResponse.json({ error: 'Proof not found' }, { status: 404 });

  const blobRes = await fetch(blobs[0].url);
  const proofData = await blobRes.json();

  // Fetch invoice summary from Printavo
  let invoice = null;
  try { invoice = await getInvoiceById(id); } catch { /* non-fatal */ }

  return NextResponse.json({
    proofUrl: proofData.proofUrl,
    invoiceId: id,
    decision: proofData.decision,
    decisionNotes: proofData.decisionNotes,
    jobName: invoice?.nickname,
    visualId: invoice?.visualId,
  });
}
