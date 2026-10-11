import type { Db } from './db.ts';
import { findRecurring, forecast, insights, upcomingCommitments, type Tx } from './finance.ts';
import type { ItemRow } from './sync.ts';

// Everything the app needs, in one response. The app recomputes totals and affordability from
// this with the same code as the demo, so live and demo data behave identically.

type AccountRow = {
  id: string;
  item_id: string;
  plaid_account_id: string;
  name: string;
  mask: string | null;
  kind: string;
  balance: number | null;
  selected: boolean;
  sync_failed: boolean;
};

const STALE_HOURS = 24;

export async function buildState(db: Db, userId: string, now = new Date(), features: { sandboxShortcut?: boolean } = {}) {
  const today = now.toISOString().slice(0, 10);
  const [user, st, items, accounts] = await Promise.all([
    db.one<{ id: string; email: string }>('select id, email from users where id = $1', [userId]),
    db.one<{ onboarding_step: string; consent: unknown; consent_revoked_at: string | null; profile: Record<string, unknown>; dismissed_insights: string[] }>(
      'select onboarding_step, consent, consent_revoked_at, profile, dismissed_insights from user_state where user_id = $1',
      [userId],
    ),
    db.query<ItemRow>('select * from items where user_id = $1 order by created_at', [userId]),
    db.query<AccountRow>('select * from accounts where user_id = $1 order by name', [userId]),
  ]);
  if (!user || !st) throw new Error('User not found');

  // Analysis only runs with consent (spec S4: revoking stops analysis; connections stay).
  const consented = Boolean(st.consent);
  const selected = accounts.filter((a) => a.selected);
  const txs: (Tx & { item: string })[] = consented
    ? (
        await db.query<{ account_id: string; amount: number; date: string; name: string; merchant_name: string | null; category: string | null; pending: boolean }>(
          `select t.account_id, t.amount, t.date, t.name, t.merchant_name, t.category, t.pending
           from transactions t join accounts a on a.id = t.account_id
           where t.user_id = $1 and a.selected and t.date >= current_date - 400`,
          [userId],
        )
      ).map((t) => ({
        accountId: t.account_id,
        amount: t.amount,
        date: t.date,
        name: t.name,
        merchant: t.merchant_name,
        category: t.category,
        pending: t.pending,
        item: accounts.find((a) => a.id === t.account_id)?.item_id ?? '',
      }))
    : [];

  const recurring = findRecurring(txs, today);
  const accountName = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    const item = items.find((i) => i.id === a?.item_id);
    if (!a) return 'an account';
    const bank = item?.institution_name ?? '';
    // "Monzo Current Account" already names the bank; don't make it "Monzo Monzo Current Account".
    return a.name.toLowerCase().startsWith(bank.toLowerCase()) ? a.name : `${bank} ${a.name}`.trim();
  };

  const connections = items.map((i) => {
    const mine = txs.filter((t) => t.item === i.id);
    const earliest = mine.reduce((m, t) => (t.date < m ? t.date : m), today);
    const stale = i.status === 'active' && i.last_sync_at && now.getTime() - new Date(i.last_sync_at).getTime() > STALE_HOURS * 3600_000;
    const itemAccounts = new Set(accounts.filter((a) => a.item_id === i.id).map((a) => a.id));
    return {
      id: i.id,
      institutionId: i.institution_id ?? i.id,
      institution: { id: i.institution_id ?? i.id, name: i.institution_name, logo: i.institution_logo, colour: i.institution_colour },
      status: stale ? 'stale' : i.status,
      errorCode: i.error_code,
      importing: i.tx_status === 'NOT_READY',
      lastSuccessfulSync: i.last_sync_at,
      createdAt: new Date(i.created_at).getTime(),
      stats: {
        transactions: mine.length,
        regularPayments: recurring.filter((r) => itemAccounts.has(r.accountId)).length,
        historyDays: Math.round((Date.parse(today) - Date.parse(earliest)) / 86_400_000),
      },
    };
  });

  return {
    user: { id: user.id, email: user.email },
    onboarding: { step: st.onboarding_step },
    consent: st.consent,
    consentRevokedAt: st.consent_revoked_at,
    profile: st.profile,
    dismissedInsights: st.dismissed_insights,
    connections,
    accounts: accounts.map((a) => ({
      id: a.id,
      connectionId: a.item_id,
      providerAccountId: a.plaid_account_id,
      name: a.name,
      mask: a.mask ?? '',
      kind: a.kind,
      balance: a.balance,
      selected: a.selected,
      syncFailed: a.sync_failed,
    })),
    finance: consented
      ? {
          commitments: upcomingCommitments(recurring, today),
          forecast: forecast(txs, recurring, today),
          insights: insights(recurring, accountName, today),
        }
      : null,
    selectedAccounts: selected.length,
    features: { sandboxShortcut: Boolean(features.sandboxShortcut) },
  };
}

export type RemoteState = Awaited<ReturnType<typeof buildState>>;
