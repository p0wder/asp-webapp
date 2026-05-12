import { NextResponse } from 'next/server';
import { searchProducts } from '@/lib/printavo';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const first = parseInt(searchParams.get('first') || '25');

  try {
    const products = await searchProducts(query, first);
    const totalAmount = products.totalAmount ?? 0;
    console.log(`[search-products] query="${query}" totalAmount=${totalAmount} returned=${products.length}`);
    return NextResponse.json({ products, totalAmount });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
