import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { scanEventsForLeads } from '@/lib/eventbrite';
import { bulkInsertLeads } from '@/lib/leadsStorage';

export async function POST(request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body = {};
  try { body = await request.json(); } catch { /* body is optional */ }

  // Body location takes priority; env var is the fallback default.
  const location = (body.location ?? '').trim() || process.env.EVENTBRITE_LOCATION;
  if (!location) {
    return NextResponse.json(
      { error: 'Provide a location to search (e.g. "Chicago, IL"), or set EVENTBRITE_LOCATION in your environment.' },
      { status: 400 }
    );
  }

  try {
    const leads = await scanEventsForLeads({ location });
    const added = await bulkInsertLeads(leads);
    console.log(`[leads/scan] found=${leads.length} added=${added} location="${location}"`);
    return NextResponse.json({ found: leads.length, added, location });
  } catch (err) {
    console.error('[leads/scan] error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
