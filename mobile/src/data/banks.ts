// Real banks from Plaid's institution directory (names, logos, brand colours), baked in at
// build time by scripts/fetch-banks.mjs. Connecting to them is still simulated: approving
// shows sample accounts, because linking real accounts needs a server holding the Plaid secret.
import generated from './banks.generated.json';
import { Institution, institutions as sandboxInstitutions, SandboxAccount, sandboxAccounts } from './mock';

type RealBank = { id: string; name: string; colour: string | null; url: string | null; logo: string | null };

export const bankDirectory = {
  source: generated.source as 'plaid' | null,
  country: generated.country,
  fetchedAt: generated.fetchedAt as string | null,
};

// Fallback colours for banks Plaid has no brand colour for.
const palette = ['#1F4E79', '#00573F', '#6B2C91', '#B3261E', '#0B6E99', '#5B3A1A', '#2E3A59', '#00695C'];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// White text sits on the brand colour (sign-in page header), so very light colours are skipped.
const darkEnough = (hex: string | null): hex is string => {
  const m = hex?.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.6;
};

const isCardProvider = (name: string) => /card|amex|american express|barclaycard|capital one/i.test(name);

const realBanks: Institution[] = (generated.institutions as RealBank[]).map((b) => ({
  id: b.id,
  name: b.name,
  initial: b.name.replace(/^the\s+/i, '').charAt(0).toUpperCase(),
  brandColour: darkEnough(b.colour) ? (b.colour.startsWith('#') ? b.colour : `#${b.colour}`) : palette[hash(b.id) % palette.length],
  types: isCardProvider(b.name) ? 'Credit card' : 'Bank',
  logo: b.logo ?? undefined,
  real: true,
}));

// Familiar UK names first; the rest stay alphabetical.
const popular = ['Monzo', 'Barclays', 'HSBC', 'Lloyds', 'NatWest', 'Santander', 'Nationwide', 'Starling', 'Revolut', 'Halifax', 'Chase', 'First Direct', 'TSB', 'Metro Bank', 'Virgin Money', 'American Express'];
const rank = (name: string) => {
  const i = popular.findIndex((p) => name.toLowerCase().startsWith(p.toLowerCase()));
  return i < 0 ? popular.length : i;
};
realBanks.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

/** What the bank picker lists: real banks when the build has them, else the sandbox banks. */
export const pickerInstitutions: Institution[] = realBanks.length ? realBanks : sandboxInstitutions;

const byId = new Map([...sandboxInstitutions, ...realBanks].map((i) => [i.id, i]));
export const findInstitution = (id: string) => byId.get(id);

/** The accounts a bank "returns" on approval. Real banks get stable sample accounts. */
export function accountsFor(institutionId: string): SandboxAccount[] {
  if (sandboxAccounts[institutionId]) return sandboxAccounts[institutionId];
  const bank = byId.get(institutionId);
  if (!bank) return [];
  const h = hash(institutionId);
  const mask = (n: number) => String(1000 + ((h >>> n) % 9000));
  const short = bank.name.replace(/\s*\(.*\)\s*$/, '').replace(/\s+(bank|plc|uk|personal)$/i, '');
  if (bank.types === 'Credit card') {
    return [{ providerAccountId: `${institutionId}-card`, name: `${short} Credit Card`, mask: mask(2), kind: 'credit', balance: 120 + (h % 900) }];
  }
  return [
    { providerAccountId: `${institutionId}-current`, name: `${short} Current Account`, mask: mask(3), kind: 'current', balance: Math.round(400 + (h % 260000) / 100) },
    { providerAccountId: `${institutionId}-saver`, name: `${short} Saver`, mask: mask(7), kind: 'savings', balance: 500 + (h % 60) * 100 },
  ];
}
