import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';
import type { Config } from './config.ts';
import { sha256 } from './security.ts';

// Thin client for the Plaid endpoints BACI uses (https://plaid.com/docs/api/).

export class PlaidError extends Error {
  constructor(
    public status: number,
    public code: string,
    public type: string,
    message: string,
  ) {
    super(message);
  }
}

export type PlaidAccount = {
  account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  balances: { available: number | null; current: number | null; iso_currency_code: string | null };
};

export type PlaidTransaction = {
  transaction_id: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  merchant_name?: string | null;
  pending: boolean;
  payment_channel?: string | null;
  personal_finance_category?: { primary: string; detailed?: string } | null;
};

export type Platform = 'web' | 'ios' | 'android';

export function createPlaid(cfg: Config['plaid']) {
  async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: cfg.clientId, secret: cfg.secret, ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, string>;
    if (!res.ok) throw new PlaidError(res.status, json.error_code ?? 'UNKNOWN', json.error_type ?? 'API_ERROR', json.error_message ?? `Plaid ${path} failed (${res.status})`);
    return json as T;
  }

  const keyCache = new Map<string, JsonWebKey>();

  return {
    /** Link token for a new connection, or update mode (re-authenticate) when accessToken is given. */
    linkTokenCreate(o: { userId: string; platform: Platform; accessToken?: string }) {
      const oauth =
        o.platform === 'android' && cfg.androidPackage
          ? { android_package_name: cfg.androidPackage }
          : o.platform === 'ios' && cfg.redirectUriIos
            ? { redirect_uri: cfg.redirectUriIos }
            : o.platform === 'web' && cfg.redirectUriWeb
              ? { redirect_uri: cfg.redirectUriWeb }
              : {};
      return call<{ link_token: string; expiration: string }>('/link/token/create', {
        client_name: 'BACI',
        language: 'en',
        country_codes: cfg.countryCodes,
        user: { client_user_id: o.userId },
        ...(o.accessToken ? { access_token: o.accessToken } : { products: ['transactions'], transactions: { days_requested: 365 } }),
        ...(cfg.webhookUrl ? { webhook: cfg.webhookUrl } : {}),
        ...oauth,
      });
    },
    exchange: (publicToken: string) => call<{ access_token: string; item_id: string }>('/item/public_token/exchange', { public_token: publicToken }),
    accounts: (accessToken: string) =>
      call<{ accounts: PlaidAccount[]; item: { item_id: string; institution_id?: string | null } }>('/accounts/get', { access_token: accessToken }),
    institution: (institutionId: string) =>
      call<{ institution: { institution_id: string; name: string; logo?: string | null; primary_color?: string | null } }>('/institutions/get_by_id', {
        institution_id: institutionId,
        country_codes: cfg.countryCodes,
        options: { include_optional_metadata: true },
      }),
    transactionsSync: (accessToken: string, cursor: string | null) =>
      call<{
        added: PlaidTransaction[];
        modified: PlaidTransaction[];
        removed: { transaction_id: string }[];
        next_cursor: string;
        has_more: boolean;
        transactions_update_status?: string;
      }>('/transactions/sync', { access_token: accessToken, count: 500, ...(cursor ? { cursor } : {}) }),
    /** Sandbox only: a public token for a test bank, as if Link had succeeded. */
    sandboxPublicToken: (institutionId: string) =>
      call<{ public_token: string }>('/sandbox/public_token/create', { institution_id: institutionId, initial_products: ['transactions'] }),
    itemRemove: (accessToken: string) => call<object>('/item/remove', { access_token: accessToken }),

    /**
     * Verifies the Plaid-Verification JWT on a webhook (ES256, signed by Plaid, includes the
     * SHA-256 of the body, and is at most 5 minutes old). https://plaid.com/docs/api/webhooks/webhook-verification/
     */
    async verifyWebhook(jwt: string | undefined, rawBody: string) {
      if (!cfg.verifyWebhooks) return true;
      if (!jwt) return false;
      const [h, p, s] = jwt.split('.');
      if (!h || !p || !s) return false;
      const header = JSON.parse(Buffer.from(h, 'base64url').toString()) as { alg?: string; kid?: string };
      if (header.alg !== 'ES256' || !header.kid) return false;
      let jwk = keyCache.get(header.kid);
      if (!jwk) {
        jwk = (await call<{ key: JsonWebKey }>('/webhook_verification_key/get', { key_id: header.kid })).key;
        keyCache.set(header.kid, jwk);
      }
      const ok = verify('sha256', Buffer.from(`${h}.${p}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
      if (!ok) return false;
      const claims = JSON.parse(Buffer.from(p, 'base64url').toString()) as { iat?: number; request_body_sha256?: string };
      if (!claims.iat || Date.now() / 1000 - claims.iat > 5 * 60) return false;
      return claims.request_body_sha256 === sha256(rawBody);
    },
  };
}

export type Plaid = ReturnType<typeof createPlaid>;

/** Plaid account type/subtype → BACI's account kinds. */
export function kindOf(type: string, subtype: string | null): 'current' | 'savings' | 'credit' | 'loan' | 'investment' {
  const s = (subtype ?? '').toLowerCase();
  if (type === 'credit') return 'credit';
  if (type === 'loan') return 'loan';
  if (type === 'investment' || type === 'brokerage') return 'investment';
  if (/savings|isa|money market|cd|cash management/.test(s)) return 'savings';
  return 'current';
}
