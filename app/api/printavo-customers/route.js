import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { listCustomers } from '@/lib/printavo';

export async function GET(request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  try {
    const result = await listCustomers(page);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[printavo-customers] error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}
