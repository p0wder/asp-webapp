import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';
import { getOpenQuotes } from '@/lib/printavo';

/**
 * GET /api/quotes
 *
 * Returns all open Printavo quotes for the admin pipeline dashboard.
 * Protected: requires a valid admin session.
 */
export async function GET() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const quotes = await getOpenQuotes();
    return NextResponse.json({ success: true, quotes });
  } catch (error) {
    console.error('[quotes] Failed to fetch open quotes:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch quotes: ' + error.message },
      { status: 500 },
    );
  }
}
