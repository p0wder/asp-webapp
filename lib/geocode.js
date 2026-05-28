/**
 * Geocoding client using Nominatim (OpenStreetMap) — no API key required.
 * Returns formatted city/state suggestions for a search query.
 * Read-only; only logs on error.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org';

const US_STATE_ABBR = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI',
  Wyoming: 'WY',
};

function formatResult(r) {
  if (!r.address) return null;
  const addr = r.address;
  const place = addr.city || addr.town || addr.village || addr.municipality;
  if (!place) return null;

  if (addr.country_code === 'us') {
    const state = addr.state ? (US_STATE_ABBR[addr.state] ?? addr.state) : '';
    return state ? `${place}, ${state}` : place;
  }

  const region = addr.state || addr.county || '';
  return region ? `${place}, ${region}` : place;
}

/**
 * @param {string} query
 * @returns {Promise<{ label: string }[]>}
 */
export async function suggestLocations(query) {
  if (!query || query.trim().length < 2) return [];

  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('q', query.trim());
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '8');

  let res;
  try {
    res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'asp-webapp/1.0 (threadgiant.com)',
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error('[geocode] Nominatim request failed:', err.message);
    return [];
  }

  if (!res.ok) return [];

  const results = await res.json();
  const seen = new Set();
  const suggestions = [];

  for (const r of results) {
    const label = formatResult(r);
    if (label && !seen.has(label)) {
      seen.add(label);
      suggestions.push({ label });
    }
  }

  return suggestions;
}
