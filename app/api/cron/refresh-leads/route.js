import { NextResponse } from 'next/server';
import { scanEventsForLeads } from '@/lib/eventbrite';
import { bulkInsertLeads } from '@/lib/leadsStorage';

/**
 * Vercel cron endpoint — runs on the schedule in vercel.json.
 * Authenticated by Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/refresh-leads] CRON_SECRET is not set');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const location = process.env.EVENTBRITE_LOCATION;
  if (!location) {
    console.error('[cron/refresh-leads] EVENTBRITE_LOCATION is not set');
    return NextResponse.json({ error: 'EVENTBRITE_LOCATION not set' }, { status: 500 });
  }

  try {
    const leads = await scanEventsForLeads({ location });
    const added = await bulkInsertLeads(leads);
    console.log(`[cron/refresh-leads] found=${leads.length} added=${added}`);
    return NextResponse.json({ ok: true, found: leads.length, added });
  } catch (err) {
    console.error('[cron/refresh-leads] error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
