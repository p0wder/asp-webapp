/**
 * RunSignup REST API client.
 *
 * RunSignup is the dominant platform for local community races and runs:
 * 5K, 10K, fun runs, charity walks, half marathons. These events typically
 * order 50–500 custom shirts each — exactly the right size for a screen printer.
 *
 * No API key required. Uses the public tmp_key=PUBLIC access grant.
 * Docs: https://runsignup.com/API
 */

import { createLead, estimateQtyFromAttendees } from './leads.js';

const BASE = 'https://runsignup.com/Rest';

async function rsFetch(path, params = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('tmp_key', 'PUBLIC');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'asp-webapp/1.0 (threadgiant.com)' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RunSignup ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(`RunSignup: ${data.error}`);
  return data;
}

/**
 * Scan RunSignup for upcoming local races and return them as Lead objects.
 *
 * @param {{ lat: number, lng: number, radiusMi?: number, daysAhead?: number }} opts
 * @returns {Promise<import('./leads').Lead[]>}
 */
export async function scanEventsForLeads({ lat, lng, radiusMi = 50, daysAhead = 120 }) {
  const today = new Date();
  const minDate = today.toISOString().slice(0, 10);
  const maxDate = new Date(today.getTime() + daysAhead * 86_400_000).toISOString().slice(0, 10);

  const data = await rsFetch('/races', {
    near_lat: lat,
    near_long: lng,
    distance_in_miles: radiusMi,
    start_date_min: minDate,
    start_date_max: maxDate,
    results_per_page: 100,
    page: 1,
    include_waiver: 'F',
    include_questions: 'F',
  });

  const races = data.races ?? [];
  console.log(`[runsignup] found ${races.length} races within ${radiusMi}mi of ${lat},${lng}`);

  return races.map(({ race }) => {
    const addr = race.address ?? {};
    const city = addr.city || '';
    const state = addr.state || '';
    const locationStr = [city, state].filter(Boolean).join(', ') || null;
    const participantCount = race.registration_count || null;

    return createLead({
      source: 'runsignup',
      type: 'event',
      name: race.name,
      contactName: race.contact_name || null,
      contactEmail: race.contact_email || null,
      website: race.url || null,
      location: locationStr,
      eventDate: race.next_date ? `${race.next_date}T08:00:00Z` : null,
      attendeeCount: participantCount,
      estimatedQty: estimateQtyFromAttendees(participantCount),
      sourceUrl: race.url || null,
      externalId: `runsignup:${race.race_id}`,
    });
  });
}
