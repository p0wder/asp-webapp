import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { suggestLocations } from '@/lib/geocode';

export async function GET(request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';

  if (q.trim().length < 2) return NextResponse.json({ suggestions: [] });

  try {
    const suggestions = await suggestLocations(q);
    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error('[location-suggest] error:', err.message);
    return NextResponse.json({ suggestions: [] });
  }
}
