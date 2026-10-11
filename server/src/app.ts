import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import type { Config } from './config.ts';
import type { Db } from './db.ts';
import { PlaidError, type Plaid, type Platform } from './plaid.ts';
import { encrypt, decrypt, hashPassword, newSessionToken, rateLimiter, sha256, verifyPassword } from './security.ts';
import { buildState } from './state.ts';
import { refreshAccounts, syncItem, type ItemRow } from './sync.ts';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const STEPS = ['welcome', 'consent', 'profile', 'connect', 'accounts', 'first_insight', 'done'];
const CATEGORIES = ['transactions', 'categories', 'bills', 'savings', 'credit', 'loans', 'overdraft', 'investments', 'income'];
const PROFILE_KEYS = ['income', 'status', 'goal', 'risk', 'frequency', 'buffer'];

type Env = { Variables: { userId: string } };

export function createApp({ db, plaid, config }: { db: Db; plaid: Plaid; config: Config }) {
  const app = new Hono<Env>();
  const loginLimit = rateLimiter(10, 15 * 60_000);
  const signupLimit = rateLimiter(20, 60 * 60_000);
  const key = config.encryptionKey;
  const features = { sandboxShortcut: config.plaid.sandboxShortcut };

  app.use('/v1/*', cors({ origin: config.corsOrigins, allowHeaders: ['authorization', 'content-type'], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], maxAge: 600 }));

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    if (err instanceof PlaidError) {
      console.warn('Plaid error', err.code, err.message);
      return c.json({ error: { code: 'provider_error', message: 'Your bank connection service had a problem. Try again in a moment.', providerCode: err.code } }, 502);
    }
    console.error(err);
    return c.json({ error: { code: 'internal', message: 'Something went wrong on our side.' } }, 500);
  });

  app.get('/health', async (c) => {
    await db.query('select 1');
    return c.json({ ok: true, plaidEnv: config.plaid.env, sandboxShortcut: config.plaid.sandboxShortcut });
  });

  // ---------- Auth ----------

  const body = async <T,>(c: Context) => {
    try {
      return (await c.req.json()) as T;
    } catch {
      throw new HttpError(400, 'invalid', 'Expected a JSON body.');
    }
  };
  const ip = (c: Context) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';

  async function startSession(userId: string) {
    const { token, hash } = newSessionToken();
    await db.query(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + ($3 || ' days')::interval)`, [hash, userId, String(config.sessionDays)]);
    return token;
  }

  app.post('/v1/auth/signup', async (c) => {
    if (!signupLimit(ip(c))) throw new HttpError(429, 'rate_limited', 'Too many sign-ups from here. Try again later.');
    const { email: rawEmail, password } = await body<{ email?: string; password?: string }>(c);
    const email = String(rawEmail ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'invalid', 'Enter a valid email address.');
    if (String(password ?? '').length < 10) throw new HttpError(400, 'invalid', 'Use at least 10 characters for your password.');
    if (await db.one('select 1 from users where email = $1', [email])) throw new HttpError(409, 'email_taken', 'There’s already an account with that email. Sign in instead.');
    const user = await db.tx(async (t) => {
      const u = await t.one<{ id: string }>('insert into users (email, password_hash) values ($1, $2) returning id', [email, await hashPassword(String(password))]);
      await t.query('insert into user_state (user_id) values ($1)', [u!.id]);
      return u!;
    });
    return c.json({ token: await startSession(user.id), state: await buildState(db, user.id, new Date(), features) }, 201);
  });

  app.post('/v1/auth/login', async (c) => {
    const { email: rawEmail, password } = await body<{ email?: string; password?: string }>(c);
    const email = String(rawEmail ?? '').trim().toLowerCase();
    if (!loginLimit(`${ip(c)}|${email}`)) throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait 15 minutes and try again.');
    const user = await db.one<{ id: string; password_hash: string }>('select id, password_hash from users where email = $1', [email]);
    if (!user || !(await verifyPassword(String(password ?? ''), user.password_hash))) throw new HttpError(401, 'bad_credentials', 'That email and password don’t match.');
    return c.json({ token: await startSession(user.id), state: await buildState(db, user.id, new Date(), features) });
  });

  // Everything below needs a signed-in person.
  app.use('/v1/*', async (c, next) => {
    if (c.req.path.startsWith('/v1/auth/') && c.req.path !== '/v1/auth/logout') return next();
    if (c.req.path === '/v1/plaid/webhook') return next();
    const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
    const session = token ? await db.one<{ user_id: string }>('select user_id from sessions where token_hash = $1 and expires_at > now()', [sha256(token)]) : undefined;
    if (!session) throw new HttpError(401, 'unauthenticated', 'Please sign in again.');
    c.set('userId', session.user_id);
    return next();
  });

  app.post('/v1/auth/logout', async (c) => {
    const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    await db.query('delete from sessions where token_hash = $1', [sha256(token)]);
    return c.json({ ok: true });
  });

  const state = (c: Context<Env>) => buildState(db, c.get('userId'), new Date(), features);
  const hasConsent = async (userId: string) => Boolean((await db.one<{ consent: unknown }>('select consent from user_state where user_id = $1', [userId]))?.consent);
  const requireConsent = async (userId: string) => {
    if (!(await hasConsent(userId))) throw new HttpError(403, 'consent_required', 'BACI needs your permission to analyse your data.');
  };
  const ownItem = async (userId: string, id: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'not_found', 'Connection not found');
    const item = await db.one<ItemRow>('select * from items where id = $1 and user_id = $2', [id, userId]);
    if (!item) throw new HttpError(404, 'not_found', 'Connection not found');
    return item;
  };

  app.get('/v1/state', async (c) => c.json(await state(c)));

  // ---------- Onboarding, consent, profile ----------

  app.patch('/v1/onboarding', async (c) => {
    const { step } = await body<{ step?: string }>(c);
    if (!step || !STEPS.includes(step)) throw new HttpError(400, 'invalid', 'Unknown onboarding step.');
    if (STEPS.indexOf(step) > STEPS.indexOf('consent')) await requireConsent(c.get('userId'));
    await db.query('update user_state set onboarding_step = $2, updated_at = now() where user_id = $1', [c.get('userId'), step]);
    return c.json(await state(c));
  });

  app.put('/v1/consent', async (c) => {
    const { permissions, version } = await body<{ permissions?: Record<string, unknown>; version?: string }>(c);
    if (!permissions || typeof permissions !== 'object' || !version) throw new HttpError(400, 'invalid', 'permissions and version are required.');
    const clean = Object.fromEntries(CATEGORIES.map((k) => [k, permissions[k] === true]));
    if (!Object.values(clean).some(Boolean)) throw new HttpError(400, 'invalid', 'Allow at least one category.');
    const userId = c.get('userId');
    await db.tx(async (t) => {
      const prev = await t.one<{ consent: { firstAgreedAt?: string } | null }>('select consent from user_state where user_id = $1 for update', [userId]);
      const at = new Date().toISOString();
      const consent = { version, permissions: clean, firstAgreedAt: prev?.consent?.firstAgreedAt ?? at, updatedAt: at };
      await t.query('update user_state set consent = $2, consent_revoked_at = null, updated_at = now() where user_id = $1', [userId, consent]);
      await t.query('insert into consent_events (user_id, action, version, permissions) values ($1, $2, $3, $4)', [userId, prev?.consent ? 'updated' : 'granted', version, clean]);
    });
    return c.json(await state(c));
  });

  app.delete('/v1/consent', async (c) => {
    const userId = c.get('userId');
    await db.query('update user_state set consent = null, consent_revoked_at = now(), updated_at = now() where user_id = $1', [userId]);
    await db.query(`insert into consent_events (user_id, action) values ($1, 'revoked')`, [userId]);
    return c.json(await state(c));
  });

  app.put('/v1/profile', async (c) => {
    const { profile } = await body<{ profile?: Record<string, unknown> }>(c);
    if (!profile || typeof profile !== 'object') throw new HttpError(400, 'invalid', 'profile is required.');
    const clean = Object.fromEntries(PROFILE_KEYS.map((k) => [k, profile[k] ?? null]));
    await db.query('update user_state set profile = $2, updated_at = now() where user_id = $1', [c.get('userId'), clean]);
    return c.json(await state(c));
  });

  app.post('/v1/insights/:id/dismiss', async (c) => {
    await db.query(
      `update user_state set dismissed_insights = (select coalesce(jsonb_agg(distinct x), '[]') from jsonb_array_elements(dismissed_insights || to_jsonb($2::text)) x) where user_id = $1`,
      [c.get('userId'), c.req.param('id')],
    );
    return c.json(await state(c));
  });

  // ---------- Bank connections (Plaid) ----------

  app.post('/v1/plaid/link-token', async (c) => {
    const userId = c.get('userId');
    await requireConsent(userId);
    const { platform, connectionId } = await body<{ platform?: Platform; connectionId?: string }>(c);
    const p: Platform = platform === 'ios' || platform === 'android' ? platform : 'web';
    const item = connectionId ? await ownItem(userId, connectionId) : null;
    const r = await plaid.linkTokenCreate({ userId, platform: p, accessToken: item ? decrypt(item.access_token_enc, key) : undefined });
    return c.json({ linkToken: r.link_token, expiration: r.expiration });
  });

  app.post('/v1/plaid/exchange', async (c) => {
    const userId = c.get('userId');
    await requireConsent(userId);
    let { publicToken, institution, sandbox } = await body<{ publicToken?: string; institution?: { id?: string | null; name?: string | null }; sandbox?: boolean }>(c);
    if (sandbox) {
      if (!config.plaid.sandboxShortcut) throw new HttpError(403, 'forbidden', 'The sandbox shortcut is off.');
      publicToken = (await plaid.sandboxPublicToken(config.plaid.sandboxInstitution)).public_token;
      institution = { id: config.plaid.sandboxInstitution, name: null };
    }
    if (!publicToken) throw new HttpError(400, 'invalid', 'publicToken is required.');
    const { access_token, item_id } = await plaid.exchange(publicToken);
    const institutionId = institution?.id ?? (await plaid.accounts(access_token)).item.institution_id ?? null;
    let inst = { name: institution?.name || 'Your bank', logo: null as string | null, colour: null as string | null };
    if (institutionId) {
      try {
        const r = (await plaid.institution(institutionId)).institution;
        inst = { name: r.name, logo: r.logo ? `data:image/png;base64,${r.logo}` : null, colour: r.primary_color ?? null };
      } catch (e) {
        if (!(e instanceof PlaidError)) throw e;
      }
    }
    const item = await db.one<ItemRow>(
      `insert into items (user_id, plaid_item_id, access_token_enc, institution_id, institution_name, institution_logo, institution_colour)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [userId, item_id, encrypt(access_token, key), institutionId, inst.name, inst.logo, inst.colour],
    );
    const accounts = await refreshAccounts(db, plaid, item!, key);
    const discovered = (await db.query<{ plaid_account_id: string; name: string; mask: string | null; kind: string }>('select plaid_account_id, name, mask, kind from accounts where item_id = $1', [item!.id])).map(
      (a) => ({ providerAccountId: a.plaid_account_id, name: a.name, mask: a.mask ?? '', kind: a.kind }),
    );
    return c.json({ connectionId: item!.id, discovered, accountCount: accounts.length, state: await state(c) }, 201);
  });

  app.post('/v1/connections/:id/accounts', async (c) => {
    const userId = c.get('userId');
    await requireConsent(userId);
    const item = await ownItem(userId, c.req.param('id'));
    const { accountIds } = await body<{ accountIds?: string[] }>(c);
    if (!Array.isArray(accountIds) || !accountIds.length) throw new HttpError(400, 'invalid', 'Select at least one account');
    await db.query('update accounts set selected = (plaid_account_id = any($2)) where item_id = $1', [item.id, accountIds]);
    return c.json(await state(c));
  });

  app.post('/v1/connections/:id/sync', async (c) => {
    const userId = c.get('userId');
    await requireConsent(userId);
    const item = await ownItem(userId, c.req.param('id'));
    const r = await syncItem(db, plaid, item, key);
    if (!r.ok && r.reauth) throw new HttpError(409, 'reauth_required', 'The bank needs you to confirm access again.');
    const partial = Boolean(await db.one('select 1 from accounts where item_id = $1 and selected and sync_failed', [item.id]));
    return c.json({ ok: r.ok, partial, state: await state(c) });
  });

  /** After update-mode Link succeeds: the bank accepted the re-authentication. */
  app.post('/v1/connections/:id/reauthorised', async (c) => {
    const item = await ownItem(c.get('userId'), c.req.param('id'));
    await db.query(`update items set status = 'active', error_code = null where id = $1`, [item.id]);
    await syncItem(db, plaid, { ...item, status: 'active' }, key);
    return c.json(await state(c));
  });

  app.patch('/v1/accounts/:id', async (c) => {
    const { selected } = await body<{ selected?: boolean }>(c);
    if (typeof selected !== 'boolean') throw new HttpError(400, 'invalid', 'selected must be true or false.');
    const r = await db.query('update accounts set selected = $3 where id::text = $1 and user_id = $2 returning id', [c.req.param('id'), c.get('userId'), selected]);
    if (!r.length) throw new HttpError(404, 'not_found', 'Account not found');
    return c.json(await state(c));
  });

  /** Disconnect: revoke at Plaid (so the bank stops sharing), then delete the token, accounts and transactions. */
  app.delete('/v1/connections/:id', async (c) => {
    const item = await ownItem(c.get('userId'), c.req.param('id'));
    await removeAtPlaid(item);
    await db.query('delete from items where id = $1', [item.id]);
    return c.json(await state(c));
  });

  async function removeAtPlaid(item: ItemRow) {
    try {
      await plaid.itemRemove(decrypt(item.access_token_enc, key));
    } catch (e) {
      // Already removed at Plaid, or Plaid unreachable: still delete our copy.
      console.warn('item/remove failed', e instanceof PlaidError ? e.code : e);
    }
  }

  /** Delete the account and every piece of data held about the person (UK GDPR right to erasure). */
  app.delete('/v1/me', async (c) => {
    const userId = c.get('userId');
    for (const item of await db.query<ItemRow>('select * from items where user_id = $1', [userId])) await removeAtPlaid(item);
    await db.query('delete from users where id = $1', [userId]);
    return c.json({ ok: true });
  });

  /** Plaid tells us when new transactions are ready or a connection needs attention. */
  app.post('/v1/plaid/webhook', async (c) => {
    const raw = await c.req.text();
    if (!(await plaid.verifyWebhook(c.req.header('plaid-verification'), raw))) throw new HttpError(401, 'invalid_signature', 'Webhook signature check failed.');
    const hook = JSON.parse(raw) as { webhook_type?: string; webhook_code?: string; item_id?: string; error?: { error_code?: string } | null };
    const item = hook.item_id ? await db.one<ItemRow>('select * from items where plaid_item_id = $1', [hook.item_id]) : undefined;
    if (!item) return c.json({ ok: true, ignored: true });
    const kind = `${hook.webhook_type}.${hook.webhook_code}`;
    if (kind === 'TRANSACTIONS.SYNC_UPDATES_AVAILABLE' || kind === 'ITEM.LOGIN_REPAIRED') {
      if (await hasConsent(item.user_id)) await syncItem(db, plaid, item, key);
    } else if (kind === 'ITEM.PENDING_EXPIRATION' || kind === 'ITEM.PENDING_DISCONNECT' || kind === 'ITEM.USER_PERMISSION_REVOKED' || (kind === 'ITEM.ERROR' && hook.error?.error_code === 'ITEM_LOGIN_REQUIRED')) {
      await db.query(`update items set status = 'reauth_required', error_code = $2 where id = $1`, [item.id, hook.error?.error_code ?? hook.webhook_code]);
    } else if (kind === 'ITEM.ERROR') {
      await db.query(`update items set status = 'error', error_code = $2 where id = $1`, [item.id, hook.error?.error_code ?? 'ERROR']);
    }
    return c.json({ ok: true });
  });

  // ---------- Voice agent ----------

  /** Short-lived ElevenLabs conversation token, for a private agent (keeps the API key off devices). */
  app.post('/v1/agent/token', async (c) => {
    const { apiKey, agentId } = config.elevenlabs;
    if (!apiKey || !agentId) throw new HttpError(404, 'not_configured', 'The voice agent token service isn’t set up.');
    const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`, { headers: { 'xi-api-key': apiKey } });
    if (!res.ok) throw new HttpError(502, 'provider_error', 'The voice service didn’t respond.');
    return c.json({ token: ((await res.json()) as { token: string }).token });
  });

  return app;
}
