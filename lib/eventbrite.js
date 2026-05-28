/**
 * Eventbrite API client.
 *
 * Searches for upcoming events near a location and returns them as Lead objects.
 * Requires EVENTBRITE_API_KEY (OAuth personal token from eventbrite.com/account-settings/apps).
 * Requires EVENTBRITE_LOCATION (e.g. "Chicago, IL" or a zip code).
 */

import { createLead, estimateQtyFromAttendees } from './leads.js';

const BASE = 'https://www.eventbriteapi.com/v3';

function getToken() {
  const t = process.env.EVENTBRITE_API_KEY;
  if (!t) throw new Error('EVENTBRITE_API_KEY env var is not set');
  return t;
}

async function ebFetch(path, params = {}) {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Eventbrite ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Keywords that signal a high probability of needing custom shirts.
const SEARCH_KEYWORDS = [
  '5k run',
  'charity walk',
  'fun run',
  'sports tournament',
  'charity race',
  'community festival',
  'mud run',
  'color run',
  'half marathon',
  'softball tournament',
  'volleyball tournament',
  'soccer tournament',
];

/**
 * Scan Eventbrite for upcoming events and return them as Lead objects.
 * De-duplication against existing leads happens in leadsStorage.bulkInsertLeads.
 *
 * @param {{ location: string, radiusMi?: number, daysAhead?: number }} opts
 * @returns {Promise<import('./leads').Lead[]>}
 */
export async function scanEventsForLeads({ location, radiusMi = 50, daysAhead = 120 }) {
  const now = new Date();
  const startDate = now.toISOString().replace(/\.\d+Z$/, 'Z');
  const endDate = new Date(now.getTime() + daysAhead * 86_400_000)
    .toISOString()
    .replace(/\.\d+Z$/, 'Z');

  const seen = new Map(); // eventId → raw event, to dedupe across keywords

  for (const keyword of SEARCH_KEYWORDS) {
    try {
      const data = await ebFetch('/events/search/', {
        q: keyword,
        'location.address': location,
        'location.within': `${radiusMi}mi`,
        'start_date.range_start': startDate,
        'start_date.range_end': endDate,
        expand: 'organizer,venue',
        page_size: 20,
      });

      for (const event of data.events ?? []) {
        if (!seen.has(event.id)) seen.set(event.id, event);
      }
    } catch (err) {
      // Log per-keyword failure but continue scanning other keywords.
      console.error(`[eventbrite] keyword "${keyword}" error: ${err.message}`);
    }
  }

  return Array.from(seen.values()).map((event) => {
    const attendeeCount = event.capacity || null;
    return createLead({
      source: 'eventbrite',
      type: 'event',
      name: event.name?.text || 'Unnamed Event',
      contactName: event.organizer?.name || null,
      contactEmail: event.organizer?.email || null,
      website: event.url || null,
      location: event.venue?.address?.localized_address_display || null,
      eventDate: event.start?.utc || null,
      attendeeCount,
      estimatedQty: estimateQtyFromAttendees(attendeeCount),
      sourceUrl: event.url || null,
      externalId: `eventbrite:${event.id}`,
    });
  });
}
