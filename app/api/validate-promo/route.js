import { NextResponse } from 'next/server';
import { getCodeByString } from '@/lib/promoCodesStorage';
import { validateCode, applyDiscount, discountLabel } from '@/lib/promoCodes';
import { isSameOrigin, readJsonBody, isBoundedString } from '@/lib/httpGuards';
import { rateLimit, clientKey, RATE_LIMIT_POLICIES } from '@/lib/rateLimit';

/**
 * POST /api/validate-promo
 *
 * Public promo-code check. Read-only, but enumerable — without a limit it is
 * a guessing oracle for the whole code list — so it carries the shared origin
 * guard, a per-client rate limit and a bounded body (TG-001-07).
 */

/** Promo codes are short; anything longer is not a code. */
const MAX_CODE_LENGTH = 64;

/** Guards against a subtotal that would overflow discount arithmetic. */
const MAX_SUBTOTAL = 1_000_000;

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const limit = rateLimit(clientKey(request, 'validate-promo'), RATE_LIMIT_POLICIES.validatePromo);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = await readJsonBody(request, { maxBytes: 4 * 1024 });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const { code, subtotal, email = null } = parsed.body || {};

  if (!isBoundedString(code, { max: MAX_CODE_LENGTH })) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }
  if (typeof subtotal !== 'number' || !Number.isFinite(subtotal) || subtotal < 0 || subtotal > MAX_SUBTOTAL) {
    return NextResponse.json({ error: 'subtotal must be a non-negative number' }, { status: 400 });
  }
  if (email !== null && !isBoundedString(email, { max: 254 })) {
    return NextResponse.json({ error: 'email must be a string when provided' }, { status: 400 });
  }

  try {
    const found = await getCodeByString(code);
    const reason = validateCode(found, new Date().toISOString(), email);

    if (reason) {
      return NextResponse.json({ valid: false, message: reason });
    }

    const discountAmount = applyDiscount(found, subtotal);
    const label = discountLabel(found);

    return NextResponse.json({
      valid: true,
      type: found.type,
      value: found.value,
      discountAmount,
      isPersonalized: !!found.restrictedToEmail,
      message: `${found.code} — ${label}`,
    });
  } catch (error) {
    console.error('[validate-promo] error:', error.message);
    return NextResponse.json({ error: 'Failed to validate promo code' }, { status: 500 });
  }
}
