/**
 * Ticketmaster Discovery API v2 client.
 *
 * Free tier at https://developer.ticketmaster.com — no partner approval needed,
 * 5,000 requests/day. Requires TICKETMASTER_API_KEY in environment.
 *
 * Returns events near a lat/lng as Lead objects. Skews toward sports, tournaments,
 * and community events — a better fit than Eventbrite for screen printing leads.
 */

import { createLead } from './leads.js';

const BASE = 'https://app.ticketmaster.com/discovery/v2';

function getKey() {
  const k = process.env.TICKETMASTER_API_KEY;
  if (!k) throw new Error('TICKETMASTER_API_KEY env var is not set');
  return k;
}

async function tmFetch(path, params = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('apikey', getKey());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ticketmaster ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  // Ticketmaster uses a fault envelope for some error cases.
  if (data.fault) throw new Error(`Ticketmaster: ${data.fault.faultstring ?? 'API error'}`);
  return data;
}

// Each entry is a separate search request. Mixing keyword and category searches
// casts a wide net for events that commonly need custom shirts.
const SEARCHES = [
  { keyword: '5k run' },
  { keyword: 'fun run' },
  { keyword: 'charity walk' },
  { keyword: 'tournament', classificationName: 'sports' },
  { keyword: 'festival' },
  { keyword: 'charity' },
  { classificationName: 'sports' }, // broad sports catchall
];

/**
 * @param {{ lat: number, lng: number, radiusMi?: number, daysAhead?: number }} opts
 * @returns {Promise<import('./leads').Lead[]>}
 */
export async function scanEventsForLeads({ lat, lng, radiusMi = 50, daysAhead = 120 }) {
  const now = new Date();
  const startDateTime = now.toISOString().slice(0, 19) + 'Z';
  const endDateTime = new Date(now.getTime() + daysAhead * 86_400_000).toISOString().slice(0, 19) + 'Z';

  const seen = new Map();
  const errors = [];

  for (const search of SEARCHES) {
    try {
      const data = await tmFetch('/events.json', {
        latlong: `${lat},${lng}`,
        radius: radiusMi,
        unit: 'miles',
        startDateTime,
        endDateTime,
        size: 20,
        ...search,
      });

      const events = data._embedded?.events ?? [];
      console.log(`[ticketmaster] keyword="${search.keyword ?? ''}" class="${search.classificationName ?? ''}" → ${events.length} events`);
      for (const event of events) {
        if (!seen.has(event.id)) seen.set(event.id, event);
      }
    } catch (err) {
      console.error(`[ticketmaster] search failed: ${err.message}`);
      errors.push(err.message);
    }
  }

  if (errors.length === SEARCHES.length) {
    throw new Error(errors[0]);
  }

  return Array.from(seen.values()).map((event) => {
    const venue = event._embedded?.venues?.[0];
    const city = venue?.city?.name;
    const state = venue?.state?.stateCode;
    const locationStr = [city, state].filter(Boolean).join(', ') || venue?.name || null;

    return createLead({
      source: 'ticketmaster',
      type: 'event',
      name: event.name,
      contactName: null,
      contactEmail: null,
      website: event.url || null,
      location: locationStr,
      eventDate: event.dates?.start?.dateTime || null,
      attendeeCount: null,
      estimatedQty: null,
      sourceUrl: event.url || null,
      externalId: `ticketmaster:${event.id}`,
    });
  });
}
