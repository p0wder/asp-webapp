import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';
import { lookupVariantsForLineItems } from '@/lib/ssActivewear';

/**
 * POST /api/ss-catalog-lookup
 *
 * See .specify/specs/001-ssactivewear-cart-ordering/contracts/ss-catalog-lookup.md
 *
 * Body: { items: [{ lineItemId, styleNumber, color }] }
 * Response: { success: true, results: [{ lineItemId, state, variants?, error? }] }
 */
export async function POST(request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items must be a non-empty array.' }, { status: 400 });
  }
  for (let i = 0; i < items.length; i++) {
    if (!items[i] || typeof items[i].lineItemId !== 'string' || !items[i].lineItemId) {
      return NextResponse.json(
        { error: `items[${i}].lineItemId is required.` },
        { status: 400 },
      );
    }
  }

  console.log('[ss-catalog-lookup] batch size:', items.length);

  const results = await lookupVariantsForLineItems(items);
  for (const r of results) {
    if (r.state === 'failed') {
      console.warn('[ss-catalog-lookup] item failed:', r.lineItemId, r.error);
    }
  }

  return NextResponse.json({ success: true, results });
}
