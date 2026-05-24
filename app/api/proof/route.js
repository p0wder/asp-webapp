import { NextResponse } from 'next/server';
import { list } from '@vercel/blob';
import { getInvoiceById } from '@/lib/printavo';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const token = searchParams.get('token');

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // HMAC token uses the same proof token prefix: generateProofToken uses 'proof:{id}'
  // We verify using verifyStatusToken but with the proof-prefixed value
  const secret = process.env.STATUS_TOKEN_SECRET;
  const { createHmac } = await import('crypto');
  const expected = createHmac('sha256', secret || '').update(`proof:${id}`).digest('hex');
  const { timingSafeEqual } = await import('crypto');
  let tokenValid = false;
  try {
    if (token && token.length === expected.length) {
      tokenValid = timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
    }
  } catch { tokenValid = false; }

  if (!tokenValid) return NextResponse.json({ error: 'Invalid token' }, { status: 403 });

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
