import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { isSameOrigin, checkContentLength, DEFAULT_MAX_UPLOAD_BYTES } from '@/lib/httpGuards';
import { rateLimit, clientKey, RATE_LIMIT_POLICIES } from '@/lib/rateLimit';

/**
 * POST /api/upload?filename=…
 *
 * Public artwork upload for the quote form, also used by the proof uploader
 * on /pipeline. It writes to Vercel Blob, so it is the most expensive public
 * route per request — an unbounded caller here costs storage directly.
 *
 * Controls (TG-001-07): shared origin guard, per-client rate limit, filename
 * validation, file-type allowlist and a hard byte cap. A request rejected by
 * any of them writes no blob (AC2).
 */

/**
 * Accepted extensions, mapped to the content type the blob is stored with.
 *
 * Keyed on extension rather than on the request's `Content-Type` because the
 * browser reports an empty type for `.ai` and `.eps` — the two formats the
 * quote form explicitly accepts — so a header-only check would reject real
 * customer artwork.
 *
 * Storing our own content type also matters: blobs are served from a public
 * URL, and echoing a client-supplied `text/html` back would make this route a
 * stored-XSS vector on that domain.
 */
const ALLOWED_EXTENSIONS = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  ai: 'application/postscript',
  eps: 'application/postscript',
};

const MAX_FILENAME_LENGTH = 120;

/** Control characters, which have no place in a stored object key. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Reject path traversal, path separators and control characters, while
 * leaving ordinary filename punctuation alone — `logo (1) v2.png` is a normal
 * name and must not be refused.
 *
 * @param {string} filename
 * @returns {boolean}
 */
function isSafeFilename(filename) {
  if (filename.length === 0 || filename.length > MAX_FILENAME_LENGTH) return false;
  if (filename.includes('/') || filename.includes('\\')) return false;
  if (filename.includes('..')) return false;
  return !CONTROL_CHARS.test(filename);
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const limit = rateLimit(clientKey(request, 'upload'), RATE_LIMIT_POLICIES.upload);
  if (!limit.allowed) {
    console.warn('[upload] rate limited', { limit: limit.limit });
    return NextResponse.json(
      { error: 'Too many uploads. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');

  if (!filename) {
    return NextResponse.json({ error: 'filename query param is required' }, { status: 400 });
  }
  if (!isSafeFilename(filename)) {
    return NextResponse.json({ error: 'filename is not acceptable' }, { status: 400 });
  }

  const extension = filename.includes('.')
    ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
    : '';
  const storedContentType = ALLOWED_EXTENSIONS[extension];

  if (!storedContentType) {
    return NextResponse.json(
      { error: 'Unsupported file type. Accepted: PNG, JPG, GIF, WEBP, SVG, PDF, AI, EPS.' },
      { status: 415 },
    );
  }

  const sizeCheck = checkContentLength(request, DEFAULT_MAX_UPLOAD_BYTES);
  if (!sizeCheck.ok) {
    return NextResponse.json({ error: sizeCheck.error }, { status: sizeCheck.status });
  }

  try {
    const blob = await put(`quote-artwork/${Date.now()}-${filename}`, request.body, {
      access: 'public',
      contentType: storedContentType,
    });
    return NextResponse.json(blob);
  } catch (err) {
    console.error('[upload] Blob write failed:', err?.message || err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 502 });
  }
}
