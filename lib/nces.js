/**
 * NCES (National Center for Education Statistics) school discovery client.
 *
 * Uses the Urban Institute Education Data API — free, no API key required.
 * Finds high schools and colleges in a given city/state.
 *
 * Why schools? Every high school has athletic teams that need jerseys, spirit
 * wear programs, club shirts, and event apparel. Colleges add Greek life,
 * intramurals, and student orgs. These are high-value repeat customers.
 *
 * Docs: https://educationdata.urban.org/documentation/
 */

import { createLead } from './leads.js';

const BASE = 'https://educationdata.urban.org/api/v1';

async function edFetch(path, params = {}) {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'asp-webapp/1.0 (threadgiant.com)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Education Data API ${res.status}: ${text.slice(0, 150)}`);
  }
  return res.json();
}

/**
 * @param {{ city: string, stateCode: string }} opts
 * @returns {Promise<import('./leads').Lead[]>}
 */
export async function scanSchoolsForLeads({ city, stateCode }) {
  if (!city || !stateCode) throw new Error('city and stateCode required for school scan');

  const leads = [];
  const cityUpper = city.toUpperCase();
  const stateUpper = stateCode.toUpperCase();

  // High schools — athletic programs, sports jerseys, spirit wear, event shirts
  try {
    const data = await edFetch('/schools/ccd/directory/', {
      city: cityUpper,
      state_abbr: stateUpper,
      school_level: 3,
      per_page: 100,
    });

    const schools = data.results ?? [];
    console.log(`[nces] high schools in ${city}, ${stateCode}: ${schools.length}`);

    for (const s of schools) {
      const id = s.ncessch ?? s.school_id;
      const name = s.school_name;
      if (!name || !id) continue;

      leads.push(createLead({
        source: 'nces',
        type: 'school',
        name,
        contactName: null,
        contactEmail: null,
        contactPhone: s.phone ?? null,
        website: null,
        location: [s.city_location ?? s.city_mailing ?? city, stateCode].filter(Boolean).join(', '),
        eventDate: null,
        attendeeCount: s.enrollment ?? null,
        estimatedQty: null,
        sourceUrl: null,
        externalId: `nces:k12:${id}`,
      }));
    }
  } catch (err) {
    console.error('[nces] high schools error:', err.message);
  }

  // Colleges & universities — Greek life, intramurals, student orgs, athletics
  try {
    const data = await edFetch('/colleges/ipeds/directory/', {
      city: cityUpper,
      state_abbr: stateUpper,
      per_page: 50,
    });

    const colleges = data.results ?? [];
    console.log(`[nces] colleges in ${city}, ${stateCode}: ${colleges.length}`);

    for (const c of colleges) {
      const id = c.unitid;
      const name = c.inst_name;
      if (!name || !id) continue;

      const website = c.webaddr
        ? `https://${c.webaddr.replace(/^https?:\/\//, '')}`
        : null;

      leads.push(createLead({
        source: 'nces',
        type: 'school',
        name,
        contactName: null,
        contactEmail: null,
        contactPhone: null,
        website,
        location: [c.city ?? city, stateCode].filter(Boolean).join(', '),
        eventDate: null,
        attendeeCount: c.efug ?? c.eftotal ?? null,
        estimatedQty: null,
        sourceUrl: website,
        externalId: `nces:college:${id}`,
      }));
    }
  } catch (err) {
    console.error('[nces] colleges error:', err.message);
  }

  return leads;
}
