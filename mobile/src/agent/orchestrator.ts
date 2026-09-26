/**
 * On-device conversation logic for Ask BACI (A1/A2/10 in the spec). Used when no
 * ElevenLabs agent is configured, and as the source of the rich blocks either way.
 *
 * Rules (spec A2): never guess a price — ask; finance without a term — ask months and
 * APR, and if the APR is unknown show 0% and flag it; if live data can't be read,
 * say so and offer "Try again" instead of guessing.
 */
import { commitments as allCommitments, forecast } from '../data/mock';
import { money, parseAmount, parseBareAmount, parseItem, parseTerm } from '../lib/format';
import {
  ApiError,
  calculatePurchaseImpact,
  getCommitments,
  getInsights,
  PurchaseImpact,
  Snapshot,
  snapshotForAgent,
} from '../services/api';

export type ChatItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'agent'; text: string; error?: boolean; quickReplies?: string[] }
  | { id: string; kind: 'snapshot'; snap: Snapshot }
  | { id: string; kind: 'commitments'; items: typeof allCommitments }
  | { id: string; kind: 'impact'; result: PurchaseImpact; followUps: string[] }
  | { id: string; kind: 'notice'; tone: 'warn' | 'danger' | 'info'; text: string }
  | { id: string; kind: 'system'; text: string };

type NewItem = ChatItem extends infer T ? (T extends { id: string } ? Omit<T, 'id'> : never) : never;

/** What the agent is waiting for from the user. */
export type Pending =
  | { kind: 'price'; item: string | null; finance: boolean }
  | { kind: 'term'; item: string | null; price: number }
  | null;

export type Ctx = { pending: Pending; lastImpact: PurchaseImpact | null; lastFailed: string | null };

export const initialCtx: Ctx = { pending: null, lastImpact: null, lastFailed: null };

export const welcome: NewItem = {
  kind: 'agent',
  text: "Hi, I'm BACI. Ask me anything about your money — like how much you really have, what's coming up, or whether you can afford something.",
  quickReplies: ['How much money do I have?', 'Can I afford a £1,200 laptop?', 'Can I buy this sofa on finance?'],
};

const FAILED = "I couldn't retrieve your live financial data just now, so I won't guess at the numbers. Want me to try again?";
const NEEDS_PERMISSION = "I don't have permission to look at your accounts right now, so I can't answer that. You can turn access back on in Settings › Data permissions.";

const isAffordQ = (t: string) => /afford|\bbuy\b|purchase|spend on|on finance|pay monthly|in instal|what about £/i.test(t);
const wantsFinance = (t: string) => /finance|monthly payments?|pay monthly|instal|credit agreement|spread the cost/i.test(t);

export async function respond(text: string, ctx: Ctx): Promise<{ items: NewItem[]; ctx: Ctx }> {
  try {
    return await route(text, ctx);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'consent_required') {
      return { items: [{ kind: 'agent', text: NEEDS_PERMISSION }], ctx: { ...ctx, pending: null } };
    }
    return { items: [{ kind: 'agent', text: FAILED, error: true, quickReplies: ['Try again'] }], ctx: { ...ctx, lastFailed: text } };
  }
}

async function route(text: string, ctx: Ctx): Promise<{ items: NewItem[]; ctx: Ctx }> {
  const t = text.trim();

  if (/^try again\b/i.test(t) && ctx.lastFailed) return route(ctx.lastFailed, { ...ctx, lastFailed: null });

  // Waiting for a price (A2).
  if (ctx.pending?.kind === 'price') {
    const price = parseBareAmount(t);
    if (price) {
      const { item, finance } = ctx.pending;
      if (finance) return askTerm(item, price, ctx);
      return impact({ price, item }, ctx);
    }
    if (!isAffordQ(t)) {
      return { items: [{ kind: 'agent', text: `I'll need the price to work it out — how much does the ${ctx.pending.item ?? 'item'} cost?` }], ctx };
    }
  }

  // Waiting for a finance term (A2).
  if (ctx.pending?.kind === 'term') {
    const term = parseTerm(t);
    if (term.months) {
      return impact({ price: ctx.pending.price, item: ctx.pending.item, finance: { months: term.months, apr: term.aprUnknown ? null : term.apr } }, ctx);
    }
    if (!isAffordQ(t)) {
      return { items: [{ kind: 'agent', text: 'How many months is the finance over? For example, “24 months at 9.9%”.' }], ctx };
    }
  }

  // Follow-ups on the last answer.
  if (/wait (until|till) pay ?day/i.test(t)) {
    const last = ctx.lastImpact;
    const snap = await snapshotForAgent();
    const buffer = last?.chart?.buffer ?? 500;
    // Buying after income lands: the same outgoings, but with payday's income in first.
    const after = (last?.chart?.lowest ?? snap.availableCurrent) + forecast.nextIncome.amount;
    return {
      items: [
        {
          kind: 'agent',
          text: last
            ? `If you wait until payday, about ${money(forecast.nextIncome.amount, true)} should arrive around ${forecast.nextIncome.date} before you buy. Your lowest point would then be about ${money(after, true)}${after >= buffer ? `, comfortably above your ${money(buffer, true)} buffer` : `, still below your ${money(buffer, true)} buffer`}. This is an estimate from your connected accounts, not advice.`
            : `Your next income is expected around ${forecast.nextIncome.date}. Tell me what you're thinking of buying and the price, and I'll compare now with after payday.`,
        },
      ],
      ctx,
    };
  }

  if (isAffordQ(t)) {
    const price = parseAmount(t);
    const item = parseItem(t) ?? (/what about/i.test(t) ? ctx.lastImpact?.item ?? null : null);
    const finance = wantsFinance(t);
    if (!price) {
      return {
        items: [{ kind: 'agent', text: `How much does the ${item ?? 'item'} cost?` }],
        ctx: { ...ctx, pending: { kind: 'price', item, finance } },
      };
    }
    if (finance) {
      const term = parseTerm(t);
      if (!term.months) return askTerm(item, price, ctx);
      return impact({ price, item, finance: { months: term.months, apr: term.aprUnknown ? null : term.apr } }, ctx);
    }
    return impact({ price, item }, ctx);
  }

  if (/how much (money )?(do i have|have i got)|my balance|net worth|what have i got|total money/i.test(t)) {
    const snap = await snapshotForAgent();
    const part = (label: string, n: number | null) => (n === null ? `${label} isn't shared` : `${money(n, true)} ${label}`);
    const items: NewItem[] = [
      {
        kind: 'agent',
        text: `Across your ${snap.accountsUsed} connected accounts, you have ${money(snap.availableCurrent, true)} available in current accounts and ${part('in savings', snap.savings)}. ${
          snap.creditOwed === null && snap.loansOwed === null
            ? ''
            : `You owe ${snap.creditOwed === null ? '(cards not shared)' : `${money(snap.creditOwed, true)} on credit cards`} and ${snap.loansOwed === null ? '(loans not shared)' : `${money(snap.loansOwed, true)} on loans`} — that isn't counted as cash.`
        }`.trim(),
      },
      { kind: 'snapshot', snap },
      ...coverageNotices(snap),
    ];
    return { items, ctx: { ...ctx, pending: null } };
  }

  if (/bill|coming up|due|direct debit|standing order|commitment|outgoing/i.test(t)) {
    try {
      const list = await getCommitments();
      const total = list.reduce((s, b) => s + b.amount, 0);
      return {
        items: [
          { kind: 'agent', text: `You have ${list.length} bills and repayments due in the next 30 days, ${money(total)} in total. The biggest is ${list[0].label} (${money(list[0].amount)}) on ${list[0].date}.` },
          { kind: 'commitments', items: list },
        ],
        ctx: { ...ctx, pending: null },
      };
    } catch (e) {
      if (e instanceof ApiError && e.code === 'consent_required') {
        return { items: [{ kind: 'agent', text: "You haven't shared bills & direct debits, so I can't list what's coming up. You can turn it on in Settings › Data permissions." }], ctx };
      }
      throw e;
    }
  }

  if (/subscription|streamflix|tell me more about/i.test(t)) {
    const [insight] = await getInsights();
    return {
      items: [
        {
          kind: 'agent',
          text: insight
            ? `${insight.summary} It's based on ${insight.basedOn.join(' and ')} (${insight.evidence}, ${insight.dataPeriod}). Check which login each plan belongs to, then cancel the one you don't use from the StreamFlix app. BACI can't cancel it for you.`
            : "I didn't find any duplicate or unusual subscriptions in your connected accounts.",
        },
      ],
      ctx,
    };
  }

  return {
    items: [
      {
        kind: 'agent',
        text: 'On this device I can tell you how much you have, what bills are coming up, and whether you can afford something. Connect the ElevenLabs agent for open-ended questions.',
        quickReplies: welcome.kind === 'agent' ? welcome.quickReplies : undefined,
      },
    ],
    ctx,
  };
}

function askTerm(item: string | null, price: number, ctx: Ctx) {
  return {
    items: [{ kind: 'agent' as const, text: "How many months is the finance over, and what's the APR? If you're not sure of the APR, say so and I'll show it at 0% and flag that clearly." }],
    ctx: { ...ctx, pending: { kind: 'term' as const, item, price } },
  };
}

async function impact(input: Parameters<typeof calculatePurchaseImpact>[0], ctx: Ctx) {
  const result = await calculatePurchaseImpact(input);
  const snap = await snapshotForAgent();
  return {
    items: [{ kind: 'impact' as const, result, followUps: followUps(result) }, ...coverageNotices(snap)],
    ctx: { ...ctx, pending: null, lastImpact: result },
  };
}

export function followUps(r: PurchaseImpact): string[] {
  if (r.verdict === 'not_enough_data') return [];
  const lower = Math.max(10, Math.floor((r.price * 0.6) / 10) * 10);
  return ['What if I wait until payday?', `What about £${lower.toLocaleString('en-GB')}?`];
}

export function coverageNotices(s: Snapshot): NewItem[] {
  const out: NewItem[] = [];
  if (s.stale.length) out.push({ kind: 'notice', tone: 'warn', text: `${s.stale.map((x) => x.name).join(', ')} last synced ${s.stale[0].lastSync}, so figures may be out of date.` });
  if (s.excluded.length) out.push({ kind: 'notice', tone: 'danger', text: `${s.excluded.map((x) => x.name).join(', ')} ${s.excluded.length === 1 ? 'is' : 'are'} left out (${s.excluded[0].reason}) — never estimated.` });
  if (s.savings === null) out.push({ kind: 'notice', tone: 'info', text: "Savings aren't shared, so they aren't included." });
  return out;
}
