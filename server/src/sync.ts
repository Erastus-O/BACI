import type { Db } from './db.ts';
import { kindOf, PlaidError, type Plaid, type PlaidTransaction } from './plaid.ts';
import { decrypt } from './security.ts';

export type ItemRow = {
  id: string;
  user_id: string;
  plaid_item_id: string;
  access_token_enc: string;
  institution_id: string | null;
  institution_name: string;
  institution_logo: string | null;
  institution_colour: string | null;
  status: string;
  error_code: string | null;
  tx_status: string | null;
  cursor: string | null;
  last_sync_at: string | null;
  created_at: string;
};

// The bank needs the person to sign in again (Open Banking access expires every 90 days in the UK).
const REAUTH = new Set(['ITEM_LOGIN_REQUIRED', 'PENDING_EXPIRATION', 'PENDING_DISCONNECT', 'INVALID_CREDENTIALS', 'INSUFFICIENT_CREDENTIALS', 'USER_PERMISSION_REVOKED', 'ACCESS_NOT_GRANTED']);

/** Balances for every account at the bank; new accounts arrive unselected. */
export async function refreshAccounts(db: Db, plaid: Plaid, item: ItemRow, key: Buffer) {
  const { accounts } = await plaid.accounts(decrypt(item.access_token_enc, key));
  for (const a of accounts) {
    const kind = kindOf(a.type, a.subtype);
    // Money held for current/savings; amount owed for credit and loans.
    const balance = kind === 'current' || kind === 'savings' ? (a.balances.available ?? a.balances.current) : a.balances.current;
    await db.query(
      `insert into accounts (item_id, user_id, plaid_account_id, name, mask, type, subtype, kind, balance, currency)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (plaid_account_id) do update set name = excluded.name, mask = excluded.mask, kind = excluded.kind,
         balance = excluded.balance, currency = excluded.currency`,
      [item.id, item.user_id, a.account_id, a.name || a.official_name || 'Account', a.mask, a.type, a.subtype, kind, balance, a.balances.iso_currency_code],
    );
  }
  return accounts;
}

async function syncTransactions(db: Db, plaid: Plaid, item: ItemRow, key: Buffer) {
  const accountIds = new Map(
    (await db.query<{ id: string; plaid_account_id: string }>('select id, plaid_account_id from accounts where item_id = $1', [item.id])).map((r) => [r.plaid_account_id, r.id]),
  );
  const upsert = async (t: PlaidTransaction) => {
    const accountId = accountIds.get(t.account_id);
    if (!accountId) return;
    await db.query(
      `insert into transactions (plaid_transaction_id, user_id, account_id, amount, date, name, merchant_name, category, pending)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (plaid_transaction_id) do update set amount = excluded.amount, date = excluded.date, name = excluded.name,
         merchant_name = excluded.merchant_name, category = excluded.category, pending = excluded.pending`,
      [t.transaction_id, item.user_id, accountId, t.amount, t.date, t.name, t.merchant_name ?? null, t.personal_finance_category?.primary ?? null, t.pending],
    );
  };

  let cursor = item.cursor;
  let status: string | undefined;
  const token = decrypt(item.access_token_enc, key);
  for (let page = 0; page < 50; page++) {
    const r = await plaid.transactionsSync(token, cursor);
    for (const t of [...r.added, ...r.modified]) await upsert(t);
    if (r.removed.length) await db.query('delete from transactions where plaid_transaction_id = any($1)', [r.removed.map((x) => x.transaction_id)]);
    cursor = r.next_cursor;
    status = r.transactions_update_status ?? status;
    if (!r.has_more) break;
  }
  await db.query('update items set cursor = $2, tx_status = $3 where id = $1', [item.id, cursor, status ?? null]);
}

/** POST /connections/:id/sync and the webhook: balances + transactions. Never throws for bank errors. */
export async function syncItem(db: Db, plaid: Plaid, item: ItemRow, key: Buffer) {
  try {
    await refreshAccounts(db, plaid, item, key);
    await syncTransactions(db, plaid, item, key);
    await db.query(`update items set status = 'active', error_code = null, last_sync_at = now() where id = $1`, [item.id]);
    await db.query('update accounts set sync_failed = false where item_id = $1', [item.id]);
    return { ok: true as const };
  } catch (e) {
    if (!(e instanceof PlaidError)) throw e;
    if (e.code === 'PRODUCT_NOT_READY') {
      // Transactions are still being fetched from the bank; a webhook will say when they're ready.
      await db.query(`update items set status = 'active', error_code = null, last_sync_at = now(), tx_status = 'NOT_READY' where id = $1`, [item.id]);
      return { ok: true as const };
    }
    if (REAUTH.has(e.code)) {
      await db.query(`update items set status = 'reauth_required', error_code = $2 where id = $1`, [item.id, e.code]);
      return { ok: false as const, reauth: true, code: e.code };
    }
    await db.query(`update items set status = 'error', error_code = $2 where id = $1`, [item.id, e.code]);
    await db.query('update accounts set sync_failed = true where item_id = $1 and selected', [item.id]);
    return { ok: false as const, reauth: false, code: e.code };
  }
}
