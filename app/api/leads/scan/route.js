import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { scanEventsForLeads } from '@/lib/eventbrite';
import { bulkInsertLeads } from '@/lib/leadsStorage';

export async function POST() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const location = process.env.EVENTBRITE_LOCATION;
  if (!location) {
    return NextResponse.json(
      { error: 'EVENTBRITE_LOCATION env var is not set. Add your city or zip code (e.g. "Chicago, IL").' },
      { status: 500 }
    );
  }

  try {
    const leads = await scanEventsForLeads({ location });
    const added = await bulkInsertLeads(leads);
    console.log(`[leads/scan] found=${leads.length} added=${added} location="${location}"`);
    return NextResponse.json({ found: leads.length, added });
  } catch (err) {
    console.error('[leads/scan] error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
