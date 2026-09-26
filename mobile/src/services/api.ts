/**
 * In-app stand-in for the BACI server described in docs/design/BACI_FLOW_SPEC.md.
 *
 * Each function is named after the endpoint it mirrors (see the comment above it) and is
 * async with a little latency, so screens exercise real loading / error states. Swap the
 * bodies for `fetch` calls when the backend exists; the screens don't need to change.
 *
 * Rules enforced here, as the spec requires on the server:
 * - nothing after 02 without consent (403 consent_required)
 * - every financial read and every agent tool checks consent
 * - connecting a bank needs active consent
 * - a failed NEW connection is deleted; a failed re-authorisation stays reauth_required
 */
import {
  AccountKind,
  commitments as sandboxCommitments,
  CONSENT_VERSION,
  ConsentCategory,
  consentCategories,
  forecast,
  Institution,
  institutions,
  sandboxAccounts,
} from '../data/mock';

// ---------- Types ----------

export type OnboardingStep = 'welcome' | 'consent' | 'profile' | 'connect' | 'accounts' | 'first_insight' | 'done';

export type Consent = {
  version: string;
  permissions: Record<ConsentCategory, boolean>;
  firstAgreedAt: string;
  updatedAt: string;
};

export type DeclaredValue<T> = { value: T; source: 'user_declared'; recordedAt: string };

export type Profile = {
  income: DeclaredValue<number> | null;
  status: DeclaredValue<'Employed' | 'Self-employed' | 'Student' | 'Other'> | null;
  goal: DeclaredValue<'Build savings' | 'Pay off debt' | 'Save for a home' | 'Spend smarter'> | null;
  risk: DeclaredValue<'Cautious' | 'Balanced' | 'Adventurous'> | null;
  frequency: DeclaredValue<'Daily' | 'Weekly' | 'Monthly'> | null;
  buffer: DeclaredValue<number> | null;
};

export type ConnectionStatus = 'awaiting_authorisation' | 'active' | 'stale' | 'reauth_required' | 'error';

export type Connection = {
  id: string;
  institutionId: string;
  status: ConnectionStatus;
  lastSuccessfulSync: string | null;
  createdAt: number;
};

export type Account = {
  id: string;
  connectionId: string;
  providerAccountId: string;
  name: string;
  mask: string;
  kind: AccountKind;
  balance: number | null;
  selected: boolean;
  syncFailed: boolean;
};

export type DiscoveredAccount = {
  providerAccountId: string;
  name: string;
  mask: string;
  kind: AccountKind;
  /** Set when the same account is already connected through another bank. */
  duplicateOf?: string;
};

export type Insight = {
  id: string;
  title: string;
  summary: string;
  impact: { amount: number; period: string };
  basedOn: string[];
  dataPeriod: string;
  confidence: 'High' | 'Medium' | 'Low';
  freshness: string;
  evidence: string;
  action: string;
};

export type SandboxOutcome = 'one_account_fails' | 'timed_out' | 'bank_unavailable';

export type FailureReason = 'cancelled' | 'timed_out' | 'bank_unavailable';

export class ApiError extends Error {
  constructor(
    public code: 'consent_required' | 'onboarding_order' | 'not_found' | 'authorisation_failed' | 'reauth_required' | 'provider_error' | 'invalid' | 'data_unavailable',
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

// ---------- State ----------

type State = {
  onboarding: { step: OnboardingStep };
  consent: Consent | null;
  consentRevokedAt: string | null;
  profile: Profile;
  connections: Connection[];
  accounts: Account[];
  discovered: Record<string, DiscoveredAccount[]>;
  pendingSandbox: Record<string, SandboxOutcome | undefined>;
  reauthInProgress: Record<string, boolean>;
  dismissedInsights: string[];
  /** Dev: make agent tools fail, to preview A2 "won't guess". */
  simulateDataOutage: boolean;
};

const now = () => new Date().toISOString();
let seq = 0;
const newId = (p: string) => `${p}_${Date.now().toString(36)}${(++seq).toString(36)}`;

const initialState = (): State => ({
  onboarding: { step: 'welcome' },
  consent: null,
  consentRevokedAt: null,
  profile: { income: null, status: null, goal: null, risk: null, frequency: null, buffer: null },
  connections: [],
  accounts: [],
  discovered: {},
  pendingSandbox: {},
  reauthInProgress: {},
  dismissedInsights: [],
  simulateDataOutage: false,
});

let state: State = initialState();
let version = 0;
const listeners = new Set<() => void>();

function commit(next: Partial<State>) {
  state = { ...state, ...next };
  version++;
  listeners.forEach((l) => l());
}

export const serverEvents = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getVersion: () => version,
};

const latency = (ms = 220) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// ---------- Guards ----------

function requireConsent(category?: ConsentCategory) {
  if (!state.consent) throw new ApiError('consent_required', 'BACI needs your permission to analyse your data.');
  if (category && !state.consent.permissions[category]) throw new ApiError('consent_required', `Not shared: ${category}`, { category });
}

const allowed = (c: ConsentCategory) => Boolean(state.consent?.permissions[c]);

const institution = (id: string): Institution => {
  const i = institutions.find((x) => x.id === id);
  if (!i) throw new ApiError('not_found', 'Unknown institution');
  return i;
};

function getConn(id: string) {
  const c = state.connections.find((x) => x.id === id);
  if (!c) throw new ApiError('not_found', 'Connection not found');
  return c;
}

const setConn = (id: string, patch: Partial<Connection>) =>
  commit({ connections: state.connections.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

/** Accounts BACI may use: selected, from a usable connection, allowed by consent. */
function usableAccounts() {
  const categoryFor: Record<AccountKind, ConsentCategory | null> = { current: null, savings: 'savings', credit: 'credit', loan: 'loans', investment: 'investments' };
  return state.accounts.filter((a) => {
    const conn = state.connections.find((c) => c.id === a.connectionId);
    if (!a.selected || !conn || conn.status === 'awaiting_authorisation') return false;
    const cat = categoryFor[a.kind];
    return cat ? allowed(cat) : true;
  });
}

/** Excluded from answers: reauth needed or sync failed. Named, never estimated. */
function isExcluded(a: Account) {
  const conn = state.connections.find((c) => c.id === a.connectionId);
  return a.syncFailed || conn?.status === 'reauth_required';
}

// ---------- Onboarding (PATCH /onboarding) ----------

const order: OnboardingStep[] = ['welcome', 'consent', 'profile', 'connect', 'accounts', 'first_insight', 'done'];

export async function getOnboarding() {
  return clone(state.onboarding);
}

export async function patchOnboarding(step: OnboardingStep) {
  await latency(160);
  if (order.indexOf(step) > order.indexOf('consent') && !state.consent) {
    throw new ApiError('consent_required', 'Agree to data consent first.');
  }
  commit({ onboarding: { step } });
  return clone(state.onboarding);
}

/** Sync read used by route guards. */
export const peek = {
  step: () => state.onboarding.step,
  hasConsent: () => Boolean(state.consent),
  simulateDataOutage: () => state.simulateDataOutage,
};

// ---------- Consent (PUT/DELETE /consent) ----------

export async function getConsent() {
  return { consent: clone(state.consent), revokedAt: state.consentRevokedAt };
}

export async function putConsent(permissions: Record<ConsentCategory, boolean>) {
  await latency();
  if (!Object.values(permissions).some(Boolean)) throw new ApiError('invalid', 'Allow at least one category.');
  const t = now();
  commit({
    consent: { version: CONSENT_VERSION, permissions: { ...permissions }, firstAgreedAt: state.consent?.firstAgreedAt ?? t, updatedAt: t },
    consentRevokedAt: null,
  });
  return clone(state.consent!);
}

export async function deleteConsent() {
  await latency();
  commit({ consent: null, consentRevokedAt: now() });
}

export const defaultPermissions = () =>
  Object.fromEntries(consentCategories.map((c) => [c.id, c.defaultOn])) as Record<ConsentCategory, boolean>;

// ---------- Profile (PUT /profile) ----------

type ProfileInput = { [K in keyof Profile]?: NonNullable<Profile[K]>['value'] | null };

export async function getProfile() {
  return clone(state.profile);
}

export async function putProfile(input: ProfileInput) {
  await latency();
  const t = now();
  const next = { ...state.profile } as Record<string, unknown>;
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    next[k] = v === null ? null : { value: v, source: 'user_declared', recordedAt: t };
  }
  commit({ profile: next as Profile });
  return clone(state.profile);
}

// ---------- Institutions & connections ----------

export async function getInstitutions() {
  await latency(180);
  return clone(institutions);
}

export type ConnectionView = Connection & {
  institution: Institution;
  accounts: Account[];
};

export async function getConnections(): Promise<ConnectionView[]> {
  await latency(120);
  return state.connections
    .map((c) => ({ ...clone(c), institution: institution(c.institutionId), accounts: clone(state.accounts.filter((a) => a.connectionId === c.id)) }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** POST /connections {institutionId} → authorisationUrl */
export async function postConnection(institutionId: string) {
  await latency();
  requireConsent();
  institution(institutionId);
  const conn: Connection = { id: newId('conn'), institutionId, status: 'awaiting_authorisation', lastSuccessfulSync: null, createdAt: Date.now() };
  commit({ connections: [...state.connections, conn] });
  return { connection: clone(conn), authorisationUrl: `/connect/authorise/${conn.id}` };
}

/** POST /connections/:id/reauthorise */
export async function reauthorise(id: string) {
  await latency();
  requireConsent();
  getConn(id);
  commit({ reauthInProgress: { ...state.reauthInProgress, [id]: true } });
  return { authorisationUrl: `/connect/authorise/${id}` };
}

export async function getConnection(id: string): Promise<ConnectionView> {
  const c = getConn(id);
  return { ...clone(c), institution: institution(c.institutionId), accounts: clone(state.accounts.filter((a) => a.connectionId === id)) };
}

/** POST /connections/:id/authorise {approved, sandbox?} */
export async function authorise(id: string, approved: boolean, sandbox?: SandboxOutcome) {
  await latency(500);
  requireConsent();
  const conn = getConn(id);
  const reauth = Boolean(state.reauthInProgress[id]);
  const bank = institution(conn.institutionId);

  const reason: FailureReason | null = !approved ? 'cancelled' : sandbox === 'timed_out' ? 'timed_out' : sandbox === 'bank_unavailable' ? 'bank_unavailable' : null;
  if (reason) {
    const { [id]: _, ...rest } = state.reauthInProgress;
    if (reauth) {
      commit({ reauthInProgress: rest });
    } else {
      // A new connection that fails is deleted: nothing shared, no dead entry.
      commit({ connections: state.connections.filter((c) => c.id !== id), reauthInProgress: rest });
    }
    throw new ApiError('authorisation_failed', 'Authorisation did not complete', { reason, institutionId: bank.id, institutionName: bank.name, reauth, connectionId: id });
  }

  const existingProviderIds = new Map(
    state.accounts.filter((a) => a.connectionId !== id).map((a) => [a.providerAccountId, institution(getConn(a.connectionId).institutionId).name]),
  );
  const discovered: DiscoveredAccount[] = (sandboxAccounts[bank.id] ?? []).map((a) => ({
    providerAccountId: a.providerAccountId,
    name: a.name,
    mask: a.mask,
    kind: a.kind,
    duplicateOf: existingProviderIds.get(a.providerAccountId),
  }));

  commit({
    discovered: { ...state.discovered, [id]: discovered },
    pendingSandbox: { ...state.pendingSandbox, [id]: sandbox },
  });
  return { discovered: clone(discovered), reauth };
}

export async function getDiscovered(id: string) {
  return state.discovered[id] ? clone(state.discovered[id]) : null;
}

/** POST /connections/:id/accounts {accountIds} (provider account ids) */
export async function selectAccounts(id: string, providerAccountIds: string[]) {
  await latency();
  requireConsent();
  const conn = getConn(id);
  if (!providerAccountIds.length) throw new ApiError('invalid', 'Select at least one account');
  const source = sandboxAccounts[conn.institutionId] ?? [];
  const keep = state.accounts.filter((a) => a.connectionId !== id);
  const added: Account[] = source
    .filter((a) => providerAccountIds.includes(a.providerAccountId))
    .map((a) => ({ id: newId('acc'), connectionId: id, providerAccountId: a.providerAccountId, name: a.name, mask: a.mask, kind: a.kind, balance: a.balance, selected: true, syncFailed: false }));
  commit({ accounts: [...keep, ...added] });
  return clone(added);
}

/** POST /connections/:id/sync */
export async function sync(id: string) {
  await latency(300);
  requireConsent();
  const conn = getConn(id);
  if (conn.status === 'reauth_required' && !state.reauthInProgress[id]) {
    throw new ApiError('reauth_required', 'The bank needs you to confirm access again.', { connectionId: id });
  }
  const failOne = state.pendingSandbox[id] === 'one_account_fails';
  const mine = state.accounts.filter((a) => a.connectionId === id && a.selected);
  const failId = failOne && mine.length > 1 ? mine[mine.length - 1].id : null;
  const { [id]: _r, ...reauthRest } = state.reauthInProgress;
  const { [id]: _s, ...sandboxRest } = state.pendingSandbox;
  commit({
    accounts: state.accounts.map((a) => (a.connectionId === id ? { ...a, syncFailed: a.id === failId } : a)),
    reauthInProgress: reauthRest,
    pendingSandbox: sandboxRest,
  });
  setConn(id, { status: failId ? 'error' : 'active', lastSuccessfulSync: failId && conn.lastSuccessfulSync ? conn.lastSuccessfulSync : 'just now' });
  return { ok: true, partial: Boolean(failId) };
}

/** GET /connections/:id/summary */
export async function getSummary(id: string) {
  await latency(150);
  requireConsent();
  const conn = getConn(id);
  const accounts = clone(state.accounts.filter((a) => a.connectionId === id && a.selected));
  const kinds = new Set(state.accounts.filter((a) => a.selected).map((a) => a.kind));
  const suggestions: string[] = [];
  if (!kinds.has('savings')) suggestions.push('a savings account');
  if (!kinds.has('credit')) suggestions.push('a credit card');
  // A loan the bank returned that the user didn't tick.
  const unticked = (state.discovered[id] ?? []).filter((d) => !state.accounts.some((a) => a.providerAccountId === d.providerAccountId));
  if (!kinds.has('loan') && unticked.some((d) => d.kind === 'loan')) suggestions.push('a loan');
  return {
    connection: { ...clone(conn), institution: institution(conn.institutionId) },
    accounts,
    transactionCount: 92 * accounts.length,
    regularPayments: 2 + accounts.length,
    historyDays: 180,
    suggestions,
    partial: accounts.some((a) => a.syncFailed),
  };
}

/** PATCH /accounts/:id {selected} */
export async function patchAccount(accountId: string, selected: boolean) {
  await latency(120);
  commit({ accounts: state.accounts.map((a) => (a.id === accountId ? { ...a, selected } : a)) });
}

/** DELETE /connections/:id — token removed, transactions purged, insights recalculated. */
export async function deleteConnection(id: string) {
  await latency();
  commit({ connections: state.connections.filter((c) => c.id !== id), accounts: state.accounts.filter((a) => a.connectionId !== id) });
}

/** Dev only: simulate provider states on 09 Accounts. */
export async function simulate(id: string, what: 'stale' | 'reauth' | 'error' | 'restore') {
  await latency(80);
  const conn = getConn(id);
  const status: ConnectionStatus = what === 'stale' ? 'stale' : what === 'reauth' ? 'reauth_required' : what === 'error' ? 'error' : 'active';
  commit({ accounts: state.accounts.map((a) => (a.connectionId === id ? { ...a, syncFailed: what === 'error' } : a)) });
  setConn(id, {
    status,
    lastSuccessfulSync: what === 'restore' ? 'just now' : what === 'stale' ? '3 days ago' : what === 'reauth' ? '23 Sep, 09:14' : conn.lastSuccessfulSync,
  });
}

export async function setSimulateDataOutage(on: boolean) {
  commit({ simulateDataOutage: on });
}

// ---------- Financial reads ----------

export type Snapshot = {
  asOf: string;
  availableCurrent: number;
  savings: number | null;
  creditOwed: number | null;
  loansOwed: number | null;
  billsNext30: number | null;
  monthlyIncome: number | null;
  accountsUsed: number;
  accountsUpToDate: number;
  stale: { name: string; lastSync: string }[];
  excluded: { name: string; reason: string }[];
  hasCurrentAccount: boolean;
  /** Account types BACI can see at all (so £0 isn't shown for something never connected). */
  connectedKinds: AccountKind[];
};

/** GET /snapshot */
export async function getSnapshot(): Promise<Snapshot> {
  await latency(160);
  requireConsent();
  return computeSnapshot();
}

function computeSnapshot(): Snapshot {
  const usable = usableAccounts();
  const counted = usable.filter((a) => !isExcluded(a));
  const sum = (k: AccountKind) => round(counted.filter((a) => a.kind === k).reduce((s, a) => s + (a.balance ?? 0), 0));
  const staleConns = state.connections.filter((c) => c.status === 'stale');
  return {
    asOf: forecast.asOf,
    availableCurrent: sum('current'),
    savings: allowed('savings') ? sum('savings') : null,
    creditOwed: allowed('credit') ? sum('credit') : null,
    loansOwed: allowed('loans') ? sum('loan') : null,
    billsNext30: allowed('bills') ? round(sandboxCommitments.reduce((s, b) => s + b.amount, 0)) : null,
    monthlyIncome: allowed('income') && counted.some((a) => a.kind === 'current') ? forecast.monthlyIncomeDetected : null,
    accountsUsed: usable.length,
    accountsUpToDate: usable.filter((a) => !isExcluded(a) && state.connections.find((c) => c.id === a.connectionId)?.status === 'active').length,
    stale: staleConns.map((c) => ({ name: institution(c.institutionId).name, lastSync: c.lastSuccessfulSync ?? 'never' })),
    excluded: usable
      .filter(isExcluded)
      .map((a) => ({ name: `${a.name} ••${a.mask}`, reason: a.syncFailed ? 'sync failed' : 'needs reconnecting' })),
    hasCurrentAccount: counted.some((a) => a.kind === 'current'),
    connectedKinds: [...new Set(usable.map((a) => a.kind))],
  };
}

/** GET /commitments?days=30 — 403 when bills aren't shared. */
export async function getCommitments() {
  await latency(120);
  requireConsent('bills');
  return clone(sandboxCommitments);
}

/** GET /goals */
export async function getGoals() {
  await latency(100);
  requireConsent();
  const goal = state.profile.goal?.value ?? forecast.goal.name;
  return [{ ...forecast.goal, name: goal }];
}

/** GET /insights */
export async function getInsights(): Promise<Insight[]> {
  await latency(200);
  requireConsent();
  return computeInsights().filter((i) => !state.dismissedInsights.includes(i.id));
}

function computeInsights(): Insight[] {
  if (!allowed('transactions')) return [];
  const usable = usableAccounts().filter((a) => !isExcluded(a));
  const meridian = usable.find((a) => a.providerAccountId === 'mer-4821');
  const harbour = usable.find((a) => a.providerAccountId === 'har-1177');
  if (!meridian || !harbour) return [];
  return [
    {
      id: 'ins_dup_streamflix',
      title: "You're paying for StreamFlix twice",
      summary: 'StreamFlix is billed 2 times a month across Harbour Bank and Meridian Bank. Cancelling the extra plan could save about £131.88 a year.',
      impact: { amount: 131.88, period: 'per year' },
      basedOn: [`Meridian ${meridian.name}`, harbour.name],
      dataPeriod: '28 Jun – 26 Sep 2026',
      confidence: 'High',
      freshness: 'updated just now',
      evidence: '6 payments, £10.99 each',
      action: 'Review subscriptions',
    },
  ];
}

/** POST /insights/:id/dismiss */
export async function dismissInsight(id: string) {
  await latency(120);
  commit({ dismissedInsights: [...state.dismissedInsights, id] });
}

// ---------- Agent tool: calculatePurchaseImpact ----------

export type Verdict = 'affordable' | 'tight' | 'not_recommended' | 'not_enough_data';

export type PurchaseImpact = {
  price: number;
  item: string | null;
  finance: { months: number; apr: number; aprAssumed: boolean; monthly: number; total: number } | null;
  verdict: Verdict;
  headline: string;
  summary: string;
  why: string[];
  rows: { label: string; value: string; negative?: boolean }[];
  chart: { lowest: number; buffer: number; alt: string } | null;
  flags: string[];
  options: { title: string; body: string }[];
  assumptions: string[];
  coverage: string;
};

const gbp = (n: number, whole = false) => {
  const s = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(Math.abs(n));
  return n < 0 ? `−${s}` : s;
};

function amortise(price: number, months: number, apr: number) {
  const r = apr / 100 / 12;
  const monthly = r === 0 ? price / months : (price * r) / (1 - Math.pow(1 + r, -months));
  return { monthly: round(monthly), total: round(monthly * months) };
}

/**
 * The only source of affordability figures (spec §10). Consent is checked here, like every tool.
 * Throws data_unavailable when live data can't be read, so the agent says so instead of guessing.
 */
export async function calculatePurchaseImpact(input: { price: number; item?: string | null; finance?: { months: number; apr: number | null } | null }): Promise<PurchaseImpact> {
  await latency(350);
  requireConsent();
  if (state.simulateDataOutage) throw new ApiError('data_unavailable', "Couldn't retrieve live financial data");
  const { price } = input;
  if (!(price > 0)) throw new ApiError('invalid', 'A price is needed');
  const item = input.item?.trim() || null;
  const thing = item ?? 'purchase';
  const snap = computeSnapshot();
  const buffer = state.profile.buffer?.value ?? 500;
  const goalName = state.profile.goal?.value ?? forecast.goal.name;
  const coveragePct = snap.accountsUsed ? Math.round((snap.accountsUpToDate / snap.accountsUsed) * 100) : 0;
  const coverage = `${coveragePct}% of accounts up to date · ${coveragePct === 100 ? 'high' : coveragePct >= 60 ? 'medium' : 'low'} confidence`;

  const assumptions: string[] = [];
  snap.stale.forEach((s) => assumptions.push(`${s.name} last synced ${s.lastSync}; its last known balance is used.`));
  snap.excluded.forEach((e) => assumptions.push(`${e.name} is left out (${e.reason}).`));
  if (snap.savings === null) assumptions.push('Savings aren’t shared, so they aren’t counted.');
  if (snap.billsNext30 === null) assumptions.push('Bills aren’t shared, so upcoming bills aren’t included.');

  const finance = input.finance
    ? (() => {
        const aprAssumed = input.finance.apr == null;
        const apr = input.finance.apr ?? 0;
        return { months: input.finance.months, apr, aprAssumed, ...amortise(price, input.finance.months, apr) };
      })()
    : null;
  if (finance?.aprAssumed) assumptions.push('APR not known — shown at 0%. The real cost will be higher if interest is charged.');

  if (!allowed('transactions') || !snap.hasCurrentAccount) {
    return {
      price, item, finance, verdict: 'not_enough_data',
      headline: `Not enough data · ${thing}`,
      summary: !allowed('transactions')
        ? 'Transaction history isn’t shared, so BACI can’t forecast your balance. Turn it on in Settings › Data permissions to get an answer.'
        : 'BACI can’t see an up-to-date current account, so it won’t guess. Connect or reconnect a current account to get an answer.',
      why: [], rows: [], chart: null, flags: [], options: [], assumptions, coverage,
    };
  }

  const bills = snap.billsNext30 ?? 0;
  const upfront = finance ? 0 : price;
  const firstPayment = finance ? finance.monthly : 0;
  const available = snap.availableCurrent;
  const afterPurchase = round(available - upfront);
  const lowest = round(afterPurchase - firstPayment - bills - forecast.everydaySpendBeforePayday);
  const gap = round(lowest - buffer);
  const cost = finance ? finance.total : price;
  const goalDelayDays = Math.round((cost / forecast.goal.monthlyContribution) * 30);
  const verdict: Verdict = lowest >= buffer ? 'affordable' : lowest >= 0 ? 'tight' : 'not_recommended';

  const headline = { affordable: `Affordable · ${thing}`, tight: `Affordable, but it's tight · ${thing}`, not_recommended: `Not recommended right now · ${thing}`, not_enough_data: '' }[verdict];
  const how = finance ? `on finance at ${gbp(finance.monthly)}/month for ${finance.months} months` : '';
  const base = `Based on the ${snap.accountsUsed} accounts you've connected`;
  const summary =
    verdict === 'affordable'
      ? `${base}, you could buy the ${gbp(price, true)} ${thing}${how ? ` ${how}` : ''} and stay above your ${gbp(buffer, true)} buffer — your lowest point would be about ${gbp(lowest, true)} around ${forecast.lowestPointDate}.`
      : verdict === 'tight'
        ? `${base}, you could buy the ${gbp(price, true)} ${thing}${how ? ` ${how}` : ''}, but your balance would dip to ${gbp(lowest, true)} around ${forecast.lowestPointDate}, below your ${gbp(buffer, true)} buffer. It would slow “${goalName}” by about ${goalDelayDays} days.`
        : `${base}, buying the ${gbp(price, true)} ${thing}${how ? ` ${how}` : ''} would take your current accounts to about ${gbp(lowest, true)} around ${forecast.lowestPointDate}, before your next income arrives.`;

  const rows: PurchaseImpact['rows'] = [
    { label: 'Available now', value: gbp(available) },
    finance
      ? { label: `Finance (${finance.months} months${finance.aprAssumed ? ', APR unknown' : ` at ${finance.apr}%`})`, value: `${gbp(finance.monthly)}/month` }
      : { label: 'Purchase', value: gbp(-price) },
    { label: 'Balance right after', value: gbp(afterPurchase) },
    { label: 'Bills & repayments (30 days)', value: snap.billsNext30 === null ? 'Not shared' : gbp(bills) },
    { label: 'Everyday spending to payday', value: gbp(forecast.everydaySpendBeforePayday) },
    { label: `Lowest point (${forecast.lowestPointDate})`, value: gbp(lowest) },
    { label: `Above your ${gbp(buffer, true)} buffer`, value: gbp(gap), negative: gap < 0 },
    { label: goalName, value: `~${goalDelayDays} days later` },
    finance ? { label: 'Total repayable', value: gbp(finance.total) } : { label: 'Card use', value: 'None — paid from current accounts' },
  ];

  const options: PurchaseImpact['options'] = [];
  if (verdict !== 'affordable') {
    options.push({ title: 'Wait until payday.', body: `Income is expected around ${forecast.nextIncome.date}.` });
    const maxSpend = round(price + gap);
    if (!finance && maxSpend > 0) options.push({ title: 'Spend less.', body: `Around ${gbp(maxSpend, true)} keeps you above your ${gbp(buffer, true)} buffer.` });
    if (snap.savings !== null && Math.abs(gap) <= snap.savings) options.push({ title: 'Top up from savings.', body: `About ${gbp(Math.abs(gap), true)} from savings keeps you above your buffer.` });
  }

  const flags: string[] = [];
  if (lowest < buffer) flags.push('Dips below your buffer');
  if (lowest < 0) flags.push('Would go overdrawn');
  if (goalDelayDays > 0) flags.push('Slows your goal');
  if (finance && finance.apr > 0) flags.push(`Costs ${gbp(finance.total - price)} in interest`);
  if (finance?.aprAssumed) flags.push('APR unknown — shown at 0%');

  return {
    price, item, finance, verdict, headline, summary,
    why: [
      `${gbp(available, true)} available across your connected current accounts.`,
      snap.monthlyIncome ? `About ${gbp(forecast.nextIncome.amount, true)} of income expected in the next 30 days, next on ${forecast.nextIncome.date}.` : 'Income isn’t shared, so no income is assumed.',
      snap.billsNext30 === null ? 'Bills aren’t shared, so they aren’t included.' : `${gbp(bills, true)} of bills and repayments due in the same period.`,
    ],
    rows,
    chart: { lowest, buffer, alt: `Lowest projected balance ${gbp(lowest, true)} against your ${gbp(buffer, true)} buffer.` },
    flags, options, assumptions, coverage,
  };
}

/** Plain-text versions handed to the ElevenLabs agent. */
export function describeImpact(r: PurchaseImpact) {
  return [
    `${r.headline}.`,
    r.summary,
    r.why.length ? `Why: ${r.why.join(' ')}` : '',
    r.options.length ? `Options (not advice): ${r.options.map((o) => `${o.title} ${o.body}`).join(' ')}` : '',
    r.assumptions.length ? `Assumptions: ${r.assumptions.join(' ')}` : '',
    `Data: ${r.coverage}.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function describeSnapshot(s: Snapshot) {
  const v = (n: number | null) => (n === null ? 'not shared' : gbp(n));
  return [
    `BACI financial snapshot as of ${s.asOf} (GBP), from ${s.accountsUsed} connected accounts.`,
    `Available in current accounts: ${gbp(s.availableCurrent)}. Savings & ISAs: ${v(s.savings)}.`,
    `Credit cards owed: ${v(s.creditOwed)}. Loans owed: ${v(s.loansOwed)}. Debts are never counted as cash.`,
    `Bills and repayments in the next 30 days: ${v(s.billsNext30)}${s.billsNext30 !== null ? ` (${sandboxCommitments.map((b) => `${b.date} ${b.label} ${gbp(b.amount)}`).join('; ')})` : ''}.`,
    s.monthlyIncome ? `Detected income about ${gbp(s.monthlyIncome)}/month, next on ${forecast.nextIncome.date}.` : 'Income not shared.',
    `Safety buffer: ${gbp(state.profile.buffer?.value ?? 500)}. Goal: ${state.profile.goal?.value ?? forecast.goal.name}.`,
    s.stale.length ? `Out of date: ${s.stale.map((x) => `${x.name} (last synced ${x.lastSync})`).join(', ')}.` : '',
    s.excluded.length ? `Left out of answers, never estimated: ${s.excluded.map((x) => `${x.name} (${x.reason})`).join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function snapshotForAgent() {
  requireConsent();
  if (state.simulateDataOutage) throw new ApiError('data_unavailable', "Couldn't retrieve live financial data");
  return computeSnapshot();
}

// ---------- Prototype helpers ----------

/** "Explore with sample data": consent + profile + four banks, onboarding done. */
export async function loadSampleData() {
  await latency(150);
  state = initialState();
  const t = now();
  state.consent = { version: CONSENT_VERSION, permissions: defaultPermissions(), firstAgreedAt: t, updatedAt: t };
  const dv = <T,>(value: T) => ({ value, source: 'user_declared' as const, recordedAt: t });
  state.profile = { income: dv(42000), status: dv('Employed'), goal: dv('Build savings'), risk: dv('Balanced'), frequency: dv('Weekly'), buffer: dv(500) };
  const add = (institutionId: string, status: ConnectionStatus, lastSync: string, pick?: string[]) => {
    const id = newId('conn');
    state.connections.push({ id, institutionId, status, lastSuccessfulSync: lastSync, createdAt: Date.now() + state.connections.length });
    for (const a of sandboxAccounts[institutionId]) {
      if (pick && !pick.includes(a.providerAccountId)) continue;
      state.accounts.push({ id: newId('acc'), connectionId: id, providerAccountId: a.providerAccountId, name: a.name, mask: a.mask, kind: a.kind, balance: a.balance, selected: true, syncFailed: false });
    }
  };
  add('meridian', 'active', '2 hours ago');
  add('harbour', 'stale', '3 days ago');
  add('northgate', 'active', 'just now');
  add('lumen', 'active', 'just now');
  state.onboarding = { step: 'done' };
  commit({});
}

export async function resetAll() {
  state = initialState();
  commit({});
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
