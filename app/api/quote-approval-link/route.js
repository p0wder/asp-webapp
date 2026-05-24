import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateQuoteApprovalToken } from '@/lib/orderStatus';

// GET /api/quote-approval-link?id=<invoiceId>
// Admin-only. Returns the token-gated customer approval URL for a quote.
export async function GET(request) {
  const { userId, sessionClaims } = await auth();
  const isAdmin = userId && sessionClaims?.role === 'admin';
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const secret = process.env.STATUS_TOKEN_SECRET;
  if (!secret) return NextResponse.json({ error: 'STATUS_TOKEN_SECRET not configured' }, { status: 500 });

  const token = generateQuoteApprovalToken(id, secret);
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://aspmerch.vercel.app';
  const link = `${base}/quote-approval?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;

  return NextResponse.json({ link });
}
