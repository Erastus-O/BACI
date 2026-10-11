// Turns real transactions into what BACI shows: upcoming bills, income, everyday spending and
// insights. Pure functions; amounts follow Plaid's sign convention (positive = money out).

export type Tx = {
  accountId: string;
  amount: number;
  date: string; // YYYY-MM-DD
  name: string;
  merchant: string | null;
  category: string | null; // Plaid personal_finance_category.primary
  pending: boolean;
};

export type Commitment = { date: string; isoDate: string; label: string; amount: number; kind: 'bill' | 'repayment' };

export type Forecast = {
  asOf: string;
  everydaySpendBeforePayday: number;
  nextIncome: { date: string; amount: number } | null;
  lowestPointDate: string;
  monthlyIncomeDetected: number | null;
  monthlySurplus: number | null;
};

export type Insight = {
  id: string;
  title: string;
  summary: string;
  impact: { amount: number; period: string };
  basedOn: string[];
  dataPeriod: string;
  confidence: 'High' | 'Medium';
  freshness: string;
  evidence: string;
  action: string;
};

export type Recurring = {
  key: string;
  label: string;
  accountId: string;
  direction: 'out' | 'in';
  intervalDays: number;
  amount: number;
  last: string;
  next: string;
  count: number;
  repayment: boolean;
};

const DAY = 86_400_000;
const toDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (isoDate: string, n: number) => iso(toDay(isoDate) + n * DAY);
const round = (n: number) => Math.round(n * 100) / 100;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (isoDate: string) => {
  const d = new Date(toDay(isoDate));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const longDate = (isoDate: string) => `${shortDate(isoDate)} ${new Date(toDay(isoDate)).getUTCFullYear()}`;

/** "TESCO STORES 3021 LONDON" and "Tesco Stores" → "tesco stores". */
export function merchantKey(t: Pick<Tx, 'merchant' | 'name'>) {
  return (t.merchant || t.name)
    .toLowerCase()
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z& ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const isTransfer = (t: Tx) => /^TRANSFER/.test(t.category ?? '');
const isRepayment = (t: Tx) => t.category === 'LOAN_PAYMENTS' || /loan|finance|mortgage|klarna|repayment|credit card/i.test(`${t.merchant ?? ''} ${t.name}`);

/** Payments that repeat on a steady schedule (weekly, fortnightly, monthly) at a steady amount, per account. */
export function findRecurring(txs: Tx[], today: string): Recurring[] {
  const groups = new Map<string, Tx[]>();
  for (const t of txs) {
    if (t.pending || t.amount === 0) continue;
    const direction = t.amount > 0 ? 'out' : 'in';
    if (direction === 'out' && isTransfer(t) && !isRepayment(t)) continue;
    const key = merchantKey(t);
    if (!key) continue;
    const k = `${t.accountId}|${direction}|${key}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }

  const out: Recurring[] = [];
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    const [accountId, direction, key] = k.split('|') as [string, 'out' | 'in', string];
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const gaps = sorted.slice(1).map((t, i) => (toDay(t.date) - toDay(sorted[i].date)) / DAY);
    const interval = median(gaps);
    const steady = (lo: number, hi: number) => interval >= lo && interval <= hi && gaps.every((g) => g >= lo * 0.7 && g <= hi * 1.3);
    const period = steady(26, 35) ? 30.4 : steady(13, 16) ? 14 : steady(6, 8) ? 7 : null;
    if (!period) continue;
    const amounts = sorted.map((t) => Math.abs(t.amount));
    const typical = median(amounts);
    if (amounts.some((a) => Math.abs(a - typical) > Math.max(2, typical * 0.25))) continue;
    const last = sorted[sorted.length - 1].date;
    // Stopped? Then it isn't upcoming.
    if ((toDay(today) - toDay(last)) / DAY > period * 1.6) continue;
    let next = period === 30.4 ? addMonths(last, 1) : addDays(last, period);
    while (next < today) next = period === 30.4 ? addMonths(next, 1) : addDays(next, period);
    const latest = sorted[sorted.length - 1];
    out.push({
      key,
      label: titleCase(latest.merchant || key),
      accountId,
      direction,
      intervalDays: period,
      amount: round(typical),
      last,
      next,
      count: sorted.length,
      repayment: isRepayment(latest),
    });
  }
  return out;
}

function addMonths(isoDate: string, n: number) {
  const d = new Date(toDay(isoDate));
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return iso(d.getTime());
}

/** Bills and repayments due in the next `days` days. */
export function upcomingCommitments(recurring: Recurring[], today: string, days = 30): Commitment[] {
  const end = addDays(today, days);
  const out: Commitment[] = [];
  for (const r of recurring.filter((x) => x.direction === 'out')) {
    let next = r.next;
    while (next <= end) {
      out.push({ date: shortDate(next), isoDate: next, label: r.label, amount: r.amount, kind: r.repayment ? 'repayment' : 'bill' });
      next = r.intervalDays === 30.4 ? addMonths(next, 1) : addDays(next, r.intervalDays);
    }
  }
  return out.sort((a, b) => a.isoDate.localeCompare(b.isoDate) || b.amount - a.amount);
}

export function forecast(txs: Tx[], recurring: Recurring[], today: string): Forecast {
  const income = recurring.filter((r) => r.direction === 'in' && r.amount >= 100);
  const monthlyIncome = income.length ? round(income.reduce((s, r) => s + r.amount * (30.4 / r.intervalDays), 0)) : null;
  const nextIncome = income.length ? [...income].sort((a, b) => a.next.localeCompare(b.next))[0] : null;

  // Everyday spending: money out that isn't a recurring bill or a transfer, over the last 60 days.
  const recurringKeys = new Set(recurring.filter((r) => r.direction === 'out').map((r) => `${r.accountId}|${r.key}`));
  const since = addDays(today, -60);
  const posted = txs.filter((t) => !t.pending);
  const earliest = posted.reduce((m, t) => (t.date < m ? t.date : m), today);
  const window = Math.max(14, Math.min(60, (toDay(today) - toDay(earliest)) / DAY));
  const spent = posted
    .filter((t) => t.amount > 0 && t.date >= since && !isTransfer(t) && !recurringKeys.has(`${t.accountId}|${merchantKey(t)}`))
    .reduce((s, t) => s + t.amount, 0);
  const daily = spent / window;
  const daysToPayday = nextIncome ? Math.max(1, (toDay(nextIncome.next) - toDay(today)) / DAY) : 30;
  const monthlyBills = recurring.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amount * (30.4 / r.intervalDays), 0);

  return {
    asOf: longDate(today),
    everydaySpendBeforePayday: round(daily * daysToPayday),
    nextIncome: nextIncome ? { date: shortDate(nextIncome.next), amount: nextIncome.amount } : null,
    lowestPointDate: shortDate(nextIncome ? addDays(nextIncome.next, -1) : addDays(today, 30)),
    monthlyIncomeDetected: monthlyIncome,
    monthlySurplus: monthlyIncome === null ? null : round(monthlyIncome - monthlyBills - daily * 30.4),
  };
}

/** The same subscription paid from two accounts. */
export function insights(recurring: Recurring[], accountName: (id: string) => string, today: string): Insight[] {
  const subs = recurring.filter((r) => r.direction === 'out' && r.intervalDays === 30.4 && !r.repayment && r.amount < 100);
  const byKey = new Map<string, Recurring[]>();
  subs.forEach((r) => byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]));
  const out: Insight[] = [];
  for (const [key, list] of byKey) {
    if (list.length < 2) continue;
    const cheapest = Math.min(...list.map((r) => r.amount));
    const yearly = round(cheapest * 12 * (list.length - 1));
    const payments = list.reduce((s, r) => s + r.count, 0);
    out.push({
      id: `dup_${key.replace(/\s+/g, '_')}`,
      title: `You're paying for ${list[0].label} ${list.length === 2 ? 'twice' : `${list.length} times`}`,
      summary: `${list[0].label} is billed ${list.length} times a month across ${list.map((r) => accountName(r.accountId)).join(' and ')}. Cancelling the extra plan could save about £${yearly.toFixed(2)} a year.`,
      impact: { amount: yearly, period: 'per year' },
      basedOn: list.map((r) => accountName(r.accountId)),
      dataPeriod: `${shortDate(list.map((r) => r.last).sort()[0])} – ${shortDate(today)}`,
      confidence: payments >= 6 ? 'High' : 'Medium',
      freshness: 'updated just now',
      evidence: `${payments} payments, £${cheapest.toFixed(2)} each`,
      action: 'Review subscriptions',
    });
  }
  return out;
}
