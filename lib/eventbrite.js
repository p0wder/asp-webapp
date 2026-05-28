/**
 * Eventbrite API client.
 *
 * Searches for upcoming events near a location and returns them as Lead objects.
 * Requires EVENTBRITE_API_KEY (OAuth personal token from eventbrite.com/account-settings/apps).
 *
 * Uses coordinate-based search (geocoded via Nominatim) which is significantly
 * more reliable than Eventbrite's text-address search parameter.
 */

import { createLead, estimateQtyFromAttendees } from './leads.js';
import { geocodeLocation } from './geocode.js';

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
  const data = await res.json();
  // Eventbrite occasionally returns HTTP 200 with an error payload.
  if (data.error) {
    throw new Error(`Eventbrite: ${data.error_description || data.error}`);
  }
  return data;
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

  // Geocode first — coordinate search is far more reliable than location.address.
  const coords = await geocodeLocation(location);
  let locationParams;
  if (coords) {
    console.log(`[eventbrite] geocoded "${location}" → lat=${coords.lat} lng=${coords.lng}`);
    locationParams = {
      'location.latitude': coords.lat,
      'location.longitude': coords.lng,
      'location.within': `${radiusMi}mi`,
    };
  } else {
    console.log(`[eventbrite] geocode failed for "${location}", falling back to address string`);
    locationParams = {
      'location.address': location,
      'location.within': `${radiusMi}mi`,
    };
  }

  const seen = new Map();
  const errors = [];

  for (const keyword of SEARCH_KEYWORDS) {
    try {
      const data = await ebFetch('/events/search/', {
        q: keyword,
        ...locationParams,
        'start_date.range_start': startDate,
        'start_date.range_end': endDate,
        expand: 'organizer,venue',
        page_size: 20,
      });

      const count = data.events?.length ?? 0;
      console.log(`[eventbrite] keyword="${keyword}" → ${count} events`);
      for (const event of data.events ?? []) {
        if (!seen.has(event.id)) seen.set(event.id, event);
      }
    } catch (err) {
      console.error(`[eventbrite] keyword "${keyword}" error: ${err.message}`);
      errors.push(err.message);
    }
  }

  // If every single keyword request failed, surface the error to the caller
  // instead of silently returning an empty list.
  if (errors.length === SEARCH_KEYWORDS.length) {
    throw new Error(errors[0]);
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
