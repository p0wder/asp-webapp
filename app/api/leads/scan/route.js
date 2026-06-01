import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { scanEventsForLeads } from '@/lib/runsignup';
import { scanSchoolsForLeads } from '@/lib/nces';
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

  // Run all sources in parallel — a failure in one doesn't block the others.
  const [eventsResult, schoolsResult] = await Promise.allSettled([
    scanEventsForLeads({ lat: coords.lat, lng: coords.lng }),
    coords.city && coords.stateCode
      ? scanSchoolsForLeads({ city: coords.city, stateCode: coords.stateCode })
      : Promise.resolve([]),
  ]);

  const events = eventsResult.status === 'fulfilled' ? eventsResult.value : [];
  const schools = schoolsResult.status === 'fulfilled' ? schoolsResult.value : [];

  if (eventsResult.status === 'rejected') {
    console.error('[leads/scan] events source failed:', eventsResult.reason?.message);
  }
  if (schoolsResult.status === 'rejected') {
    console.error('[leads/scan] schools source failed:', schoolsResult.reason?.message);
  }

  const allLeads = [...events, ...schools];
  const added = await bulkInsertLeads(allLeads);

  console.log(`[leads/scan] location="${location}" events=${events.length} schools=${schools.length} added=${added}`);

  return NextResponse.json({
    found: allLeads.length,
    added,
    location,
    breakdown: { events: events.length, schools: schools.length },
  });
}
