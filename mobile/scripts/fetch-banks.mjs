#!/usr/bin/env node
// Fetches the real bank list (names, logos, brand colours) from Plaid and writes
// src/data/banks.generated.json, which the app bundles. Runs at build time so the
// secret never reaches the app.
//
//   PLAID_CLIENT_ID=… PLAID_SECRET=… node scripts/fetch-banks.mjs [country]
//
// Country defaults to BANKS_COUNTRY or "GB". PLAID_ENV is "sandbox" (default) or "production";
// the sandbox returns the same institution directory. Keys: https://dashboard.plaid.com → Developers → Keys.
// Without credentials the file is left alone, so the app keeps whatever list it has.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const env = process.env.PLAID_ENV || 'sandbox';
const API = (process.env.PLAID_API || `https://${env}.plaid.com`).replace(/\/$/, '');
const country = (process.argv[2] || process.env.BANKS_COUNTRY || 'GB').toUpperCase();
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/data/banks.generated.json');
const { PLAID_CLIENT_ID: client_id, PLAID_SECRET: secret } = process.env;

// Logos are bundled as data URIs; past this budget, banks show their initial on their colour.
const LOGO_BUDGET = 900_000;
// Familiar UK names get their logos first.
const popular = ['Monzo', 'Barclays', 'HSBC', 'Lloyds', 'NatWest', 'Santander', 'Nationwide', 'Starling', 'Revolut', 'Halifax', 'Chase', 'First Direct', 'TSB', 'Metro Bank', 'Virgin Money', 'American Express', 'Royal Bank of Scotland', 'Co-operative', 'Bank of Scotland', 'Ulster'];
const rank = (name) => {
  const i = popular.findIndex((p) => name.toLowerCase().startsWith(p.toLowerCase()));
  return i < 0 ? popular.length : i;
};

if (!client_id || !secret) {
  console.log('PLAID_CLIENT_ID / PLAID_SECRET not set; keeping the existing bank list.');
  process.exit(0);
}

async function page(offset) {
  const res = await fetch(`${API}/institutions/get`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id, secret, count: 500, offset, country_codes: [country], options: { include_optional_metadata: true } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Plaid /institutions/get → ${res.status}: ${body.error_code ?? ''} ${body.error_message ?? ''}`.trim());
  return body;
}

const all = [];
for (;;) {
  const { institutions, total } = await page(all.length);
  all.push(...institutions);
  if (!institutions.length || all.length >= total) break;
}

// Drop Plaid's made-up test banks and duplicates.
const seen = new Set();
const banks = all
  .filter((i) => !/platypus|tartan|tattersall|houndstooth|flexible platypus/i.test(i.name))
  .filter((i) => !seen.has(i.institution_id) && seen.add(i.institution_id))
  .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

if (!banks.length) throw new Error(`Plaid returned no institutions for ${country}.`);

let spent = 0;
const institutions = banks.map((i) => {
  let logo = null;
  if (i.logo && spent + i.logo.length < LOGO_BUDGET) {
    logo = `data:image/png;base64,${i.logo}`;
    spent += logo.length;
  }
  return { id: i.institution_id, name: i.name.trim(), colour: i.primary_color || null, url: i.url || null, logo };
});

fs.writeFileSync(out, JSON.stringify({ source: 'plaid', country, fetchedAt: new Date().toISOString().slice(0, 10), institutions }, null, 2) + '\n');
console.log(`Wrote ${institutions.length} ${country} institutions from Plaid (${institutions.filter((i) => i.logo).length} with logos) to ${path.relative(process.cwd(), out)}`);
