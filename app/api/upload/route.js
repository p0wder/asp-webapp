import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

/**
 * Returns true if the request originates from the app's own frontend.
 */
function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return origin === appUrl || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
}

export async function POST(request) {
  // ── Origin guard: only allow requests from this app's frontend ──────────
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');

  if (!filename) {
    return NextResponse.json({ error: 'filename query param is required' }, { status: 400 });
  }

  const blob = await put(`quote-artwork/${Date.now()}-${filename}`, request.body, {
    access: 'public',
    contentType: request.headers.get('content-type') || 'application/octet-stream',
  });

  return NextResponse.json(blob);
}
