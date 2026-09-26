import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Banner, Body, Button, Card, Display, ErrorBanner, Eyebrow, H1, Loading, Muted, Row, Screen, Stack, Strong } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useAgentChat } from '../../agent/AgentChat';
import { money } from '../../lib/format';
import { ApiError, dismissInsight, getCommitments, getConnections, getGoals, getInsights, getSnapshot } from '../../services/api';
import { isConsentError, useMutation, useQuery } from '../../services/useQuery';
import { colors, fonts } from '../../theme';

// 08 Home — /home (and S4 Access revoked)
export default function Home() {
  const snap = useQuery(getSnapshot);
  const conns = useQuery(getConnections);
  const insights = useQuery(getInsights);
  const bills = useQuery(getCommitments);
  const goals = useQuery(getGoals);
  const dismiss = useMutation(dismissInsight);
  const { startCall, mode } = useAgentChat();

  const header = (
    <Stack gap={2} style={{ paddingTop: 8 }}>
      <Muted>Good to see you</Muted>
      <H1>Your money, together</H1>
    </Stack>
  );

  if (isConsentError(snap.error)) return <Revoked header={header} />;
  if (snap.loading || conns.loading) {
    return (
      <Screen edges={['top']}>
        {header}
        <Loading label="Checking your accounts" />
      </Screen>
    );
  }
  if (!snap.data) {
    return (
      <Screen edges={['top']}>
        {header}
        <ErrorBanner error={snap.error ?? new Error('Couldn’t load your finances.')} onRetry={snap.reload} />
      </Screen>
    );
  }

  const s = snap.data;
  const connections = (conns.data ?? []).filter((c) => c.status !== 'awaiting_authorisation');

  if (connections.length === 0) {
    return (
      <Screen edges={['top']}>
        {header}
        <Card style={{ gap: 12 }}>
          <Strong>No accounts connected yet</Strong>
          <Muted>Connect a bank to see balances, upcoming bills and ask “Can I afford this?”.</Muted>
          <Button label="Connect an account" icon="plus" onPress={() => router.push({ pathname: '/accounts/add', params: { flow: 'accounts' } })} />
        </Card>
      </Screen>
    );
  }

  const billsForbidden = bills.error instanceof ApiError && bills.error.code === 'consent_required';
  const insight = insights.data?.[0];
  const goal = goals.data?.[0];

  return (
    <Screen edges={['top']}>
      {header}

      <Muted style={{ fontSize: 12.5 }}>
        Based on {s.accountsUsed} connected account{s.accountsUsed === 1 ? '' : 's'} · {s.accountsUpToDate} up to date
      </Muted>
      {s.excluded.length ? (
        <Banner tone="danger">
          <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.dangerInk }}>
            {`${s.excluded.map((e) => `${e.name} (${e.reason})`).join(', ')} ${s.excluded.length === 1 ? 'is' : 'are'} left out of these figures — never estimated. `}
            <Text accessibilityRole="link" onPress={() => router.navigate('/accounts')} style={{ fontFamily: fonts.bold, textDecorationLine: 'underline' }}>
              Fix in Accounts
            </Text>
          </Text>
        </Banner>
      ) : null}
      {s.stale.length ? (
        <Banner tone="warn" icon="clock">
          <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.warnInk }}>
            {`${s.stale.map((x) => x.name).join(', ')} last synced ${s.stale[0].lastSync}. Figures may be out of date. `}
            <Text accessibilityRole="link" onPress={() => router.navigate('/accounts')} style={{ fontFamily: fonts.bold, textDecorationLine: 'underline' }}>
              Refresh
            </Text>
          </Text>
        </Banner>
      ) : null}

      <Card style={{ gap: 12 }}>
        <Eyebrow>Available in current accounts</Eyebrow>
        <Display style={{ fontSize: 40, lineHeight: 44 }}>{money(s.availableCurrent)}</Display>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Tile label="Savings & ISAs" value={s.savings} connected={s.connectedKinds.includes('savings')} />
          <Tile label="Credit cards owed" value={s.creditOwed} connected={s.connectedKinds.includes('credit')} />
          <Tile label="Loans owed" value={s.loansOwed} connected={s.connectedKinds.includes('loan')} />
          <Tile label="Bills next 30 days" value={s.billsNext30} />
        </View>
        <Muted style={{ fontSize: 12 }}>Debts are shown separately and never counted as cash.</Muted>
      </Card>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Can I afford this? Checks every account, your bills and your goal."
        onPress={() => router.navigate('/chat')}
        style={({ pressed }) => [{ backgroundColor: pressed ? colors.hairline : colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 12, alignItems: 'center' }]}
      >
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="sparkleSm" size={16} color="#FFFFFF" strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Strong style={{ fontFamily: fonts.bold }}>Can I afford this?</Strong>
          <Muted style={{ fontSize: 13 }}>Checks every account, your bills and your goal.</Muted>
        </View>
        <Icon name="chevron" size={18} color={colors.muted} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mode === 'voice' ? 'Voice call with BACI in progress' : 'Talk to BACI'}
        onPress={() => {
          router.navigate('/chat');
          if (mode !== 'voice') startCall();
        }}
        style={({ pressed }) => [{ backgroundColor: pressed ? colors.primaryPressed : colors.primary, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 12, alignItems: 'center' }]}
      >
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="mic" size={18} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: '#FFFFFF' }}>{mode === 'voice' ? 'On a call with BACI' : 'Talk to BACI'}</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: '#D6E6E0' }}>Ask out loud about bills, spending or a purchase.</Text>
        </View>
        <Icon name="chevron" size={18} color="#FFFFFF" />
      </Pressable>

      {insight ? (
        <Card style={{ gap: 8 }}>
          <Badge tone="info" icon="sparkleSm" label="Insight" />
          <Display style={{ fontSize: 19, lineHeight: 24 }}>{insight.title}</Display>
          <Muted style={{ fontSize: 14 }}>{insight.summary}</Muted>
          <Muted style={{ fontSize: 12.5 }}>
            {insight.confidence} confidence · {insight.evidence} · {insight.freshness}
          </Muted>
          <Row gap={8}>
            <Button label="Ask BACI about this" size="md" onPress={() => router.navigate({ pathname: '/chat', params: { q: `Tell me more about: ${insight.title}` } })} />
            <Button label="Dismiss" size="md" variant="secondary" disabled={dismiss.busy} onPress={() => dismiss.run(insight.id)} />
          </Row>
        </Card>
      ) : null}

      <Card style={{ paddingVertical: 14, gap: 6 }}>
        <Eyebrow>Coming up</Eyebrow>
        {billsForbidden ? (
          <Muted style={{ fontSize: 14 }}>Not shared — turn on “Bills & direct debits” in Settings › Data permissions to see what's due.</Muted>
        ) : (
          (bills.data ?? []).slice(0, 4).map((b) => (
            <Row key={b.label} style={{ justifyContent: 'space-between' }}>
              <Row gap={0}>
                <Muted style={{ fontSize: 12.5, width: 48 }}>{b.date}</Muted>
                <Body style={{ fontSize: 14.5 }}>{b.label}</Body>
              </Row>
              <Strong style={{ fontSize: 14.5 }}>{money(b.amount)}</Strong>
            </Row>
          ))
        )}
      </Card>

      {goal ? (
        <Card style={{ gap: 8 }}>
          <Eyebrow>Goal · {goal.name}</Eyebrow>
          <Row style={{ justifyContent: 'space-between' }}>
            <Strong>{money(goal.saved, true)} saved</Strong>
            <Muted style={{ fontSize: 14 }}>of {money(goal.target, true)}</Muted>
          </Row>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={`${goal.name}: ${Math.round((goal.saved / goal.target) * 100)}% of target`}
            style={{ height: 8, borderRadius: 999, backgroundColor: colors.track, overflow: 'hidden' }}
          >
            <View style={{ height: '100%', width: `${Math.min(100, (goal.saved / goal.target) * 100)}%`, backgroundColor: colors.primary }} />
          </View>
          <Muted style={{ fontSize: 12.5 }}>About {money(goal.monthlyContribution, true)} a month going towards it.</Muted>
        </Card>
      ) : null}

      <Card style={{ paddingVertical: 14, gap: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Eyebrow>Accounts</Eyebrow>
          <Pressable accessibilityRole="link" onPress={() => router.navigate('/accounts')} style={{ minHeight: 32, justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.primary }}>Manage</Text>
          </Pressable>
        </Row>
        {connections.map((c) => (
          <Row key={c.id} style={{ justifyContent: 'space-between' }}>
            <Body style={{ fontSize: 14.5 }}>{c.institution.name}</Body>
            <Muted style={{ fontSize: 13 }}>
              {c.accounts.filter((a) => a.selected).length} account{c.accounts.filter((a) => a.selected).length === 1 ? '' : 's'} · {statusText[c.status]}
            </Muted>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}

const statusText = { active: 'up to date', stale: 'out of date', reauth_required: 'reconnect needed', error: 'sync failed', awaiting_authorisation: 'not finished' } as const;

function Tile({ label, value, connected = true }: { label: string; value: number | null; connected?: boolean }) {
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10 }}>
      <Muted style={{ fontSize: 12.5 }}>{label}</Muted>
      {value === null || !connected ? (
        <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.muted, paddingTop: 2 }}>{value === null ? 'Not shared' : 'None connected'}</Text>
      ) : (
        <Strong style={{ fontFamily: fonts.bold, fontSize: 18 }}>{money(value, true)}</Strong>
      )}
    </View>
  );
}

// S4 Access revoked
function Revoked({ header }: { header: React.ReactNode }) {
  return (
    <Screen edges={['top']}>
      {header}
      <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 32, paddingHorizontal: 20 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.hairline, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="lock" size={30} color={colors.inkSoft} />
        </View>
        <Display accessibilityRole="header" style={{ fontSize: 22, lineHeight: 27, textAlign: 'center' }}>
          BACI isn't allowed to analyse your data
        </Display>
        <Muted style={{ textAlign: 'center' }}>
          You revoked access, so there's nothing BACI can show here and Ask BACI won't use your accounts. Your bank connections stay in place until you disconnect them.
        </Muted>
        <Button label="Review permissions" size="md" onPress={() => router.push('/settings/permissions')} />
        <Button label="Manage connected accounts" variant="ghost" size="md" onPress={() => router.navigate('/accounts')} />
      </Card>
    </Screen>
  );
}
