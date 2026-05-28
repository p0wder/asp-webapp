import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { scanEventsForLeads } from '@/lib/runsignup';
import { geocodeLocation } from '@/lib/geocode';
import { bulkInsertLeads } from '@/lib/leadsStorage';

export async function POST(request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body = {};
  try { body = await request.json(); } catch { /* body is optional */ }

  const location = (body.location ?? '').trim() || process.env.EVENTBRITE_LOCATION;
  if (!location) {
    return NextResponse.json(
      { error: 'Provide a location to search (e.g. "Charlotte, NC").' },
      { status: 400 }
    );
  }

  const coords = await geocodeLocation(location);
  if (!coords) {
    return NextResponse.json(
      { error: `Could not find coordinates for "${location}". Try a more specific city name or zip code.` },
      { status: 400 }
    );
  }

  try {
    const leads = await scanEventsForLeads({ lat: coords.lat, lng: coords.lng });
    const added = await bulkInsertLeads(leads);
    console.log(`[leads/scan] found=${leads.length} added=${added} location="${location}"`);
    return NextResponse.json({ found: leads.length, added, location });
  } catch (err) {
    console.error('[leads/scan] error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
