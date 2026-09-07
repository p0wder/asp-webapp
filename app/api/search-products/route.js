import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { searchProducts } from '@/lib/printavo';

/**
 * GET /api/search-products?q=…&first=25
 *
 * Admin-only Printavo product search.
 *
 * Constitution Principle VII requires two layers. The `proxy.js` matcher is
 * one; `requireAdmin()` below is the other. Before TG-001-06 this route had
 * only the matcher (variance V2), so a single matcher regression would have
 * exposed Printavo catalog data and order totals outright.
 */
export async function GET(request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const parsedFirst = Number.parseInt(searchParams.get('first') || '25', 10);
  const first = Number.isFinite(parsedFirst) ? Math.min(Math.max(parsedFirst, 1), 100) : 25;

  try {
    const products = await searchProducts(query, first);
    const totalAmount = products.totalAmount ?? 0;
    console.log('[search-products] query executed', {
      queryLength: query.length,
      first,
      returned: products.length,
    });
    return NextResponse.json({ products, totalAmount });
  } catch (err) {
    console.error('[search-products] Printavo search failed:', err?.message || err);
    return NextResponse.json({ error: 'Product search failed' }, { status: 502 });
  }
}
