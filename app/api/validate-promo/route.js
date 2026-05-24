import { NextResponse } from 'next/server';
import { getCodeByString } from '@/lib/promoCodesStorage';
import { validateCode, applyDiscount, discountLabel } from '@/lib/promoCodes';

function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return (
    origin === appUrl ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')
  );
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { code, subtotal, email = null } = body;

  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }
  if (typeof subtotal !== 'number' || subtotal < 0) {
    return NextResponse.json({ error: 'subtotal must be a non-negative number' }, { status: 400 });
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
