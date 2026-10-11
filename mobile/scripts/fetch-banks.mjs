#!/usr/bin/env node
// Fetches the real bank list (names, BICs, logos) from GoCardless Bank Account Data and
// writes src/data/banks.generated.json, which the app bundles. Runs at build time so the
// secret never reaches the app.
//
//   GOCARDLESS_SECRET_ID=… GOCARDLESS_SECRET_KEY=… node scripts/fetch-banks.mjs [country]
//
// Country defaults to BANKS_COUNTRY or "gb". Get a secret ID/key from
// https://bankaccountdata.gocardless.com → Developers → User secrets.
// Without credentials the file is left alone, so the app keeps whatever list it has.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = (process.env.GOCARDLESS_API || 'https://bankaccountdata.gocardless.com/api/v2').replace(/\/$/, '');
const country = (process.argv[2] || process.env.BANKS_COUNTRY || 'gb').toLowerCase();
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/data/banks.generated.json');
const { GOCARDLESS_SECRET_ID: secret_id, GOCARDLESS_SECRET_KEY: secret_key } = process.env;

if (!secret_id || !secret_key) {
  console.log('GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY not set; keeping the existing bank list.');
  process.exit(0);
}

async function call(method, url, body, token) {
  const res = await fetch(url, {
    method,
    headers: { accept: 'application/json', 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url.replace(API, '')} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const { access } = await call('POST', `${API}/token/new/`, { secret_id, secret_key });
const list = await call('GET', `${API}/institutions/?country=${encodeURIComponent(country)}`, null, access);

const institutions = list
  .filter((i) => i.id && i.name && !/^SANDBOXFINANCE/.test(i.id))
  .map((i) => ({ id: i.id, name: i.name.trim(), bic: i.bic || null, logo: i.logo || null }))
  .sort((a, b) => a.name.localeCompare(b.name));

if (!institutions.length) throw new Error(`GoCardless returned no institutions for "${country}".`);

fs.writeFileSync(
  out,
  JSON.stringify({ source: 'gocardless', country: country.toUpperCase(), fetchedAt: new Date().toISOString().slice(0, 10), institutions }, null, 2) + '\n',
);
console.log(`Wrote ${institutions.length} ${country.toUpperCase()} institutions from GoCardless to ${path.relative(process.cwd(), out)}`);
