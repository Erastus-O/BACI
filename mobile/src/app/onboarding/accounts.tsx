import { View } from 'react-native';
import { router } from 'expo-router';
import { Banner, BankMark, Button, Card, ErrorBanner, Eyebrow, H1, Loading, Muted, Row, Screen, Stack, StepBar, Strong } from '../../components/ui';
import { ConnectionStatusBadge } from '../../features/ConnectionStatusBadge';
import { getConnections, patchOnboarding } from '../../services/api';
import { useMutation, useQuery } from '../../services/useQuery';
import { colors } from '../../theme';

// 06 Add another account — /onboarding/accounts
export default function AddAnother() {
  const conns = useQuery(getConnections);
  const next = useMutation(patchOnboarding);
  const list = (conns.data ?? []).filter((c) => c.status !== 'awaiting_authorisation');
  // Accounts analysis can use now; a failed sync is left out until it recovers.
  const used = list.flatMap((c) => c.accounts.filter((a) => a.selected && !a.syncFailed));
  const n = used.length;
  const kinds = new Set(used.map((a) => a.kind));
  const missing = [!kinds.has('savings') && 'savings', !kinds.has('credit') && 'credit cards'].filter(Boolean) as string[];
  const addAnother = () => router.push({ pathname: '/onboarding/connect', params: { flow: 'onboarding' } });

  return (
    <Screen
      footer={
        <>
          <ErrorBanner error={next.error} />
          {n === 0 ? (
            <Button label="Connect an account" icon="plus" onPress={addAnother} />
          ) : (
            <>
              <Button label="Add another account" variant="secondary" icon="plus" onPress={addAnother} />
              <Button
                label={next.busy ? 'Saving…' : `Continue with ${n} account${n === 1 ? '' : 's'}`}
                disabled={next.busy}
                onPress={async () => {
                  if ((await next.run('first_insight')).ok) router.replace('/onboarding/insight');
                }}
              />
            </>
          )}
        </>
      }
    >
      <View style={{ paddingTop: 56 }}>
        <StepBar step={4} />
      </View>
      <Stack gap={6}>
        <H1>{n === 0 ? 'Connect an account' : 'Add another account?'}</H1>
        <Muted>BACI gives better answers when it can see all of your money — current accounts, savings, cards and loans, across different banks.</Muted>
      </Stack>
      {conns.loading ? <Loading label="Loading your connections" /> : null}
      <ErrorBanner error={conns.error} onRetry={conns.reload} />
      {list.length ? (
        <Card style={{ gap: 4 }}>
          <Eyebrow style={{ fontSize: 13, paddingBottom: 6 }}>Connected so far</Eyebrow>
          {list.map((c) => (
            <Row key={c.id} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.hairline }}>
              <BankMark initial={c.institution.initial} colour={c.institution.brandColour} size={36} />
              <View style={{ flex: 1 }}>
                <Strong>{c.institution.name}</Strong>
                <Muted style={{ fontSize: 13 }}>{c.accounts.filter((a) => a.selected).map((a) => a.name).join(' · ')}</Muted>
              </View>
              <ConnectionStatusBadge status={c.status} />
            </Row>
          ))}
        </Card>
      ) : null}
      {n > 0 ? (
        <Banner tone="info">
          {`Your analysis will be based on ${n} account${n === 1 ? '' : 's'}.${missing.length ? ` No ${missing.join(' or ')} connected yet — answers may be incomplete until you add them.` : ''}`}
        </Banner>
      ) : null}
    </Screen>
  );
}
