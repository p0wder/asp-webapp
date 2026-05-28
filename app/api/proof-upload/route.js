import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireAdmin } from '@/lib/adminAuth';
import { generateProofToken } from '@/lib/orderStatus';

export async function POST(request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const { invoiceId, proofUrl } = body;
  if (!invoiceId || !proofUrl) return NextResponse.json({ error: 'invoiceId and proofUrl are required' }, { status: 400 });

  const secret = process.env.STATUS_TOKEN_SECRET;
  if (!secret) return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });

  const token = generateProofToken(invoiceId, secret);
  const baseUrl = process.env.NEXTAUTH_URL || 'https://asp-webapp.vercel.app';
  const approvalLink = `${baseUrl}/proof?id=${encodeURIComponent(invoiceId)}&token=${token}`;

  await put(
    `proofs/invoice-${invoiceId}.json`,
    JSON.stringify({ proofUrl, invoiceId, uploadedAt: new Date().toISOString(), decision: null, decisionNotes: null }),
    { access: 'public', addRandomSuffix: false }
  );

  return NextResponse.json({ success: true, proofUrl, approvalLink });
}
