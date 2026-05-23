/**
 * Order Attribution Record adapter (I/O module).
 *
 * Writes / reads attribution metadata for SS Activewear orders to Vercel
 * Blob, so the orders page can later derive partial state per Printavo
 * invoice via `(SS order history) JOIN (Order Attribution Records)`.
 *
 * Schema and lifecycle in
 * .specify/specs/002-printavo-order-notification/data-model.md.
 *
 * I/O module — `lib/orderClassification.js` (pure) MUST NOT import this
 * file. The convention mirrors `lib/cart.js` (pure) vs `lib/cartStorage.js`
 * (I/O) per Constitution Principle IV.
 */

import { put, head, list } from '@vercel/blob';

const SCHEMA_VERSION = 1;
const RECORD_PREFIX = 'ss-order-attribution/';
const INDEX_PREFIX = 'ss-order-attribution/by-invoice/';

function recordPath(orderRef) {
  return `${RECORD_PREFIX}${encodeURIComponent(orderRef)}.json`;
}

function indexPath(visualId) {
  return `${INDEX_PREFIX}${encodeURIComponent(String(visualId))}.json`;
}

/**
 * Validate a record before persisting. Throws on any defect.
 */
function validateRecord(record) {
  if (!record || typeof record !== 'object') throw new Error('record must be an object');
  if (!record.ssOrderRef) throw new Error('record.ssOrderRef is required');
  if (!Array.isArray(record.lines) || record.lines.length === 0) {
    throw new Error('record.lines must be a non-empty array');
  }
  const seen = new Set();
  for (const line of record.lines) {
    if (!line.sku) throw new Error('every record.line must include `sku`');
    if (typeof line.qty !== 'number' || line.qty <= 0) {
      throw new Error(`record.line[${line.sku}] qty must be a positive number`);
    }
    if (!line.sourceInvoiceId) throw new Error(`record.line[${line.sku}] sourceInvoiceId is required`);
    if (!line.sourceLineItemId) throw new Error(`record.line[${line.sku}] sourceLineItemId is required`);
    const key = `${line.sku}::${line.sourceInvoiceId}::${line.sourceLineItemId}`;
    if (seen.has(key)) {
      throw new Error(`record.lines has a duplicate (sku, sourceInvoiceId, sourceLineItemId) triple: ${key}`);
    }
    seen.add(key);
  }
}

/**
 * Persist one Order Attribution Record and update the per-invoice secondary
 * index for every distinct invoice referenced by its lines. The record blob
 * is atomic (single write); the index update is read-modify-write and so
 * carries a small race-window — acceptable for the admin-tool scale per the
 * data-model design.
 *
 * Logs the write per Principle V (this is a mutation).
 *
 * @param {Object} record — see data-model.md `OrderAttributionRecord` schema
 * @returns {Promise<{ ok: true, url: string, ssOrderRef: string }>}
 */
export async function writeRecord(record) {
  validateRecord(record);
  const payload = { schemaVersion: SCHEMA_VERSION, ...record };
  const body = JSON.stringify(payload);

  console.log(`[orderAttribution] ▶ write ssOrderRef=${record.ssOrderRef} lines=${record.lines.length}`);
  const blob = await put(recordPath(record.ssOrderRef), body, {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  console.log(`[orderAttribution] ◀ wrote ${blob.url}`);

  // Update per-invoice secondary index.
  const visualIds = Array.from(new Set(record.lines.map((l) => l.sourceInvoiceVisualId).filter(Boolean)));
  await Promise.all(
    visualIds.map(async (visualId) => {
      const existing = await readIndex(visualId);
      const orderRefs = new Set(existing?.orderRefs || []);
      orderRefs.add(record.ssOrderRef);
      const indexBody = JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        visualId,
        orderRefs: Array.from(orderRefs),
      });
      await put(indexPath(visualId), indexBody, {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    }),
  );

  return { ok: true, url: blob.url, ssOrderRef: record.ssOrderRef };
}

async function readJsonBlob(path) {
  let meta;
  try {
    meta = await head(path);
  } catch (err) {
    // @vercel/blob throws BlobNotFoundError for missing paths.
    if (err?.name === 'BlobNotFoundError' || err?.code === 'not_found' || /not found/i.test(err?.message || '')) {
      return null;
    }
    throw err;
  }
  if (!meta?.url) return null;
  const res = await fetch(meta.url, { cache: 'no-store' });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Blob fetch HTTP ${res.status} for ${path}`);
  }
  return res.json();
}

/**
 * Point-read of a single Order Attribution Record by SS order reference.
 * Returns null when the record does not exist.
 */
export async function readRecord(orderRef) {
  if (!orderRef) return null;
  try {
    return await readJsonBlob(recordPath(orderRef));
  } catch (err) {
    console.error(`[orderAttribution] readRecord(${orderRef}) failed:`, err.message);
    throw err;
  }
}

async function readIndex(visualId) {
  try {
    return await readJsonBlob(indexPath(visualId));
  } catch (err) {
    console.error(`[orderAttribution] readIndex(${visualId}) failed:`, err.message);
    throw err;
  }
}

/**
 * For a given Printavo invoice visualId, return all Order Attribution
 * Records that touched it. Reads the per-invoice index, then fans out to
 * read each record. Returns `[]` if the index is missing (the invoice has
 * never been the subject of an SS Activewear submission).
 *
 * @param {string} visualId — Printavo invoice visualId, without `#`
 * @returns {Promise<Array<Object>>}
 */
export async function listRecordsForInvoice(visualId) {
  const idx = await readIndex(visualId);
  if (!idx) return [];
  const refs = idx.orderRefs || [];
  const records = await Promise.all(refs.map((r) => readRecord(r)));
  return records.filter(Boolean);
}

/**
 * Diagnostic helper — list every persisted attribution record. Not used
 * in the request path; useful for one-off audits via a script.
 */
export async function listAllRecords() {
  const { blobs } = await list({ prefix: RECORD_PREFIX });
  return blobs.filter((b) => !b.pathname.startsWith(INDEX_PREFIX));
}
