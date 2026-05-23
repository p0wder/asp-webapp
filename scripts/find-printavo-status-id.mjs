#!/usr/bin/env node
// One-off: list Printavo statuses (id, name, type) so we can find the
// numeric IDs we need to hardcode in lib/printavo.js.
//
// Run: node --env-file=.env.local scripts/find-printavo-status-id.mjs
//
// Optionally pass a search substring to filter:
//   node --env-file=.env.local scripts/find-printavo-status-id.mjs "transit"

const API_URL = 'https://www.printavo.com/api/v2';
const email = process.env.PRINTAVO_EMAIL;
const token = process.env.PRINTAVO_API_TOKEN;

if (!email || !token) {
  console.error('Missing PRINTAVO_EMAIL or PRINTAVO_API_TOKEN env var.');
  console.error('Run with: node --env-file=.env.local scripts/find-printavo-status-id.mjs');
  process.exit(1);
}

const filter = (process.argv[2] || '').toLowerCase();

const query = `
  query AllStatuses {
    statuses(first: 200) {
      nodes {
        id
        name
        type
      }
    }
  }
`;

const res = await fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', email, token },
  body: JSON.stringify({ query }),
});

if (!res.ok) {
  console.error(`Printavo HTTP ${res.status}:`, await res.text());
  process.exit(1);
}

const json = await res.json();
if (json.errors?.length) {
  console.error('Printavo errors:', json.errors.map((e) => e.message).join('; '));
  process.exit(1);
}

const all = json.data?.statuses?.nodes || [];
const matched = filter
  ? all.filter((s) => s.name.toLowerCase().includes(filter))
  : all;

console.log(`Found ${matched.length}${filter ? ` matching "${filter}"` : ''} of ${all.length} total statuses:\n`);
for (const s of matched) {
  console.log(`  ${String(s.id).padEnd(10)} ${String(s.type || '').padEnd(12)} ${s.name}`);
}
