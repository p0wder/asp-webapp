import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { setQuoteStatus } from '@/lib/printavo';

export async function POST(request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const { quoteId, statusId } = body;
  if (!quoteId || !statusId) return NextResponse.json({ error: 'quoteId and statusId are required' }, { status: 400 });

  try {
    const result = await setQuoteStatus(quoteId, statusId);
    return NextResponse.json({ success: true, status: result?.status });
  } catch (err) {
    console.error('[quote-status-update]', err.message);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 502 });
  }
}
