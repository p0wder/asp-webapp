/**
 * Promo code persistence adapter (I/O module).
 *
 * Stores all promo codes in a single JSON document in Vercel Blob at
 * `promo-codes/codes.json`. Reads the full list, mutates in memory, writes back.
 *
 * I/O module — lib/promoCodes.js (pure) MUST NOT import this file.
 * Mirrors the cart.js / cartStorage.js split (Constitution Principle IV).
 */

import { put, head } from '@vercel/blob';

const STORE_PATH = 'promo-codes/codes.json';

async function readStore() {
  let meta;
  try {
    meta = await head(STORE_PATH);
  } catch (err) {
    if (
      err?.name === 'BlobNotFoundError' ||
      err?.code === 'not_found' ||
      /not found/i.test(err?.message || '')
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

async function writeStore(codes) {
  await put(STORE_PATH, JSON.stringify(codes), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** @returns {Promise<import('./promoCodes').PromoCode[]>} */
export async function getAllCodes() {
  return readStore();
}

/** @returns {Promise<import('./promoCodes').PromoCode | null>} */
export async function getCode(id) {
  const codes = await readStore();
  return codes.find((c) => c.id === id) ?? null;
}

/**
 * Look up a code by its string value (case-insensitive).
 * @returns {Promise<import('./promoCodes').PromoCode | null>}
 */
export async function getCodeByString(code) {
  if (!code) return null;
  const codes = await readStore();
  return codes.find((c) => c.code === code.trim().toUpperCase()) ?? null;
}

/**
 * Upsert a PromoCode by id. Logs the write per Principle V.
 * @param {import('./promoCodes').PromoCode} promoCode
 * @returns {Promise<import('./promoCodes').PromoCode>}
 */
export async function saveCode(promoCode) {
  console.log(`[promoCodesStorage] ▶ save code=${promoCode.code} id=${promoCode.id}`);
  const codes = await readStore();
  const idx = codes.findIndex((c) => c.id === promoCode.id);
  if (idx >= 0) {
    codes[idx] = promoCode;
  } else {
    codes.push(promoCode);
  }
  await writeStore(codes);
  console.log(`[promoCodesStorage] ◀ saved code=${promoCode.code}`);
  return promoCode;
}

/**
 * Remove a promo code by id. Logs the deletion per Principle V.
 * @param {string} id
 */
export async function deleteCode(id) {
  console.log(`[promoCodesStorage] ▶ delete id=${id}`);
  const codes = await readStore();
  const filtered = codes.filter((c) => c.id !== id);
  await writeStore(filtered);
  console.log(`[promoCodesStorage] ◀ deleted id=${id}`);
}
