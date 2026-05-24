import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getAllCodes, getCodeByString, saveCode } from '@/lib/promoCodesStorage';
import { createPromoCode } from '@/lib/promoCodes';

export async function GET() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const codes = await getAllCodes();
    return NextResponse.json({ codes });
  } catch (error) {
    console.error('[promo-codes GET] error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch promo codes' }, { status: 500 });
  }
}

export async function POST(request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { code, type, value, expiresAt, maxUses } = body;

  if (!code || typeof code !== 'string' || !code.trim()) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }
  if (type !== 'percent' && type !== 'fixed') {
    return NextResponse.json({ error: 'type must be "percent" or "fixed"' }, { status: 400 });
  }
  const numValue = Number(value);
  if (!numValue || numValue <= 0) {
    return NextResponse.json({ error: 'value must be a positive number' }, { status: 400 });
  }
  if (type === 'percent' && numValue > 100) {
    return NextResponse.json({ error: 'percent value cannot exceed 100' }, { status: 400 });
  }

  try {
    const existing = await getCodeByString(code);
    if (existing) {
      return NextResponse.json({ error: `Code "${code.trim().toUpperCase()}" already exists` }, { status: 409 });
    }

    const promoCode = createPromoCode({
      code,
      type,
      value: numValue,
      expiresAt: expiresAt || null,
      maxUses: maxUses ? Number(maxUses) : null,
    });

    await saveCode(promoCode);
    return NextResponse.json({ code: promoCode }, { status: 201 });
  } catch (error) {
    console.error('[promo-codes POST] error:', error.message);
    return NextResponse.json({ error: error.message || 'Failed to create promo code' }, { status: 500 });
  }
}
