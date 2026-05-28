import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getAllLeads, saveLead } from '@/lib/leadsStorage';
import { createLead } from '@/lib/leads';

export async function GET() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const leads = await getAllLeads();
    leads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return NextResponse.json({ leads });
  } catch (err) {
    console.error('[leads GET] error:', err.message);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
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

  const { name, type, contactName, contactEmail, contactPhone, website, location, eventDate, attendeeCount, notes } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  try {
    const lead = createLead({
      source: 'manual',
      type: type || 'other',
      name,
      contactName: contactName || null,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      website: website || null,
      location: location || null,
      eventDate: eventDate || null,
      attendeeCount: attendeeCount ? Number(attendeeCount) : null,
    });
    if (notes) lead.notes = String(notes);
    await saveLead(lead);
    return NextResponse.json({ lead }, { status: 201 });
  } catch (err) {
    console.error('[leads POST] error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
