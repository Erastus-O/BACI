// A local stand-in for the Plaid API, for tests and offline development. It speaks the same
// JSON as https://sandbox.plaid.com for the endpoints BACI uses and signs webhooks like Plaid.
//   node --import tsx test/fakePlaid.ts 5099
import { createServer, type Server } from 'node:http';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** ~4 months of believable UK current-account and card activity, ending today. */
export function sampleTransactions(today = new Date()) {
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const txs: { transaction_id: string; account_id: string; amount: number; date: string; name: string; merchant_name: string | null; pending: boolean; personal_finance_category: { primary: string } }[] = [];
  let n = 0;
  const add = (account: string, daysAgo: number, amount: number, name: string, merchant: string | null, cat: string) =>
    txs.push({ transaction_id: `tx_${++n}`, account_id: account, amount, date: iso(t0 - daysAgo * DAY), name, merchant_name: merchant, pending: false, personal_finance_category: { primary: cat } });
  const monthly = (dom: number, fn: (daysAgo: number) => void) => {
    for (let m = 0; m < 4; m++) {
      const d = new Date(t0);
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - m);
      d.setUTCDate(dom);
      const ago = Math.round((t0 - d.getTime()) / DAY);
      if (ago >= 0 && ago < 120) fn(ago);
    }
  };
  monthly(25, (a) => add('acc_current', a, -2650, 'ACME LTD SALARY', 'Acme Ltd', 'INCOME'));
  monthly(1, (a) => add('acc_current', a, 950, 'LANDLORD RENT SO', null, 'RENT_AND_UTILITIES'));
  monthly(5, (a) => add('acc_current', a, 152, 'COUNCIL TAX DD', 'Lambeth Council', 'GOVERNMENT_AND_NON_PROFIT'));
  monthly(12, (a) => add('acc_current', a, 10.99, 'NETFLIX.COM', 'Netflix', 'ENTERTAINMENT'));
  monthly(18, (a) => add('acc_card', a, 10.99, 'NETFLIX.COM', 'Netflix', 'ENTERTAINMENT'));
  monthly(20, (a) => add('acc_current', a, 185, 'ZOPA LOAN REPAYMENT', 'Zopa', 'LOAN_PAYMENTS'));
  for (let d = 2; d < 118; d += 3) add('acc_current', d, 18 + ((d * 7) % 23), 'TESCO STORES 3021', 'Tesco', 'FOOD_AND_DRINK');
  for (let d = 4; d < 118; d += 9) add('acc_card', d, 24 + ((d * 5) % 31), 'PRET A MANGER', 'Pret A Manger', 'FOOD_AND_DRINK');
  return txs;
}

export function startFakePlaid(port = 0) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const kid = 'test-key-1';
  const control = {
    /** Error code the next /accounts/get should fail with (e.g. ITEM_LOGIN_REQUIRED). */
    failAccounts: null as string | null,
    removed: [] as string[],
    tokens: new Map<string, string>(), // access_token → item_id
  };
  const txs = sampleTransactions();
  const accounts = [
    { account_id: 'acc_current', name: 'Monzo Current Account', official_name: null, mask: '4821', type: 'depository', subtype: 'checking', balances: { available: 1240.5, current: 1240.5, iso_currency_code: 'GBP' } },
    { account_id: 'acc_saver', name: 'Monzo Savings Pot', official_name: null, mask: '0093', type: 'depository', subtype: 'savings', balances: { available: 3000, current: 3000, iso_currency_code: 'GBP' } },
    { account_id: 'acc_card', name: 'Monzo Flex', official_name: null, mask: '7710', type: 'credit', subtype: 'credit card', balances: { available: 1550, current: 450, iso_currency_code: 'GBP' } },
  ];
  let n = 0;

  const routes: Record<string, (b: Record<string, any>) => [number, unknown]> = {
    '/link/token/create': (b) => [200, { link_token: `link-sandbox-${++n}${b.access_token ? '-update' : ''}`, expiration: new Date(Date.now() + 4 * 3600_000).toISOString(), _echo: b }],
    '/sandbox/public_token/create': () => [200, { public_token: `public-sandbox-${++n}` }],
    '/item/public_token/exchange': (b) => {
      if (!String(b.public_token).startsWith('public-')) return [400, { error_code: 'INVALID_PUBLIC_TOKEN', error_type: 'INVALID_INPUT', error_message: 'bad token' }];
      const access = `access-sandbox-${++n}`;
      const item = `item_${n}`;
      control.tokens.set(access, item);
      return [200, { access_token: access, item_id: item }];
    },
    '/accounts/get': (b) => {
      if (control.failAccounts) return [400, { error_code: control.failAccounts, error_type: 'ITEM_ERROR', error_message: control.failAccounts }];
      return [200, { accounts, item: { item_id: control.tokens.get(b.access_token), institution_id: 'ins_monzo' } }];
    },
    '/institutions/get_by_id': () => [200, { institution: { institution_id: 'ins_monzo', name: 'Monzo', logo: null, primary_color: '#14233c' } }],
    '/transactions/sync': (b) => {
      // Two pages, to exercise the cursor loop.
      const half = Math.ceil(txs.length / 2);
      if (!b.cursor) return [200, { added: txs.slice(0, half), modified: [], removed: [], next_cursor: 'c1', has_more: true, transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE' }];
      if (b.cursor === 'c1') return [200, { added: txs.slice(half), modified: [], removed: [], next_cursor: 'c2', has_more: false, transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE' }];
      return [200, { added: [], modified: [], removed: [], next_cursor: b.cursor, has_more: false }];
    },
    '/item/remove': (b) => {
      control.removed.push(b.access_token);
      return [200, { request_id: 'r' }];
    },
    '/webhook_verification_key/get': (b) => {
      if (b.key_id !== kid) return [400, { error_code: 'INVALID_KEY', error_type: 'INVALID_INPUT', error_message: 'unknown key' }];
      return [200, { key: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' } }];
    },
  };

  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const route = routes[req.url ?? ''];
      const body = raw ? JSON.parse(raw) : {};
      const [status, json] = !route
        ? [404, { error_code: 'NOT_FOUND', error_type: 'INVALID_REQUEST', error_message: req.url }]
        : body.client_id && body.secret
          ? route(body)
          : [400, { error_code: 'INVALID_API_KEYS', error_type: 'INVALID_INPUT', error_message: 'missing keys' }];
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    });
  });

  /** A Plaid-Verification header for this body, signed like Plaid's (ES256 JWT). */
  function signWebhook(body: string, iat = Math.floor(Date.now() / 1000)) {
    const h = Buffer.from(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify({ iat, request_body_sha256: createHash('sha256').update(body).digest('hex') })).toString('base64url');
    const s = sign('sha256', Buffer.from(`${h}.${p}`), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return `${h}.${p}.${s}`;
  }

  return new Promise<{ url: string; control: typeof control; signWebhook: typeof signWebhook; close: () => Promise<void> }>((resolve) =>
    server.listen(port, () => {
      const address = server.address() as { port: number };
      resolve({ url: `http://localhost:${address.port}`, control, signWebhook, close: () => new Promise((r) => server.close(() => r())) });
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const fake = await startFakePlaid(Number(process.argv[2] ?? 5099));
  console.log(`Fake Plaid on ${fake.url}`);
}
