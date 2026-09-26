// Sandbox data for the prototype. Bank names are fictional sandbox institutions, as in the design.

export type Institution = {
  id: string;
  name: string;
  initial: string;
  /** The bank's own colour, used on its (simulated) sign-in page — never BACI's. */
  brandColour: string;
  types: string;
};

export const institutions: Institution[] = [
  { id: 'meridian', name: 'Meridian Bank', initial: 'M', brandColour: '#2F4B7C', types: 'Current account' },
  { id: 'northgate', name: 'Northgate Building Society', initial: 'N', brandColour: '#3E6B48', types: 'Savings · ISA' },
  { id: 'lumen', name: 'Lumen Card', initial: 'L', brandColour: '#7A4E9C', types: 'Credit card' },
  { id: 'harbour', name: 'Harbour Bank', initial: 'H', brandColour: '#1F6F78', types: 'Current account · Loan' },
  { id: 'fathom', name: 'Fathom Invest', initial: 'F', brandColour: '#8A5A2B', types: 'Investment · Pension' },
];

export type AccountKind = 'current' | 'savings' | 'credit' | 'loan' | 'investment';

export type SandboxAccount = {
  /** Stable id at the provider; a joint account has the same id at both banks. */
  providerAccountId: string;
  name: string;
  mask: string;
  kind: AccountKind;
  /** Money held; for credit/loan, the amount owed. null = provider doesn't report it. */
  balance: number | null;
};

// What each sandbox bank "returns" when the user approves access.
export const sandboxAccounts: Record<string, SandboxAccount[]> = {
  meridian: [
    { providerAccountId: 'mer-4821', name: 'Everyday Current', mask: '4821', kind: 'current', balance: 2940.18 },
    { providerAccountId: 'joint-6402', name: 'Joint Current', mask: '6402', kind: 'current', balance: 500 },
  ],
  harbour: [
    { providerAccountId: 'har-1177', name: 'Harbour Current', mask: '1177', kind: 'current', balance: 318.4 },
    { providerAccountId: 'har-5520', name: 'Personal Loan', mask: '5520', kind: 'loan', balance: 4200 },
  ],
  northgate: [
    { providerAccountId: 'nor-3309', name: 'Easy Saver', mask: '3309', kind: 'savings', balance: 5100 },
    { providerAccountId: 'nor-3310', name: 'Cash ISA', mask: '3310', kind: 'savings', balance: 3500 },
  ],
  lumen: [{ providerAccountId: 'lum-0092', name: 'Lumen Rewards', mask: '0092', kind: 'credit', balance: 640 }],
  fathom: [{ providerAccountId: 'fat-7781', name: 'Workplace Pension', mask: '7781', kind: 'investment', balance: null }],
};

export const kindLabel: Record<AccountKind, string> = {
  current: 'Current account',
  savings: 'Savings',
  credit: 'Credit card',
  loan: 'Loan',
  investment: 'Investment',
};

export type Commitment = { date: string; label: string; amount: number; kind: 'bill' | 'repayment' };

// Regular payments detected in the next 30 days (total £1,863.96).
export const commitments: Commitment[] = [
  { date: '1 Oct', label: 'Rent', amount: 1100, kind: 'bill' },
  { date: '3 Oct', label: 'Loan repayment', amount: 185, kind: 'repayment' },
  { date: '5 Oct', label: 'Council tax', amount: 164, kind: 'bill' },
  { date: '8 Oct', label: 'Energy', amount: 118.5, kind: 'bill' },
  { date: '12 Oct', label: 'Phone & broadband', amount: 64.99, kind: 'bill' },
  { date: '14 Oct', label: 'Travel card', amount: 158, kind: 'bill' },
  { date: '17 Oct', label: 'Gym', amount: 39.99, kind: 'bill' },
  { date: '20 Oct', label: 'StreamFlix ×2', amount: 21.98, kind: 'bill' },
  { date: '22 Oct', label: 'Insurance', amount: 11.5, kind: 'bill' },
];

export const forecast = {
  asOf: '26 Sep 2026',
  goal: { name: 'Build savings', monthlyContribution: 975, saved: 8600, target: 12000 },
  /** Everyday spending forecast between now and the next payday. */
  everydaySpendBeforePayday: 268.55,
  nextIncome: { date: '25 Oct', amount: 3550 },
  lowestPointDate: '24 Oct',
  monthlyIncomeDetected: 3550,
};

export type ConsentCategory =
  | 'transactions'
  | 'categories'
  | 'bills'
  | 'savings'
  | 'credit'
  | 'loans'
  | 'overdraft'
  | 'investments'
  | 'income';

export const consentCategories: { id: ConsentCategory; label: string; desc: string; defaultOn: boolean; impact: string }[] = [
  { id: 'transactions', label: 'Transaction history', desc: 'Payments in and out, to understand patterns', defaultOn: true, impact: 'Without transaction history BACI can’t spot subscriptions or forecast your balance, so “Can I afford this?” can’t answer.' },
  { id: 'categories', label: 'Spending categories', desc: 'Groceries, transport, eating out…', defaultOn: true, impact: 'Spending won’t be grouped into categories.' },
  { id: 'bills', label: 'Bills & direct debits', desc: 'Warnings before regular payments land', defaultOn: true, impact: 'Upcoming bills won’t be shown or counted in “Can I afford this?”.' },
  { id: 'savings', label: 'Savings & ISAs', desc: 'So answers reflect all the money you hold', defaultOn: true, impact: 'Savings aren’t counted in “Can I afford this?”.' },
  { id: 'credit', label: 'Credit cards', desc: 'Balances and limits — never counted as cash', defaultOn: true, impact: 'Card balances won’t appear in your totals.' },
  { id: 'loans', label: 'Loans & mortgages', desc: 'Outstanding balances and repayments', defaultOn: true, impact: 'Loan balances won’t appear in your totals.' },
  { id: 'overdraft', label: 'Overdraft usage', desc: 'When and how often you dip into it', defaultOn: true, impact: 'BACI won’t warn you before you go overdrawn.' },
  { id: 'investments', label: 'Investments & pensions', desc: 'Where your provider supports it', defaultOn: false, impact: 'Investments and pensions stay out of your picture.' },
  { id: 'income', label: 'Income signals', desc: 'Detecting salary and regular income', defaultOn: true, impact: 'BACI won’t detect your income, so it can’t say when payday is.' },
];

export const CONSENT_VERSION = '2026-09.1';
