import { randomUUID } from 'crypto';

/**
 * @typedef {{
 *   id: string,
 *   source: 'eventbrite' | 'manual',
 *   type: 'event' | 'sports_league' | 'school' | 'other',
 *   status: 'new' | 'contacted' | 'quoted' | 'won' | 'lost' | 'skipped',
 *   name: string,
 *   contactName: string | null,
 *   contactEmail: string | null,
 *   contactPhone: string | null,
 *   website: string | null,
 *   location: string | null,
 *   eventDate: string | null,
 *   attendeeCount: number | null,
 *   estimatedQty: number | null,
 *   notes: string,
 *   sourceUrl: string | null,
 *   externalId: string | null,
 *   createdAt: string,
 *   updatedAt: string,
 * }} Lead
 */

export function createLead({
  source,
  type,
  name,
  contactName = null,
  contactEmail = null,
  contactPhone = null,
  website = null,
  location = null,
  eventDate = null,
  attendeeCount = null,
  estimatedQty = null,
  sourceUrl = null,
  externalId = null,
}) {
  if (!name || typeof name !== 'string') throw new Error('name is required');
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    source,
    type,
    status: 'new',
    name: name.trim(),
    contactName: contactName || null,
    contactEmail: contactEmail || null,
    contactPhone: contactPhone || null,
    website: website || null,
    location: location || null,
    eventDate: eventDate || null,
    attendeeCount: attendeeCount ? Number(attendeeCount) : null,
    estimatedQty: estimatedQty ? Number(estimatedQty) : null,
    notes: '',
    sourceUrl: sourceUrl || null,
    externalId: externalId || null,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateLead(lead, patch) {
  return { ...lead, ...patch, id: lead.id, createdAt: lead.createdAt, updatedAt: new Date().toISOString() };
}

/** Estimate shirt qty from attendee count (~80% typically order). */
export function estimateQtyFromAttendees(attendeeCount) {
  if (!attendeeCount) return null;
  return Math.round(attendeeCount * 0.8);
}
