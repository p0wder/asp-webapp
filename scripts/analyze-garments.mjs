#!/usr/bin/env node
/**
 * Analyze Printavo order history to find the most-ordered garment styles
 * per garment type (T-Shirt, Hoodie, Headwear, etc.).
 *
 * Run: node --env-file=.env.local scripts/analyze-garments.mjs
 *
 * Optional flags:
 *   --limit 500     Stop after this many invoices (default: all)
 *   --min-orders 2  Only show styles ordered at least N times (default: 1)
 */

const API_URL = 'https://www.printavo.com/api/v2';
const email = process.env.PRINTAVO_EMAIL;
const token = process.env.PRINTAVO_API_TOKEN;

if (!email || !token) {
  console.error('Missing PRINTAVO_EMAIL or PRINTAVO_API_TOKEN env var.');
  console.error('Run: node --env-file=.env.local scripts/analyze-garments.mjs');
  process.exit(1);
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const invoiceLimit = parseInt(args[args.indexOf('--limit') + 1]) || Infinity;
const minOrders = parseInt(args[args.indexOf('--min-orders') + 1]) || 1;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function gql(query, variables = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      email,
      token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Printavo HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data;
}

/**
 * Classify a garment type from the line item description or item number.
 * Returns a broad category string.
 */
function classifyGarment(description, itemNumber) {
  const d = (description || '').toLowerCase();
  const i = (itemNumber || '').toLowerCase();

  if (d.includes('hoodie') || d.includes('hoody') || d.includes('full zip') || d.includes('pullover')) return 'Hoodie';
  if (d.includes('sweatshirt') || d.includes('crewneck') || d.includes('crew neck') || d.includes('fleece crew')) return 'Sweatshirt';
  if (d.includes('long sleeve') || d.includes('ls tee') || d.includes('l/s')) return 'Long Sleeve';
  if (d.includes('tank') || d.includes('muscle')) return 'Tank Top';
  if (d.includes('hat') || d.includes('cap') || d.includes('beanie') || d.includes('headwear') || d.includes('trucker') || d.includes('snapback') || d.includes('flexfit')) return 'Headwear';
  if (d.includes('jacket') || d.includes('quarter zip') || d.includes('1/4 zip') || d.includes('vest')) return 'Jacket / Outerwear';
  if (d.includes('polo') || d.includes('button')) return 'Polo / Button-Up';
  if (d.includes('tote') || d.includes('bag')) return 'Bag';

  // Fall back to item number pattern if description is generic
  // Common known style → category mappings
  const knownStyles = {
    '5000': 'T-Shirt', '5400': 'Long Sleeve', '2000': 'T-Shirt',
    '6210': 'T-Shirt', '6201': 'T-Shirt', '3600': 'T-Shirt',
    '18500': 'Hoodie', '18000': 'Sweatshirt', 'pc78h': 'Hoodie',
    'pc78': 'Sweatshirt', 'f170': 'Hoodie', 'dt6000': 'T-Shirt',
    '112fp': 'Headwear', '112': 'Headwear', '6277': 'Headwear',
    '6597': 'Headwear', 'c112': 'Headwear', 'cp77': 'Headwear',
  };
  if (knownStyles[i]) return knownStyles[i];

  // Last resort: if description looks like just a garment name
  if (d.includes('t-shirt') || d.includes('tshirt') || d.includes('tee')) return 'T-Shirt';

  return 'Other';
}

// ─── Fetch all invoices with line items ───────────────────────────────────────

const INVOICE_QUERY = `
  query ListInvoices($first: Int, $after: String) {
    invoices(first: $first, after: $after) {
      nodes {
        id
        visualId
        createdAt
        lineItemGroups {
          nodes {
            lineItems {
              nodes {
                description
                itemNumber
                items
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

console.log('Fetching Printavo invoice history...\n');

let cursor = null;
let hasMore = true;
let totalInvoices = 0;
let totalLineItems = 0;
let page = 0;

// styleKey → { orderCount, totalQty, descriptions: Set<string>, category }
const styleMap = new Map();

while (hasMore && totalInvoices < invoiceLimit) {
  page++;
  const batchSize = Math.min(25, invoiceLimit - totalInvoices);
  const vars = { first: batchSize };
  if (cursor) vars.after = cursor;

  let data;
  try {
    data = await gql(INVOICE_QUERY, vars);
  } catch (err) {
    console.error(`Page ${page} failed:`, err.message);
    break;
  }

  const invoices = data.invoices?.nodes || [];
  const pageInfo = data.invoices?.pageInfo;

  for (const invoice of invoices) {
    const lineItems = (invoice.lineItemGroups?.nodes || []).flatMap((g) => g.lineItems?.nodes || []);

    for (const li of lineItems) {
      const styleKey = (li.itemNumber || '').trim().toUpperCase();
      if (!styleKey) continue; // Skip line items with no style number

      const qty = parseInt(li.items) || 0;
      const category = classifyGarment(li.description, li.itemNumber);
      const desc = (li.description || '').trim();

      if (!styleMap.has(styleKey)) {
        styleMap.set(styleKey, { styleKey, orderCount: 0, totalQty: 0, descriptions: new Set(), category });
      }
      const entry = styleMap.get(styleKey);
      entry.orderCount += 1;
      entry.totalQty += qty;
      if (desc) entry.descriptions.add(desc);
      totalLineItems++;
    }
  }

  totalInvoices += invoices.length;
  hasMore = pageInfo?.hasNextPage || false;
  cursor = pageInfo?.endCursor || null;

  process.stdout.write(`  Page ${page}: ${invoices.length} invoices (running total: ${totalInvoices})\r`);
}

console.log(`\n\nScanned ${totalInvoices} invoices, ${totalLineItems} line items with a style number.\n`);

if (styleMap.size === 0) {
  console.log('No style numbers found in line items. Make sure itemNumber is populated in your Printavo orders.');
  process.exit(0);
}

// ─── Group by category and rank ───────────────────────────────────────────────

const categories = new Map();
for (const entry of styleMap.values()) {
  if (entry.orderCount < minOrders) continue;
  const cat = entry.category;
  if (!categories.has(cat)) categories.set(cat, []);
  categories.get(cat).push(entry);
}

// Sort categories by total orders descending
const sortedCategories = [...categories.entries()].sort(
  (a, b) => b[1].reduce((s, e) => s + e.orderCount, 0) - a[1].reduce((s, e) => s + e.orderCount, 0)
);

// ─── Output ───────────────────────────────────────────────────────────────────

const BAR_WIDTH = 30;

function bar(count, max) {
  const filled = Math.round((count / max) * BAR_WIDTH);
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
}

for (const [category, entries] of sortedCategories) {
  entries.sort((a, b) => b.orderCount - a.orderCount);
  const maxOrders = entries[0].orderCount;
  const categoryTotal = entries.reduce((s, e) => s + e.orderCount, 0);

  console.log('─'.repeat(70));
  console.log(`  ${category.toUpperCase()}  (${categoryTotal} total line-item appearances)`);
  console.log('─'.repeat(70));
  console.log(`  ${'Style'.padEnd(12)} ${'Orders'.padStart(6)}  ${'Qty'.padStart(6)}  Chart`);
  console.log(`  ${'─'.repeat(10)} ${'─'.repeat(6)}  ${'─'.repeat(6)}  ${'─'.repeat(BAR_WIDTH)}`);

  for (const entry of entries) {
    const descList = [...entry.descriptions].slice(0, 2).join(' / ');
    const truncDesc = descList.length > 35 ? descList.slice(0, 34) + '…' : descList;
    console.log(
      `  ${entry.styleKey.padEnd(12)} ${String(entry.orderCount).padStart(6)}  ${String(entry.totalQty).padStart(6)}  ${bar(entry.orderCount, maxOrders)}`
    );
    if (truncDesc) console.log(`  ${''.padEnd(12)} ${truncDesc}`);
  }
  console.log();
}

console.log('─'.repeat(70));
console.log(`\nDone. ${styleMap.size} unique styles found across ${totalInvoices} invoices.\n`);
console.log('Tip: Cross-reference top styles with S&S Activewear to confirm they');
console.log('     are still available, then update APPAREL_QUALITIES / HEADWEAR_QUALITIES');
console.log('     in app/quote/page.jsx with the most popular item numbers.\n');
