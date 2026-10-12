import type { AccountKind } from '../data/mock';

// Spending analytics, computed in the app from transactions (demo: generated; live: GET /v1/transactions).
// Amounts follow Plaid: positive = money out, negative = money in.

export type Txn = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  name: string;
  merchant: string | null;
  /** Plaid personal_finance_category.primary, e.g. FOOD_AND_DRINK. */
  category: string | null;
  /** Plaid personal_finance_category.detailed, e.g. TRANSFER_OUT_SAVINGS. */
  detailed: string | null;
  /** Plaid payment_channel: 'online' | 'in store' | 'other'. */
  channel: string | null;
  accountId: string;
  accountName: string;
  accountKind: AccountKind;
};

export type PayMethod = 'card' | 'direct_debit' | 'standing_order' | 'transfer' | 'cash' | 'other';

export const methods: PayMethod[] = ['card', 'direct_debit', 'standing_order', 'transfer', 'cash', 'other'];

export const methodLabel: Record<PayMethod, string> = {
  card: 'Card',
  direct_debit: 'Direct debit',
  standing_order: 'Standing order',
  transfer: 'Transfer',
  cash: 'Cash',
  other: 'Other',
};

/** Categorical slots in fixed order (validated for the dark glass surface; see the dataviz palette check). */
export const methodColour: Record<PayMethod, string> = {
  card: '#3987E5',
  direct_debit: '#D95926',
  standing_order: '#199E70',
  transfer: '#C98500',
  cash: '#D55181',
  other: '#9085E9',
};

const categoryNames: Record<string, string> = {
  FOOD_AND_DRINK: 'Food & drink',
  RENT_AND_UTILITIES: 'Rent & bills',
  LOAN_PAYMENTS: 'Loan repayments',
  ENTERTAINMENT: 'Entertainment',
  TRANSPORTATION: 'Transport',
  TRAVEL: 'Travel',
  GENERAL_MERCHANDISE: 'Shopping',
  GOVERNMENT_AND_NON_PROFIT: 'Council & government',
  MEDICAL: 'Health',
  PERSONAL_CARE: 'Personal care',
  GENERAL_SERVICES: 'Services & insurance',
  HOME_IMPROVEMENT: 'Home',
  BANK_FEES: 'Bank fees',
  TRANSFER_OUT: 'Transfers to others',
};

export const categoryLabel = (c: string | null) => (c && categoryNames[c]) || 'Other';

// Money moving between the person's own accounts: not spending, and not income.
const INTERNAL = /^(TRANSFER_OUT_SAVINGS|TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS|LOAN_PAYMENTS_CREDIT_CARD_PAYMENT|TRANSFER_IN_)/;

export function isInternal(t: Pick<Txn, 'detailed' | 'category' | 'amount' | 'accountKind'>) {
  if (t.detailed && INTERNAL.test(t.detailed)) return true;
  // Paying off a card shows up on the card as money in.
  return t.accountKind === 'credit' && t.amount < 0 && t.category !== 'INCOME';
}

/** How a payment was made, from what the bank reports. */
export function methodOf(t: Pick<Txn, 'name' | 'category' | 'detailed' | 'channel' | 'accountKind'>): PayMethod {
  const name = t.name.toUpperCase();
  const cat = (t.category ?? '').toUpperCase();
  const det = (t.detailed ?? '').toUpperCase();
  if (det === 'TRANSFER_OUT_WITHDRAWAL' || /\b(ATM|CASH WITHDRAWAL)\b/.test(name)) return 'cash';
  if (t.accountKind === 'credit') return 'card';
  if (/\b(SO|STO|STANDING ORDER)\b/.test(name)) return 'standing_order';
  if (/\b(DD|DDR|DIRECT DEBIT)\b/.test(name)) return 'direct_debit';
  if (cat.startsWith('TRANSFER') || /\b(FPS|FASTER PAYMENT|BACS|TFR|BANK TRANSFER)\b/.test(name)) return 'transfer';
  if (t.channel === 'in store' || t.channel === 'online') return 'card';
  if (cat === 'LOAN_PAYMENTS' || cat === 'RENT_AND_UTILITIES') return 'direct_debit';
  return 'other';
}

export type Payment = Txn & { method: PayMethod; categoryName: string; month: string };

export type MonthStat = {
  /** YYYY-MM */
  key: string;
  label: string;
  year: number;
  spend: number;
  income: number;
  byMethod: Record<PayMethod, number>;
  /** The month isn't over yet, or history starts part-way through it. */
  partial: boolean;
};

export type Zone = 'stable' | 'caution' | 'over';

export type HealthPart = { key: 'spending' | 'cushion' | 'debt' | 'steady'; label: string; points: number; max: number; detail: string };

export type Rating = 'Excellent' | 'Good' | 'Fair' | 'Needs attention';

export type Health = {
  score: number;
  rating: Rating;
  parts: HealthPart[];
  /** Parts that couldn't be scored yet, and why. */
  missing: string[];
  /** The score if a month's spending reached the ceiling. */
  atCeiling: number | null;
};

export type Analytics = {
  asOf: string;
  months: MonthStat[];
  payments: Payment[];
  monthlyIncome: number | null;
  /** Average over complete months. */
  avgMonthly: number | null;
  completeMonths: number;
  yearly: { amount: number; projected: boolean } | null;
  fixedMonthly: number;
  /** Above this a month's spending pulls the health score down hard. */
  ceiling: number | null;
  /** Spend between these to stay financially stable. */
  stable: { low: number; high: number } | null;
  health: Health | null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Share of income spent that is comfortable, and the ceiling. */
export const STABLE_SHARE = 0.8;
export const CEILING_SHARE = 0.9;

const WEIGHTS = { spending: 40, cushion: 20, debt: 20, steady: 20 };

/** Points for spending as a share of income: full at ≤60%, falling faster past the stable share and the ceiling. */
function spendingPoints(ratio: number) {
  const pts: [number, number][] = [
    [0.6, 40],
    [STABLE_SHARE, 32],
    [CEILING_SHARE, 16],
    [1, 0],
  ];
  if (ratio <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (ratio <= x1) return y0 + ((ratio - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 0;
}

export function ratingOf(score: number): Rating {
  return score >= 80 ? 'Excellent' : score >= 70 ? 'Good' : score >= 55 ? 'Fair' : 'Needs attention';
}

export function zoneOf(spend: number, a: Pick<Analytics, 'stable' | 'ceiling'>): Zone | null {
  if (!a.ceiling || !a.stable) return null;
  return spend > a.ceiling ? 'over' : spend > a.stable.high ? 'caution' : 'stable';
}

export const monthName = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

export function computeAnalytics(input: {
  transactions: Txn[];
  /** YYYY-MM-DD */
  today: string;
  /** Detected income, if any; otherwise it's worked out from salary payments. */
  monthlyIncome: number | null;
  /** False when income isn't shared: then nothing is worked out from it. */
  incomeAllowed: boolean;
  fixedMonthly: number;
  /** Current accounts plus savings. */
  cash: number;
}): Analytics {
  const { today } = input;
  const payments: Payment[] = input.transactions
    .filter((t) => t.date <= today)
    .map((t) => ({ ...t, method: methodOf(t), categoryName: t.detailed === 'TRANSFER_OUT_WITHDRAWAL' ? 'Cash withdrawals' : categoryLabel(t.category), month: t.date.slice(0, 7) }))
    .sort((a, b) => (a.date === b.date ? b.amount - a.amount : a.date < b.date ? 1 : -1));
  const spending = payments.filter((p) => p.amount > 0 && !isInternal(p));

  // The last 12 calendar months, from the first month with any history.
  const [ty, tm] = today.split('-').map(Number);
  const earliest = payments.reduce((m, p) => (p.date < m ? p.date : m), today);
  const months: MonthStat[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(ty, tm - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (key < earliest.slice(0, 7)) continue;
    const mine = spending.filter((p) => p.month === key);
    const byMethod = Object.fromEntries(methods.map((m) => [m, r2(mine.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0))])) as Record<PayMethod, number>;
    months.push({
      key,
      label: MONTHS[d.getUTCMonth()],
      year: d.getUTCFullYear(),
      spend: r2(mine.reduce((s, p) => s + p.amount, 0)),
      income: r2(-payments.filter((p) => p.month === key && p.category === 'INCOME' && p.amount < 0).reduce((s, p) => s + p.amount, 0)),
      byMethod,
      partial: i === 0 || (key === earliest.slice(0, 7) && Number(earliest.slice(8, 10)) > 3),
    });
  }

  const complete = months.filter((m) => !m.partial);
  const avgMonthly = complete.length ? r2(complete.reduce((s, m) => s + m.spend, 0) / complete.length) : null;
  const avgIncome = complete.length ? complete.reduce((s, m) => s + m.income, 0) / complete.length : 0;
  const monthlyIncome = !input.incomeAllowed ? null : (input.monthlyIncome ?? (avgIncome > 0 ? r2(avgIncome) : null));
  const yearly =
    avgMonthly === null ? null : complete.length >= 12 ? { amount: r2(complete.slice(-12).reduce((s, m) => s + m.spend, 0)), projected: false } : { amount: r2(avgMonthly * 12), projected: true };

  const ceiling = monthlyIncome ? Math.round(monthlyIncome * CEILING_SHARE) : null;
  const stable = monthlyIncome ? { low: Math.round(Math.min(input.fixedMonthly, monthlyIncome * STABLE_SHARE)), high: Math.round(monthlyIncome * STABLE_SHARE) } : null;

  // ----- Health score (0–100) -----
  const parts: HealthPart[] = [];
  const missing: string[] = [];
  const recent = complete.slice(-3);
  const recentAvg = recent.length ? recent.reduce((s, m) => s + m.spend, 0) / recent.length : null;
  if (monthlyIncome && recentAvg !== null) {
    const ratio = recentAvg / monthlyIncome;
    parts.push({ key: 'spending', label: 'Spending vs income', points: spendingPoints(ratio), max: WEIGHTS.spending, detail: `You spend ${Math.round(ratio * 100)}% of your income (last ${recent.length} month${recent.length === 1 ? '' : 's'})` });
  } else missing.push(monthlyIncome ? 'Spending vs income needs a full month of history' : 'Spending vs income needs your income: connect the account it’s paid into');
  if (avgMonthly) {
    const cover = Math.max(0, input.cash) / avgMonthly;
    parts.push({ key: 'cushion', label: 'Safety cushion', points: clamp01(cover / 6) * WEIGHTS.cushion, max: WEIGHTS.cushion, detail: `${cover.toFixed(1)} months of spending in current accounts and savings (aim for 6)` });
  } else missing.push('Safety cushion needs a full month of history');
  if (monthlyIncome && complete.length) {
    const debt = spending.filter((p) => p.category === 'LOAN_PAYMENTS' && complete.some((m) => m.key === p.month)).reduce((s, p) => s + p.amount, 0) / complete.length;
    const ratio = debt / monthlyIncome;
    parts.push({ key: 'debt', label: 'Debt repayments', points: clamp01((0.4 - ratio) / 0.3) * WEIGHTS.debt, max: WEIGHTS.debt, detail: debt ? `${Math.round(ratio * 100)}% of your income goes on loan repayments` : 'No loan repayments seen' });
  } else missing.push('Debt repayments need your income');
  if (complete.length >= 3 && avgMonthly) {
    const sd = Math.sqrt(complete.reduce((s, m) => s + (m.spend - avgMonthly) ** 2, 0) / complete.length);
    const cv = sd / avgMonthly;
    parts.push({ key: 'steady', label: 'Steady spending', points: clamp01((0.5 - cv) / 0.4) * WEIGHTS.steady, max: WEIGHTS.steady, detail: `Your monthly spending moves by about ${Math.round(cv * 100)}% month to month` });
  } else missing.push('Steady spending needs 3 full months of history');

  let health: Health | null = null;
  if (parts.length >= 2) {
    const score = (ps: HealthPart[]) => Math.round((ps.reduce((s, p) => s + p.points, 0) / ps.reduce((s, p) => s + p.max, 0)) * 100);
    const s = score(parts);
    const atCeiling = parts.some((p) => p.key === 'spending') ? score(parts.map((p) => (p.key === 'spending' ? { ...p, points: spendingPoints(CEILING_SHARE) } : p))) : null;
    health = { score: s, rating: ratingOf(s), parts: parts.map((p) => ({ ...p, points: Math.round(p.points) })), missing, atCeiling };
  }

  return { asOf: today, months, payments, monthlyIncome, avgMonthly, completeMonths: complete.length, yearly, fixedMonthly: r2(input.fixedMonthly), ceiling, stable, health };
}

/** Totals for a set of months: by method, category and account. */
export function summarise(a: Analytics, keys: string[]) {
  const set = new Set(keys);
  const spend = a.payments.filter((p) => set.has(p.month) && p.amount > 0 && !isInternal(p));
  const total = r2(spend.reduce((s, p) => s + p.amount, 0));
  const group = (key: (p: Payment) => string) => {
    const m = new Map<string, number>();
    for (const p of spend) m.set(key(p), (m.get(key(p)) ?? 0) + p.amount);
    return [...m.entries()].map(([k, v]) => ({ key: k, amount: r2(v), share: total ? v / total : 0 })).sort((x, y) => y.amount - x.amount);
  };
  return {
    total,
    count: spend.length,
    byMethod: group((p) => p.method) as { key: PayMethod; amount: number; share: number }[],
    byCategory: group((p) => p.categoryName),
    byAccount: group((p) => p.accountName),
  };
}
