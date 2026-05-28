/**
 * Lead persistence adapter (I/O module).
 * Stores all leads in a single JSON document in Vercel Blob at leads/leads.json.
 * Mirrors the promoCodesStorage pattern (Constitution Principle IV).
 */

import { put, head } from '@vercel/blob';

const STORE_PATH = 'leads/leads.json';

async function readStore() {
  let meta;
  try {
    meta = await head(STORE_PATH);
  } catch (err) {
    if (
      err?.name === 'BlobNotFoundError' ||
      err?.code === 'not_found' ||
      /not found|does not exist/i.test(err?.message || '')
    ) {
      return [];
    }
    throw err;
  }
  if (!meta?.url) return [];
  const res = await fetch(meta.url, { cache: 'no-store' });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Blob fetch HTTP ${res.status} for ${STORE_PATH}`);
  }
  return res.json();
}

async function writeStore(leads) {
  await put(STORE_PATH, JSON.stringify(leads), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** @returns {Promise<import('./leads').Lead[]>} */
export async function getAllLeads() {
  return readStore();
}

/** @returns {Promise<import('./leads').Lead | null>} */
export async function getLead(id) {
  const leads = await readStore();
  return leads.find((l) => l.id === id) ?? null;
}

/**
 * Upsert a lead by id.
 * @param {import('./leads').Lead} lead
 */
export async function saveLead(lead) {
  console.log(`[leadsStorage] ▶ save lead="${lead.name}" id=${lead.id}`);
  const leads = await readStore();
  const idx = leads.findIndex((l) => l.id === lead.id);
  if (idx >= 0) {
    leads[idx] = lead;
  } else {
    leads.push(lead);
  }
  await writeStore(leads);
  console.log(`[leadsStorage] ◀ saved lead="${lead.name}"`);
  return lead;
}

/**
 * Bulk-insert leads, skipping any that already exist by externalId.
 * Returns the count of newly added leads.
 * @param {import('./leads').Lead[]} newLeads
 * @returns {Promise<number>}
 */
export async function bulkInsertLeads(newLeads) {
  const leads = await readStore();
  let added = 0;
  for (const lead of newLeads) {
    const duplicate = leads.some(
      (l) => l.externalId && l.externalId === lead.externalId
    );
    if (!duplicate) {
      leads.push(lead);
      added++;
    }
  }
  if (added > 0) await writeStore(leads);
  return added;
}

/** @param {string} id */
export async function deleteLead(id) {
  console.log(`[leadsStorage] ▶ delete id=${id}`);
  const leads = await readStore();
  await writeStore(leads.filter((l) => l.id !== id));
  console.log(`[leadsStorage] ◀ deleted id=${id}`);
}
