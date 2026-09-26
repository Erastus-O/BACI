import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Badge, Banner, BankMark, Button, Card, ErrorBanner, H1, Loading, Muted, Row, Screen, Stack, StepBar, Strong } from '../../../components/ui';
import { kindLabel } from '../../../data/mock';
import { exitPath, pickerPath, useFlow } from '../../../features/flow';
import { money } from '../../../lib/format';
import { getSummary } from '../../../services/api';
import { useQuery } from '../../../services/useQuery';
import { colors, fonts } from '../../../theme';

// 05b Bank connected / E2 Partly synced — /connect/:id/done
export default function ConnectDone() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const flow = useFlow();
  const summary = useQuery(() => getSummary(id), [id]);
  const s = summary.data;

  if (!s) {
    return (
      <Screen>
        <View style={{ paddingTop: 56 }} />
        {summary.loading ? <Loading label="Loading your summary" /> : null}
        <ErrorBanner error={summary.error} onRetry={summary.reload} />
      </Screen>
    );
  }

  const bank = s.connection.institution;
  const failed = s.accounts.filter((a) => a.syncFailed);
  const ok = s.accounts.length - failed.length;

  const footer = s.partial ? (
    <>
      <Button label="Retry now" variant="secondary" icon="refresh" onPress={() => router.replace({ pathname: '/connect/[id]/sync', params: { id, flow } })} />
      <Button label={`Continue with ${ok} account${ok === 1 ? '' : 's'}`} onPress={() => router.replace(exitPath(flow))} />
    </>
  ) : (
    <>
      <Button label="Connect another bank" variant="secondary" icon="plus" onPress={() => router.replace({ pathname: pickerPath(flow), params: { flow } })} />
      <Button label="Done" onPress={() => router.replace(exitPath(flow))} />
    </>
  );

  return (
    <Screen footer={footer}>
      <View style={{ paddingTop: 56 }}>{flow === 'onboarding' ? <StepBar step={4} /> : null}</View>
      {!s.partial ? (
        <Row>
          <BankMark initial={bank.initial} colour={bank.brandColour} size={48} />
          <Badge tone="success" icon="check" label="Up to date" />
        </Row>
      ) : null}
      <Stack gap={6}>
        <H1>{s.partial ? `${bank.name} is partly connected` : `${bank.name} is connected`}</H1>
        <Muted>
          {s.partial
            ? `${ok} account${ok === 1 ? '' : 's'} synced. We couldn't fetch the other yet — we'll keep trying.`
            : `BACI is now using ${s.accounts.length} account${s.accounts.length === 1 ? '' : 's'} from ${bank.name}.`}
        </Muted>
      </Stack>
      <Card style={{ paddingVertical: 4 }}>
        {s.accounts.map((a, i) => {
          const debt = a.kind === 'loan' || a.kind === 'credit';
          return (
            <Row key={a.id} style={{ justifyContent: 'space-between', gap: 10, paddingVertical: 12, borderBottomWidth: i === s.accounts.length - 1 ? 0 : 1, borderBottomColor: colors.hairline }}>
              <View style={{ flex: 1 }}>
                <Strong>
                  {a.name} <Muted style={{ fontSize: 13 }}>••{a.mask}</Muted>
                </Strong>
                <Muted style={{ fontSize: 13 }}>
                  {a.syncFailed || a.balance == null ? 'Balance unavailable' : `${kindLabel[a.kind]}${debt ? ' · not counted as cash' : ''}`}
                </Muted>
              </View>
              {s.partial ? (
                a.syncFailed ? <Badge tone="danger" icon="warn" label="Sync failed" /> : <Badge tone="success" icon="check" label="Up to date" />
              ) : (
                <Strong style={{ fontFamily: fonts.bold }}>{a.balance == null ? '—' : `${money(a.balance)}${debt ? ' owed' : ''}`}</Strong>
              )}
            </Row>
          );
        })}
      </Card>
      {s.partial ? (
        <Banner tone="warn">
          {`Until it syncs, answers won't include your ${failed.map((a) => a.name.toLowerCase()).join(', ')}. We'll say so whenever it matters — for example, in “Can I afford this?”.`}
        </Banner>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Stat value={String(s.transactionCount)} label="transactions" />
            <Stat value={String(s.regularPayments)} label="regular payments" />
            <Stat value={`${Math.round(s.historyDays / 30)} mo`} label="of history" />
          </View>
          {s.suggestions.length ? (
            <Banner tone="info">{`We noticed money going to ${joinOr(s.suggestions)} you haven't connected. Adding ${s.suggestions.length === 1 ? 'it' : 'them'} gives you more accurate answers.`}</Banner>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const joinOr = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card style={{ flex: 1, padding: 10, borderRadius: 10 }}>
      <Strong style={{ fontFamily: fonts.bold, fontSize: 18 }}>{value}</Strong>
      <Muted style={{ fontSize: 12 }}>{label}</Muted>
    </Card>
  );
}
