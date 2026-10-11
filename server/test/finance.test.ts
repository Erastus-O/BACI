import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRecurring, forecast, insights, merchantKey, upcomingCommitments, type Tx } from '../src/finance.ts';
import { sampleTransactions } from './fakePlaid.ts';

const today = new Date();
const todayIso = today.toISOString().slice(0, 10);
const txs: Tx[] = sampleTransactions(today).map((t) => ({
  accountId: t.account_id,
  amount: t.amount,
  date: t.date,
  name: t.name,
  merchant: t.merchant_name,
  category: t.personal_finance_category.primary,
  pending: false,
}));

test('merchant names are normalised', () => {
  assert.equal(merchantKey({ name: 'TESCO STORES 3021 LONDON', merchant: null }), 'tesco stores london');
  assert.equal(merchantKey({ name: 'x', merchant: 'Netflix' }), 'netflix');
});

test('finds monthly bills, repayments and salary; ignores irregular shopping', () => {
  const r = findRecurring(txs, todayIso);
  const labels = r.map((x) => `${x.direction}:${x.label}`).sort();
  assert.ok(labels.includes('out:Netflix'));
  assert.ok(labels.includes('out:Lambeth Council'));
  assert.ok(labels.includes('out:Zopa'));
  assert.ok(labels.includes('in:Acme Ltd'));
  assert.ok(r.some((x) => /landlord rent/i.test(x.label)));
  assert.ok(!labels.some((l) => /pret/i.test(l)), 'every-9-days coffee is not a monthly bill');
  assert.equal(r.find((x) => x.label === 'Zopa')?.repayment, true);
});

test('upcoming commitments cover the next 30 days, in date order', () => {
  const c = upcomingCommitments(findRecurring(txs, todayIso), todayIso);
  assert.ok(c.length >= 5);
  assert.ok(c.every((x) => x.isoDate >= todayIso));
  assert.deepEqual([...c].sort((a, b) => a.isoDate.localeCompare(b.isoDate)), c);
  assert.equal(c.find((x) => x.label === 'Zopa')?.kind, 'repayment');
});

test('forecast detects income and spends everyday money until payday', () => {
  const f = forecast(txs, findRecurring(txs, todayIso), todayIso);
  assert.ok(f.monthlyIncomeDetected && Math.abs(f.monthlyIncomeDetected - 2650) < 1);
  assert.equal(f.nextIncome?.amount, 2650);
  assert.ok(f.everydaySpendBeforePayday > 0);
});

test('no income history → no income assumed', () => {
  const f = forecast(txs.filter((t) => t.amount > 0), [], todayIso);
  assert.equal(f.nextIncome, null);
  assert.equal(f.monthlyIncomeDetected, null);
});

test('the same subscription on two accounts becomes an insight', () => {
  const list = insights(findRecurring(txs, todayIso), (id) => id, todayIso);
  assert.equal(list.length, 1);
  assert.match(list[0].title, /Netflix twice/);
  assert.equal(list[0].impact.amount, 131.88);
});
