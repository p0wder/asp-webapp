import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request) {
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
