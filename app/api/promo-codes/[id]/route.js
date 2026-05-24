import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getCode, saveCode, deleteCode } from '@/lib/promoCodesStorage';

export async function PATCH(request, { params }) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const existing = await getCode(id);
    if (!existing) return NextResponse.json({ error: 'Promo code not found' }, { status: 404 });

    const EDITABLE = ['enabled', 'value', 'expiresAt', 'maxUses'];
    const updates = {};
    for (const key of EDITABLE) {
      if (key in body) updates[key] = body[key];
    }

    if ('value' in updates) {
      const numValue = Number(updates.value);
      if (!numValue || numValue <= 0) {
        return NextResponse.json({ error: 'value must be a positive number' }, { status: 400 });
      }
      if (existing.type === 'percent' && numValue > 100) {
        return NextResponse.json({ error: 'percent value cannot exceed 100' }, { status: 400 });
      }
      updates.value = numValue;
    }

    if ('maxUses' in updates) {
      updates.maxUses = updates.maxUses ? Number(updates.maxUses) : null;
    }

    const updated = { ...existing, ...updates };
    await saveCode(updated);
    return NextResponse.json({ code: updated });
  } catch (error) {
    console.error(`[promo-codes PATCH] id=${id} error:`, error.message);
    return NextResponse.json({ error: 'Failed to update promo code' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const existing = await getCode(id);
    if (!existing) return NextResponse.json({ error: 'Promo code not found' }, { status: 404 });

    await deleteCode(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[promo-codes DELETE] id=${id} error:`, error.message);
    return NextResponse.json({ error: 'Failed to delete promo code' }, { status: 500 });
  }
}
