import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Badge, BackButton, BankMark, Body, Button, Card, ErrorBanner, H1, Loading, Muted, Row, Screen, Stack } from '../../../components/ui';
import { DisconnectDialog } from '../../../features/DisconnectDialog';
import { getConnection, peek, reauthorise } from '../../../services/api';
import { useMutation, useQuery } from '../../../services/useQuery';

// E3 Reconfirm access — /accounts/reconnect/:connectionId
export default function Reconnect() {
  const { connectionId } = useLocalSearchParams<{ connectionId: string }>();
  const conn = useQuery(() => getConnection(connectionId), [connectionId]);
  const start = useMutation(reauthorise);
  const [confirm, setConfirm] = useState(false);

  if (!peek.hasConsent()) return <Redirect href="/home" />;
  const c = conn.data;
  if (!c) {
    return (
      <Screen>
        <BackButton label="Back to accounts" onPress={() => router.replace('/accounts')} />
        {conn.loading ? <Loading label="Loading connection" /> : <ErrorBanner error={conn.error} onRetry={conn.reload} />}
      </Screen>
    );
  }
  const bank = c.institution;
  const affected = c.accounts.filter((a) => a.selected);

  return (
    <Screen
      footer={
        <>
          <ErrorBanner error={start.error} />
          <Button
            label={start.busy ? 'Opening…' : `Continue to ${bank.name}`}
            disabled={start.busy}
            onPress={async () => {
              if ((await start.run(c.id)).ok) router.push({ pathname: '/connect/authorise/[connectionId]', params: { connectionId: c.id, flow: 'accounts' } });
            }}
          />
          <Button label="Not now" variant="ghost" size="md" onPress={() => router.replace('/accounts')} />
          <Button label={`Disconnect ${bank.name} instead`} variant="danger" size="md" onPress={() => setConfirm(true)} />
        </>
      }
    >
      <BackButton label="Back to accounts" onPress={() => router.replace('/accounts')} />
      <Row>
        <BankMark initial={bank.initial} colour={bank.brandColour} size={48} />
        <Badge tone="danger" icon="warn" label="Reconnect needed" />
      </Row>
      <Stack gap={6}>
        <H1>Reconfirm access to {bank.name}</H1>
        <Muted>UK banks ask you to reconfirm every 90 days. It takes about a minute, and your history and settings stay as they are.</Muted>
      </Stack>
      <Card style={{ gap: 8, paddingVertical: 14 }}>
        <Detail label="Affected account" value={affected.map((a) => `${a.name} ••${a.mask}`).join(', ') || '—'} />
        <Detail label="Last synced" value={c.lastSuccessfulSync ?? '—'} />
        <Detail label="Until you reconnect" value="Its balance is left out of answers — we won't show an estimate." />
      </Card>
      <DisconnectDialog conn={confirm ? c : null} onClose={() => setConfirm(false)} onDone={() => router.replace('/accounts')} />
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Muted style={{ width: 124, fontSize: 14 }}>{label}</Muted>
      <Body style={{ flex: 1, fontSize: 14 }}>{value}</Body>
    </View>
  );
}
