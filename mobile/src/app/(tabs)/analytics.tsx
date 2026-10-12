import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Button, Card, Divider, ErrorBanner, Eyebrow, Loading, Muted, PageHeader, Row, Screen, Segmented, Stack, Strong, Tone } from '../../components/ui';
import { Icon, IconName } from '../../components/Icon';
import { Donut, LegendItem, RangeGauge, ScoreRing, SpendBars } from '../../features/analytics/charts';
import { Analytics as Data, Health, isInternal, methodColour, methodLabel, methods, monthName, PayMethod, Payment, Rating, summarise, zoneOf } from '../../lib/analytics';
import { money } from '../../lib/format';
import { getAnalytics, getConnections } from '../../services/api';
import { isConsentError, useQuery } from '../../services/useQuery';
import { colors, fonts } from '../../theme';

type Range = '3M' | '6M' | '1Y';
const RANGE_MONTHS: Record<Range, number> = { '3M': 3, '6M': 6, '1Y': 12 };
const PAGE = 25;

const ratingTone: Record<Rating, { tone: Tone; icon: IconName; colour: string }> = {
  Excellent: { tone: 'success', icon: 'check', colour: colors.successFg },
  Good: { tone: 'success', icon: 'check', colour: colors.successFg },
  Fair: { tone: 'warn', icon: 'info', colour: colors.warnFg },
  'Needs attention': { tone: 'danger', icon: 'warn', colour: colors.dangerFg },
};

const zoneInfo = {
  stable: { tone: 'success' as Tone, icon: 'check' as IconName, label: 'Within your stable range' },
  caution: { tone: 'warn' as Tone, icon: 'info' as IconName, label: 'Above your stable range' },
  over: { tone: 'danger' as Tone, icon: 'warn' as IconName, label: 'Over your ceiling' },
};

const shortDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

// Analytics — /analytics: spending by month and payment method, ceiling and stable range, health score.
export default function AnalyticsScreen() {
  const q = useQuery(getAnalytics);
  const conns = useQuery(getConnections);
  const header = <PageHeader title="Analytics" subtitle="Your spending across all your accounts" />;

  if (isConsentError(q.error)) {
    return (
      <Screen edges={['top']}>
        {header}
        <Card style={{ gap: 12 }}>
          <Row gap={10}>
            <Icon name="lock" size={20} color={colors.inkSoft} />
            <Strong>Transaction history isn’t shared</Strong>
          </Row>
          <Muted>Analytics is built from your transactions. Turn on “Transaction history” in permissions to see your spending, payment methods and health score.</Muted>
          <Button label="Review permissions" size="md" onPress={() => router.push('/settings/permissions')} />
        </Card>
      </Screen>
    );
  }
  if (q.loading || conns.loading) {
    return (
      <Screen edges={['top']}>
        {header}
        <Loading label="Working out your spending" />
      </Screen>
    );
  }
  if (!q.data) {
    return (
      <Screen edges={['top']}>
        {header}
        <ErrorBanner error={q.error ?? new Error('Couldn’t load your analytics.')} onRetry={q.reload} />
      </Screen>
    );
  }
  if (!q.data.payments.length) {
    const connected = (conns.data ?? []).some((c) => c.status !== 'awaiting_authorisation');
    return (
      <Screen edges={['top']}>
        {header}
        <Card style={{ gap: 12 }}>
          <Strong>{connected ? 'No transactions yet' : 'No accounts connected yet'}</Strong>
          <Muted>{connected ? 'Your bank is still sending your history. Check back in a few minutes.' : 'Connect a bank to see your spending by month, how you pay, and your financial health score.'}</Muted>
          {connected ? null : <Button label="Connect an account" icon="plus" onPress={() => router.push({ pathname: '/accounts/add', params: { flow: 'accounts' } })} />}
        </Card>
      </Screen>
    );
  }
  return <Dashboard a={q.data} header={header} />;
}

function Dashboard({ a, header }: { a: Data; header: React.ReactNode }) {
  const [range, setRange] = useState<Range>('1Y');
  const [byMethod, setByMethod] = useState<'Total' | 'By method'>('Total');
  const [selected, setSelected] = useState<string | null>(null);
  const shown = a.months.slice(-RANGE_MONTHS[range]);
  const sel = shown.find((m) => m.key === selected) ?? null;
  const keys = sel ? [sel.key] : shown.map((m) => m.key);
  const sum = useMemo(() => summarise(a, keys), [a, keys.join()]);
  const period = sel ? monthName(sel.key) : shown.length > 1 ? `${shown[0].label} ${shown[0].year} – ${shown[shown.length - 1].label} ${shown[shown.length - 1].year}` : monthName(shown[0].key);
  const overMonths = a.ceiling ? shown.filter((m) => m.spend > (a.ceiling ?? Infinity)) : [];
  const current = a.months[a.months.length - 1];

  return (
    <Screen edges={['top']}>
      {header}

      {a.health ? <HealthCard h={a.health} /> : <NoScore a={a} />}

      {/* Spending by month */}
      <Card style={{ gap: 14 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Eyebrow>Spending</Eyebrow>
          <View style={{ width: 168 }}>
            <Segmented label="Time range" options={['3M', '6M', '1Y'] as Range[]} value={range} onChange={(r) => (setRange(r), setSelected(null))} />
          </View>
        </Row>
        <Stack gap={2}>
          <Text style={{ fontFamily: fonts.display, fontSize: 32, lineHeight: 37, color: colors.ink, letterSpacing: -0.8 }}>
            {money(sel ? sel.spend : sum.total)}
          </Text>
          <Muted style={{ fontSize: 13 }}>
            Spent · {period}
            {sel?.partial ? ' (so far)' : ''}
          </Muted>
          {a.avgMonthly !== null ? (
            <Muted style={{ fontSize: 13 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.semibold }}>{money(a.avgMonthly)}</Text> avg. per month
            </Muted>
          ) : null}
        </Stack>
        <Segmented label="Chart" options={['Total', 'By method'] as ('Total' | 'By method')[]} value={byMethod} onChange={setByMethod} />
        <SpendBars months={shown} ceiling={a.ceiling} stable={a.stable} byMethod={byMethod === 'By method'} selected={sel?.key ?? null} onSelect={setSelected} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {byMethod === 'By method' ? (
            methods.filter((m) => shown.some((s) => s.byMethod[m] > 0)).map((m) => <LegendItem key={m} colour={methodColour[m]} label={methodLabel[m]} />)
          ) : (
            <>
              <LegendItem colour={colors.primary} label="Spent" />
              {overMonths.length ? <LegendItem colour={colors.dangerFg} label="Over ceiling" /> : null}
            </>
          )}
          {a.ceiling ? <LegendItem colour={colors.dangerFg} label={`Ceiling ${money(a.ceiling, true)}`} dashed /> : null}
          {a.stable ? <LegendItem colour="rgba(99,227,160,0.35)" label="Stable range" band /> : null}
        </View>
        {sel ? <MonthDetail a={a} m={sel} onClear={() => setSelected(null)} /> : <Muted style={{ fontSize: 12.5 }}>Tap a month to see its details.</Muted>}
      </Card>

      {/* Headline figures */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="Avg per month" value={a.avgMonthly !== null ? money(a.avgMonthly, true) : '—'} note={a.completeMonths ? `${a.completeMonths} full month${a.completeMonths === 1 ? '' : 's'}` : 'Needs a full month'} />
        <Stat label="Per year" value={a.yearly ? money(a.yearly.amount, true) : '—'} note={a.yearly?.projected ? 'At this rate' : 'Last 12 months'} />
        <Stat label="Over ceiling" value={a.ceiling ? `${overMonths.length}` : '—'} note={a.ceiling ? `of ${shown.length} months` : 'Needs income'} />
      </View>

      <CeilingCard a={a} current={current} />

      {/* Payment methods */}
      <Card style={{ gap: 14 }}>
        <Stack gap={2}>
          <Eyebrow>How you pay</Eyebrow>
          <Muted style={{ fontSize: 13 }}>{period}</Muted>
        </Stack>
        <Row gap={16} style={{ alignItems: 'center' }}>
          <Donut parts={sum.byMethod}>
            <Text style={{ fontFamily: fonts.display, fontSize: 17, color: colors.ink }}>{money(sum.total, true)}</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 11.5, color: colors.muted }}>{sum.count} payments</Text>
          </Donut>
          <Stack gap={8} style={{ flex: 1 }}>
            {sum.byMethod.map((m) => (
              <Row key={m.key} gap={8}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: methodColour[m.key] }} />
                <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 13.5, color: colors.ink }}>{methodLabel[m.key]}</Text>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink }}>{Math.round(m.share * 100)}%</Text>
              </Row>
            ))}
          </Stack>
        </Row>
        <Divider />
        {sum.byMethod.map((m) => (
          <Row key={m.key} style={{ justifyContent: 'space-between' }}>
            <Muted style={{ fontSize: 13.5 }}>{methodLabel[m.key]}</Muted>
            <Strong style={{ fontSize: 13.5 }}>{money(m.amount)}</Strong>
          </Row>
        ))}
      </Card>

      <ShareList title="By category" period={period} rows={sum.byCategory} />
      <ShareList title="By account" period={period} rows={sum.byAccount} />

      <Transactions a={a} keys={keys} period={period} />
    </Screen>
  );
}

function HealthCard({ h }: { h: Health }) {
  const t = ratingTone[h.rating];
  return (
    <Card style={{ gap: 16 }}>
      <Eyebrow>Financial health</Eyebrow>
      <Row gap={18} style={{ alignItems: 'center' }}>
        <ScoreRing score={h.score} colour={t.colour} />
        <Stack gap={8} style={{ flex: 1 }}>
          <View style={{ alignSelf: 'flex-start' }}>
            <Badge tone={t.tone} icon={t.icon} label={h.rating} />
          </View>
          <Muted style={{ fontSize: 13 }}>
            {h.rating === 'Excellent'
              ? 'You’re in a strong position.'
              : h.rating === 'Good'
                ? 'You’re on solid ground, with room to improve.'
                : h.rating === 'Fair'
                  ? 'Some things need care. See what’s pulling your score down.'
                  : 'Your spending is putting you under strain.'}
          </Muted>
          {h.atCeiling !== null ? <Muted style={{ fontSize: 12.5 }}>At your spending ceiling it would be {h.atCeiling}.</Muted> : null}
        </Stack>
      </Row>
      <Stack gap={12}>
        {h.parts.map((p) => (
          <Stack key={p.key} gap={5}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Strong style={{ fontSize: 14 }}>{p.label}</Strong>
              <Muted style={{ fontSize: 13 }}>
                <Text style={{ color: colors.ink, fontFamily: fonts.semibold }}>{p.points}</Text>/{p.max}
              </Muted>
            </Row>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' }}>
              <View style={{ width: `${(p.points / p.max) * 100}%`, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
            </View>
            <Muted style={{ fontSize: 12.5 }}>{p.detail}</Muted>
          </Stack>
        ))}
        {h.missing.map((m) => (
          <Muted key={m} style={{ fontSize: 12.5 }}>
            Not scored yet: {m.charAt(0).toLowerCase() + m.slice(1)}.
          </Muted>
        ))}
      </Stack>
    </Card>
  );
}

function NoScore({ a }: { a: Data }) {
  return (
    <Card style={{ gap: 8 }}>
      <Eyebrow>Financial health</Eyebrow>
      <Strong>Not enough to score yet</Strong>
      <Muted style={{ fontSize: 13.5 }}>
        {a.monthlyIncome ? 'BACI needs at least a full month of transactions.' : 'BACI needs to see your income (share it in permissions, or connect the account your pay goes into) and a full month of transactions.'}
      </Muted>
    </Card>
  );
}

function MonthDetail({ a, m, onClear }: { a: Data; m: Data['months'][number]; onClear: () => void }) {
  const zone = zoneOf(m.spend, a);
  const z = zone ? zoneInfo[zone] : null;
  return (
    <View style={{ borderRadius: 12, backgroundColor: colors.surfaceRaised, padding: 12, gap: 8 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Strong>
          {monthName(m.key)}
          {m.partial ? ' (so far)' : ''}
        </Strong>
        <Pressable accessibilityRole="button" accessibilityLabel="Show all months" onPress={onClear} hitSlop={8}>
          <Icon name="close" size={18} color={colors.muted} />
        </Pressable>
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <Muted style={{ fontSize: 13.5 }}>Spent</Muted>
        <Strong style={{ fontSize: 13.5 }}>{money(m.spend)}</Strong>
      </Row>
      {m.income ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted style={{ fontSize: 13.5 }}>Income</Muted>
          <Strong style={{ fontSize: 13.5 }}>{money(m.income)}</Strong>
        </Row>
      ) : null}
      {z && a.ceiling ? (
        <Row gap={8}>
          <Badge tone={z.tone} icon={z.icon} label={z.label} />
          <Muted style={{ fontSize: 12.5, flex: 1 }}>{zone === 'over' ? `by ${money(m.spend - a.ceiling)}` : `${money(a.ceiling - m.spend)} under the ceiling`}</Muted>
        </Row>
      ) : null}
    </View>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card style={{ flex: 1, padding: 12, gap: 2 }}>
      <Muted style={{ fontSize: 12 }}>{label}</Muted>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.display, fontSize: 19, lineHeight: 24, color: colors.ink }}>
        {value}
      </Text>
      <Muted style={{ fontSize: 11.5 }}>{note}</Muted>
    </Card>
  );
}

function CeilingCard({ a, current }: { a: Data; current: Data['months'][number] }) {
  if (!a.ceiling || !a.stable || !a.monthlyIncome) {
    return (
      <Card style={{ gap: 8 }}>
        <Eyebrow>Spending ceiling</Eyebrow>
        <Strong>Can’t work this out yet</Strong>
        <Muted style={{ fontSize: 13.5 }}>Your ceiling and stable range come from your income. Share income in permissions, or connect the account your pay goes into.</Muted>
      </Card>
    );
  }
  const zone = zoneOf(current.spend, a)!;
  const z = zoneInfo[zone];
  const markers = [{ value: current.spend, label: `${current.label} so far ${money(current.spend, true)}` }];
  if (a.avgMonthly !== null) markers.push({ value: a.avgMonthly, label: `Your average ${money(a.avgMonthly, true)}` });
  return (
    <Card style={{ gap: 14 }}>
      <Eyebrow>Spending ceiling</Eyebrow>
      <Stack gap={4}>
        <Row gap={8} style={{ alignItems: 'baseline' }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 33, color: colors.ink, letterSpacing: -0.6 }}>{money(a.ceiling, true)}</Text>
          <Muted>a month</Muted>
        </Row>
        <Muted style={{ fontSize: 13.5 }}>
          Spend more than this in a month and your financial health score falls{a.health?.atCeiling !== null && a.health ? ` below ${a.health.atCeiling}` : ''}. It’s 90% of your {money(a.monthlyIncome, true)} monthly income.
        </Muted>
      </Stack>
      <View style={{ borderRadius: 12, backgroundColor: colors.successBg, padding: 12, gap: 4 }}>
        <Row gap={8}>
          <Icon name="shield" size={18} color={colors.successFg} />
          <Strong style={{ fontSize: 14 }}>Stay financially stable</Strong>
        </Row>
        <Text style={{ fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.ink }}>
          {money(a.stable.low, true)} – {money(a.stable.high, true)} a month
        </Text>
        <Muted style={{ fontSize: 12.5 }}>
          {money(a.stable.low, true)} covers your regular bills and repayments. Up to {money(a.stable.high, true)} still leaves 20% of your income to save.
        </Muted>
      </View>
      <RangeGauge stable={a.stable} ceiling={a.ceiling} markers={markers} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <LegendItem colour={colors.successFg} label="Stable" />
        <LegendItem colour={colors.warnFg} label="Caution" />
        <LegendItem colour={colors.dangerFg} label="Over ceiling" />
      </View>
      <Row gap={8}>
        <Badge tone={z.tone} icon={z.icon} label={`${current.label}: ${z.label.charAt(0).toLowerCase()}${z.label.slice(1)}`} />
      </Row>
    </Card>
  );
}

function ShareList({ title, period, rows }: { title: string; period: string; rows: { key: string; amount: number; share: number }[] }) {
  const [all, setAll] = useState(false);
  const list = all ? rows : rows.slice(0, 6);
  return (
    <Card style={{ gap: 12 }}>
      <Stack gap={2}>
        <Eyebrow>{title}</Eyebrow>
        <Muted style={{ fontSize: 13 }}>{period}</Muted>
      </Stack>
      {list.map((r) => (
        <Stack key={r.key} gap={5}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.ink }} numberOfLines={1}>
              {r.key}
            </Text>
            <Muted style={{ fontSize: 13 }}>{Math.round(r.share * 100)}%</Muted>
            <Strong style={{ fontSize: 14, minWidth: 84, textAlign: 'right' }}>{money(r.amount)}</Strong>
          </Row>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.track, overflow: 'hidden' }}>
            <View style={{ width: `${r.share * 100}%`, height: 4, borderRadius: 2, backgroundColor: colors.primary }} />
          </View>
        </Stack>
      ))}
      {rows.length > 6 ? <Button label={all ? 'Show fewer' : `Show all ${rows.length}`} variant="ghost" size="md" onPress={() => setAll(!all)} /> : null}
    </Card>
  );
}

function Transactions({ a, keys, period }: { a: Data; keys: string[]; period: string }) {
  const [filter, setFilter] = useState<PayMethod | 'all'>('all');
  const [count, setCount] = useState(PAGE);
  const inPeriod = a.payments.filter((p) => keys.includes(p.month));
  const present = methods.filter((m) => inPeriod.some((p) => p.method === m && p.amount > 0));
  const list = filter === 'all' ? inPeriod : inPeriod.filter((p) => p.method === filter && p.amount > 0);
  return (
    <Card style={{ gap: 12 }}>
      <Stack gap={2}>
        <Eyebrow>All transactions</Eyebrow>
        <Muted style={{ fontSize: 13 }}>
          {list.length} in {period}
        </Muted>
      </Stack>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {(['all', ...present] as (PayMethod | 'all')[]).map((m) => {
          const on = filter === m;
          return (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => (setFilter(m), setCount(PAGE))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: on ? colors.cta : colors.chipLine, backgroundColor: on ? colors.cta : 'transparent' }}
            >
              {m !== 'all' ? <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: methodColour[m] }} /> : null}
              <Text style={{ fontFamily: on ? fonts.semibold : fonts.body, fontSize: 13.5, color: on ? colors.onCta : colors.ink }}>{m === 'all' ? 'All' : methodLabel[m]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View>
        {list.slice(0, count).map((p, i) => (
          <TxnRow key={p.id} p={p} last={i === Math.min(count, list.length) - 1} />
        ))}
      </View>
      {list.length > count ? <Button label={`Show more (${list.length - count} left)`} variant="secondary" size="md" onPress={() => setCount(count + PAGE)} /> : null}
    </Card>
  );
}

function TxnRow({ p, last }: { p: Payment; last: boolean }) {
  const incoming = p.amount < 0;
  const internal = isInternal(p);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.hairline }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: incoming || internal ? colors.muted : methodColour[p.method] }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>
          {p.merchant ?? p.name}
        </Text>
        <Text numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted }}>
          {shortDate(p.date)} · {internal ? 'Between your accounts' : incoming ? (p.category === 'INCOME' ? 'Income' : 'Money in') : `${methodLabel[p.method]} · ${p.categoryName}`} · {p.accountName}
        </Text>
      </View>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: internal ? colors.muted : incoming ? colors.successFg : colors.ink }}>
        {incoming ? `+${money(-p.amount)}` : money(p.amount)}
      </Text>
    </View>
  );
}
