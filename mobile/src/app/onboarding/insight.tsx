import { View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Body, Button, Card, Display, ErrorBanner, H1, Loading, Muted, Row, Screen, Stack, StepBar } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { money } from '../../lib/format';
import { dismissInsight, getInsights, getSnapshot, patchOnboarding } from '../../services/api';
import { useMutation, useQuery } from '../../services/useQuery';
import { colors } from '../../theme';

// 07 First insight — /onboarding/insight
export default function FirstInsight() {
  const insights = useQuery(getInsights);
  const snap = useQuery(getSnapshot);
  const finish = useMutation(patchOnboarding);
  const dismiss = useMutation(dismissInsight);
  const insight = insights.data?.[0];

  const go = async (href: string | { pathname: string; params: Record<string, string> }) => {
    if ((await finish.run('done')).ok) router.replace(href as never);
  };

  return (
    <Screen
      footer={
        <>
          <ErrorBanner error={finish.error} />
          <Button label="Explore my finances" disabled={finish.busy} onPress={() => go('/home')} />
          {insight ? (
            <Button
              label="Ask BACI about this"
              variant="ghost"
              size="md"
              disabled={finish.busy}
              onPress={() => go({ pathname: '/chat', params: { q: `Tell me more about: ${insight.title}` } })}
            />
          ) : null}
        </>
      }
    >
      <View style={{ paddingTop: 56 }}>
        <StepBar step={5} />
      </View>
      <Stack gap={6}>
        <H1>Your first insight</H1>
        <Muted>Something BACI noticed across the accounts you connected.</Muted>
        {snap.data ? (
          <Row gap={6}>
            <Icon name="check" size={14} color={colors.muted} strokeWidth={2} />
            <Muted style={{ fontSize: 12.5 }}>Based on {snap.data.accountsUsed} connected accounts · updated just now</Muted>
          </Row>
        ) : null}
      </Stack>

      {insights.loading ? <Loading label="Analysing your accounts" /> : null}
      <ErrorBanner error={insights.error} onRetry={insights.reload} />

      {insight ? (
        <Card style={{ gap: 14, shadowColor: colors.ink, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 }}>
          <Badge tone="info" icon="sparkleSm" label="Insight" />
          <Stack gap={6}>
            <Display style={{ fontSize: 23, lineHeight: 28 }}>{insight.title}</Display>
            <Muted>{insight.summary}</Muted>
          </Stack>
          <View>
            <Display style={{ fontSize: 36, color: colors.primary }}>{money(insight.impact.amount)}</Display>
            <Muted style={{ fontSize: 13 }}>estimated saving {insight.impact.period}</Muted>
          </View>
          <View style={{ gap: 6 }}>
            <Detail label="Based on" value={insight.basedOn.join(', ')} />
            <Detail label="Period" value={insight.dataPeriod} />
            <Detail label="Evidence" value={insight.evidence} />
            <Detail label="Confidence" value={insight.confidence} />
            <Detail label="Freshness" value={insight.freshness} />
          </View>
          <Row gap={8}>
            <Button label={insight.action} size="md" onPress={() => go({ pathname: '/chat', params: { q: 'Review my subscriptions' } })} />
            <Button label={dismiss.busy ? 'Dismissing…' : 'Dismiss'} size="md" variant="secondary" disabled={dismiss.busy} onPress={() => dismiss.run(insight.id)} />
          </Row>
        </Card>
      ) : insights.data ? (
        <Card style={{ gap: 8, alignItems: 'center', paddingVertical: 28 }}>
          <Icon name="check" size={28} color={colors.successFg} />
          <Display style={{ fontSize: 20 }}>Nothing urgent to flag</Display>
          <Body style={{ textAlign: 'center', color: colors.muted }}>BACI didn't spot anything that needs your attention right now. We'll let you know when something comes up.</Body>
        </Card>
      ) : null}
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Muted style={{ width: 96, fontSize: 13.5 }}>{label}</Muted>
      <Body style={{ flex: 1, fontSize: 13.5 }}>{value}</Body>
    </View>
  );
}
