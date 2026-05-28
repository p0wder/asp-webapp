import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getLead, saveLead, deleteLead } from '@/lib/leadsStorage';
import { updateLead } from '@/lib/leads';

const VALID_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost', 'skipped'];
const PATCHABLE = ['status', 'notes', 'contactName', 'contactEmail', 'contactPhone', 'estimatedQty'];

export async function PATCH(request, { params }) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const patch = {};
  for (const key of PATCHABLE) {
    if (key in body) patch[key] = body[key];
  }

  try {
    const updated = updateLead(lead, patch);
    await saveLead(updated);
    return NextResponse.json({ lead: updated });
  } catch (err) {
    console.error('[leads PATCH] error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  try {
    await deleteLead(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[leads DELETE] error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
