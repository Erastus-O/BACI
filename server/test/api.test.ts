// End to end against a real Postgres and the fake Plaid:
//   TEST_DATABASE_URL=postgres://postgres@localhost:5432/baci_test npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { createDb, type Db } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';
import { createPlaid } from '../src/plaid.ts';
import { startFakePlaid } from './fakePlaid.ts';

const dbUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl) throw new Error('Set TEST_DATABASE_URL to an empty Postgres database (it will be wiped).');

let db: Db;
let fake: Awaited<ReturnType<typeof startFakePlaid>>;
let app: ReturnType<typeof createApp>;

before(async () => {
  fake = await startFakePlaid();
  db = createDb(dbUrl);
  await db.query('drop schema public cascade; create schema public;');
  await migrate(db);
  const config = loadConfig({
    DATABASE_URL: dbUrl,
    ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    PLAID_CLIENT_ID: 'cid',
    PLAID_SECRET: 'sec',
    PLAID_BASE_URL: fake.url,
    PLAID_REDIRECT_URI_WEB: 'https://example.com/oauth',
    CORS_ORIGINS: 'https://app.example',
  });
  app = createApp({ db, plaid: createPlaid(config.plaid), config });
});

after(async () => {
  await db.close();
  await fake.close();
});

async function call(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any, headers: res.headers };
}

const permissions = { transactions: true, categories: true, bills: true, savings: true, credit: true, loans: true, overdraft: true, investments: false, income: true };
let token = '';
let connectionId = '';

test('health', async () => {
  assert.equal((await call('GET', '/health')).json.ok, true);
});

test('sign up, sign in, and wrong passwords', async () => {
  assert.equal((await call('POST', '/v1/auth/signup', { email: 'x', password: 'longenough1' })).status, 400);
  assert.equal((await call('POST', '/v1/auth/signup', { email: 'ada@example.com', password: 'short' })).status, 400);
  const up = await call('POST', '/v1/auth/signup', { email: 'Ada@Example.com', password: 'correct horse battery' });
  assert.equal(up.status, 201);
  assert.equal(up.json.state.user.email, 'ada@example.com');
  assert.equal(up.json.state.onboarding.step, 'consent');
  assert.equal((await call('POST', '/v1/auth/signup', { email: 'ada@example.com', password: 'correct horse battery' })).status, 409);
  assert.equal((await call('POST', '/v1/auth/login', { email: 'ada@example.com', password: 'nope nope nope' })).status, 401);
  const login = await call('POST', '/v1/auth/login', { email: 'ada@example.com', password: 'correct horse battery' });
  assert.equal(login.status, 200);
  token = login.json.token;
});

test('everything else needs a session', async () => {
  assert.equal((await call('GET', '/v1/state')).status, 401);
  assert.equal((await call('GET', '/v1/state', undefined, 'garbage')).status, 401);
  assert.equal((await call('GET', '/v1/state', undefined, token)).status, 200);
});

test('CORS allows the web app origin only', async () => {
  const ok = await app.request('/v1/state', { method: 'OPTIONS', headers: { origin: 'https://app.example', 'access-control-request-method': 'GET' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://app.example');
  const no = await app.request('/v1/state', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
  assert.notEqual(no.headers.get('access-control-allow-origin'), 'https://evil.example');
});

test('consent comes before connecting a bank, and is recorded', async () => {
  assert.equal((await call('POST', '/v1/plaid/link-token', { platform: 'web' }, token)).status, 403);
  assert.equal((await call('PATCH', '/v1/onboarding', { step: 'profile' }, token)).status, 403);
  const r = await call('PUT', '/v1/consent', { permissions, version: '2026-09.1' }, token);
  assert.equal(r.status, 200);
  assert.equal(r.json.consent.permissions.investments, false);
  const events = await db.query<{ action: string }>('select action from consent_events');
  assert.deepEqual(events.map((e) => e.action), ['granted']);
  assert.equal((await call('PATCH', '/v1/onboarding', { step: 'profile' }, token)).json.onboarding.step, 'profile');
});

test('profile is stored as declared', async () => {
  const at = new Date().toISOString();
  const r = await call('PUT', '/v1/profile', { profile: { buffer: { value: 400, source: 'user_declared', recordedAt: at }, junk: 1 } }, token);
  assert.equal(r.json.profile.buffer.value, 400);
  assert.equal(r.json.profile.junk, undefined);
});

test('Plaid Link token carries the OAuth redirect for the platform', async () => {
  const r = await call('POST', '/v1/plaid/link-token', { platform: 'web' }, token);
  assert.equal(r.status, 200);
  assert.match(r.json.linkToken, /^link-sandbox-/);
});

test('exchange → accounts discovered unselected, access token encrypted', async () => {
  const r = await call('POST', '/v1/plaid/exchange', { publicToken: 'public-sandbox-x', institution: { id: 'ins_monzo', name: 'Monzo' } }, token);
  assert.equal(r.status, 201);
  connectionId = r.json.connectionId;
  assert.deepEqual(r.json.discovered.map((d: any) => d.kind).sort(), ['credit', 'current', 'savings']);
  assert.equal(r.json.state.connections[0].institution.name, 'Monzo');
  assert.equal(r.json.state.connections[0].institution.colour, '#14233c');
  assert.ok(r.json.state.accounts.every((a: any) => !a.selected));
  const raw = await db.one<{ access_token_enc: string }>('select access_token_enc from items');
  assert.ok(!raw!.access_token_enc.includes('access-sandbox'), 'token is not stored in plain text');
});

test('select accounts, sync → real balances, bills, income, insight', async () => {
  const picked = ['acc_card', 'acc_current'];
  const sel = await call('POST', `/v1/connections/${connectionId}/accounts`, { accountIds: picked }, token);
  assert.deepEqual(sel.json.accounts.filter((a: any) => a.selected).map((a: any) => a.providerAccountId).sort(), picked);
  const s = await call('POST', `/v1/connections/${connectionId}/sync`, {}, token);
  assert.equal(s.status, 200);
  assert.equal(s.json.ok, true);
  const st = s.json.state;
  assert.equal(st.connections[0].status, 'active');
  assert.ok(st.connections[0].stats.transactions > 50);
  assert.equal(st.accounts.find((a: any) => a.providerAccountId === 'acc_current').balance, 1240.5);
  assert.equal(st.accounts.find((a: any) => a.providerAccountId === 'acc_card').balance, 450);
  assert.ok(st.finance.commitments.some((c: any) => c.label === 'Netflix'));
  assert.equal(st.finance.forecast.nextIncome.amount, 2650);
  assert.match(st.finance.insights[0].title, /Netflix twice/);
});

test('another user cannot see or touch this connection', async () => {
  const other = (await call('POST', '/v1/auth/signup', { email: 'eve@example.com', password: 'another long one' })).json.token;
  assert.equal((await call('GET', '/v1/state', undefined, other)).json.connections.length, 0);
  assert.equal((await call('POST', `/v1/connections/${connectionId}/sync`, {}, other)).status, 403); // no consent yet
  await call('PUT', '/v1/consent', { permissions, version: '2026-09.1' }, other);
  assert.equal((await call('POST', `/v1/connections/${connectionId}/sync`, {}, other)).status, 404);
  assert.equal((await call('DELETE', `/v1/connections/${connectionId}`, undefined, other)).status, 404);
});

test('bank asks to re-authenticate → reauth_required; update mode fixes it', async () => {
  fake.control.failAccounts = 'ITEM_LOGIN_REQUIRED';
  const r = await call('POST', `/v1/connections/${connectionId}/sync`, {}, token);
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'reauth_required');
  assert.equal((await call('GET', '/v1/state', undefined, token)).json.connections[0].status, 'reauth_required');
  const link = await call('POST', '/v1/plaid/link-token', { platform: 'ios', connectionId }, token);
  assert.match(link.json.linkToken, /-update$/);
  fake.control.failAccounts = null;
  const fixed = await call('POST', `/v1/connections/${connectionId}/reauthorised`, {}, token);
  assert.equal(fixed.json.connections[0].status, 'active');
});

test('other provider errors mark the selected accounts as failed, not estimated', async () => {
  fake.control.failAccounts = 'INSTITUTION_DOWN';
  const r = await call('POST', `/v1/connections/${connectionId}/sync`, {}, token);
  fake.control.failAccounts = null;
  assert.equal(r.json.ok, false);
  assert.equal(r.json.partial, true);
  assert.equal(r.json.state.connections[0].status, 'error');
  assert.ok(r.json.state.accounts.filter((a: any) => a.selected).every((a: any) => a.syncFailed));
});

test('webhooks must be signed by Plaid; signed ones trigger a sync', async () => {
  const item = await db.one<{ plaid_item_id: string }>('select plaid_item_id from items');
  const body = JSON.stringify({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: item!.plaid_item_id });
  assert.equal((await call('POST', '/v1/plaid/webhook', body)).status, 401);
  assert.equal((await call('POST', '/v1/plaid/webhook', body, undefined, { 'plaid-verification': fake.signWebhook('{"tampered":true}') })).status, 401);
  assert.equal((await call('POST', '/v1/plaid/webhook', body, undefined, { 'plaid-verification': fake.signWebhook(body, Math.floor(Date.now() / 1000) - 600) })).status, 401);
  const ok = await call('POST', '/v1/plaid/webhook', body, undefined, { 'plaid-verification': fake.signWebhook(body) });
  assert.equal(ok.status, 200);
  assert.equal((await call('GET', '/v1/state', undefined, token)).json.connections[0].status, 'active');
  const expiring = JSON.stringify({ webhook_type: 'ITEM', webhook_code: 'PENDING_EXPIRATION', item_id: item!.plaid_item_id });
  await call('POST', '/v1/plaid/webhook', expiring, undefined, { 'plaid-verification': fake.signWebhook(expiring) });
  assert.equal((await call('GET', '/v1/state', undefined, token)).json.connections[0].status, 'reauth_required');
});

test('revoking consent stops analysis but keeps connections', async () => {
  const r = await call('DELETE', '/v1/consent', undefined, token);
  assert.equal(r.json.consent, null);
  assert.equal(r.json.finance, null);
  assert.equal(r.json.connections.length, 1);
  await call('PUT', '/v1/consent', { permissions, version: '2026-09.1' }, token);
});

test('disconnect revokes at Plaid and deletes the data', async () => {
  const r = await call('DELETE', `/v1/connections/${connectionId}`, undefined, token);
  assert.equal(r.json.connections.length, 0);
  assert.equal(fake.control.removed.length, 1);
  assert.equal((await db.one<{ n: number }>('select count(*)::int as n from transactions'))!.n, 0);
});

test('delete my account removes everything', async () => {
  await call('POST', '/v1/plaid/exchange', { publicToken: 'public-sandbox-y' }, token);
  assert.equal((await call('DELETE', '/v1/me', undefined, token)).status, 200);
  assert.equal((await call('GET', '/v1/state', undefined, token)).status, 401);
  assert.equal((await db.one<{ n: number }>(`select count(*)::int as n from users where email = 'ada@example.com'`))!.n, 0);
  assert.equal((await db.one<{ n: number }>('select count(*)::int as n from items'))!.n, 0);
  assert.equal(fake.control.removed.length, 2);
});

test('sandbox shortcut is off unless enabled', async () => {
  const t = (await call('POST', '/v1/auth/login', { email: 'eve@example.com', password: 'another long one' })).json.token;
  assert.equal((await call('POST', '/v1/plaid/exchange', { sandbox: true }, t)).status, 403);
});

test('sign out ends the session', async () => {
  const t = (await call('POST', '/v1/auth/login', { email: 'eve@example.com', password: 'another long one' })).json.token;
  assert.equal((await call('POST', '/v1/auth/logout', {}, t)).status, 200);
  assert.equal((await call('GET', '/v1/state', undefined, t)).status, 401);
});
