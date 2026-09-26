import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, Button, Card, Display, ErrorBanner, H1, Loading, Muted, Row, Screen, Strong, Toggle } from '../../components/ui';
import { ConnectionStatusBadge } from '../../features/ConnectionStatusBadge';
import { DisconnectDialog } from '../../features/DisconnectDialog';
import { sandboxEnabled } from '../../features/sandbox';
import { kindLabel } from '../../data/mock';
import { money } from '../../lib/format';
import { ConnectionView, getConnections, patchAccount, simulate, sync } from '../../services/api';
import { useMutation, useQuery } from '../../services/useQuery';
import { colors, fonts } from '../../theme';

// 09 Accounts — /accounts
export default function Accounts() {
  const conns = useQuery(getConnections);
  const [disconnecting, setDisconnecting] = useState<ConnectionView | null>(null);

  return (
    <Screen edges={['top']}>
      <Row style={{ justifyContent: 'space-between', paddingTop: 8 }}>
        <H1>Accounts</H1>
        <Button label="Add account" icon="plus" size="md" onPress={() => router.push({ pathname: '/accounts/add', params: { flow: 'accounts' } })} />
      </Row>
      {conns.loading ? <Loading label="Loading your accounts" /> : null}
      <ErrorBanner error={conns.error} onRetry={conns.reload} />
      {conns.data && conns.data.length === 0 ? (
        <Card>
          <Muted>No accounts connected. Add one to get started.</Muted>
        </Card>
      ) : null}
      {(conns.data ?? []).map((c) => (
        <ConnectionCard key={c.id} conn={c} onDisconnect={() => setDisconnecting(c)} />
      ))}
      <DisconnectDialog conn={disconnecting} onClose={() => setDisconnecting(null)} />
    </Screen>
  );
}

function ConnectionCard({ conn, onDisconnect }: { conn: ConnectionView; onDisconnect: () => void }) {
  const refresh = useMutation(sync);
  const toggle = useMutation(patchAccount);
  const selected = conn.accounts.filter((a) => a.selected);
  const failed = conn.accounts.filter((a) => a.syncFailed);
  const status = conn.status;

  const problem =
    status === 'reauth_required'
      ? { tone: 'danger' as const, text: `Your bank needs you to confirm access again. ${names(selected)} ${selected.length === 1 ? 'is' : 'are'} left out of answers until you do. Last good sync ${conn.lastSuccessfulSync}.` }
      : status === 'error'
        ? { tone: 'danger' as const, text: `${failed.length ? names(failed) : 'Some accounts'} couldn't sync, so ${failed.length === 1 ? "it's" : "they're"} left out of answers. Last good sync ${conn.lastSuccessfulSync ?? 'never'}.` }
        : status === 'stale'
          ? { tone: 'warn' as const, text: `Not synced since ${conn.lastSuccessfulSync}. BACI uses the last known balances and says so in answers.` }
          : status === 'awaiting_authorisation'
            ? { tone: 'info' as const, text: `You started connecting ${conn.institution.name} but didn't finish approving access.` }
            : null;

  return (
    <Card style={{ paddingVertical: 14, gap: 10 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Display style={{ fontSize: 18 }}>{conn.institution.name}</Display>
          <Muted style={{ fontSize: 12.5 }}>Last successful sync {conn.lastSuccessfulSync ?? '—'}</Muted>
        </View>
        <ConnectionStatusBadge status={status} />
      </Row>
      {problem ? <Banner tone={problem.tone}>{problem.text}</Banner> : null}
      {conn.accounts.map((a, i) => {
        const unavailable = status === 'reauth_required' || a.syncFailed || a.balance == null;
        const debt = a.kind === 'loan' || a.kind === 'credit';
        const detail = !a.selected
          ? 'Not used by BACI'
          : unavailable
            ? `${kindLabel[a.kind]} · balance unavailable`
            : `${money(a.balance ?? 0)}${debt ? ' owed' : ''}${status === 'stale' ? ' (last known)' : ''}`;
        return (
          <Row key={a.id} style={{ justifyContent: 'space-between', borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.hairline, paddingTop: i === 0 ? 0 : 10 }}>
            <View style={{ flex: 1 }}>
              <Strong>
                {a.name} <Muted style={{ fontSize: 13 }}>••{a.mask}</Muted>
              </Strong>
              <Muted style={{ fontSize: 13 }}>{detail}</Muted>
            </View>
            <Toggle label={`Use ${a.name} in BACI`} value={a.selected} onChange={(v) => toggle.run(a.id, v)} />
          </Row>
        );
      })}
      <ErrorBanner error={refresh.error} />
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {status === 'reauth_required' ? (
          <Button label="Re-authenticate" size="md" onPress={() => router.push({ pathname: '/accounts/reconnect/[connectionId]', params: { connectionId: conn.id } })} />
        ) : status === 'awaiting_authorisation' ? (
          <Button label="Continue authorisation" size="md" onPress={() => router.push({ pathname: '/connect/authorise/[connectionId]', params: { connectionId: conn.id, flow: 'accounts' } })} />
        ) : (
          <Button label={refresh.busy ? 'Refreshing…' : status === 'error' ? 'Retry' : 'Refresh'} size="md" variant="secondary" icon="refresh" disabled={refresh.busy} onPress={() => refresh.run(conn.id)} />
        )}
        <Button label="Disconnect" size="md" variant="danger" onPress={onDisconnect} />
      </Row>
      {sandboxEnabled ? <Simulate id={conn.id} /> : null}
    </Card>
  );
}

const names = (xs: { name: string }[]) => xs.map((a) => a.name).join(', ');

/** Dev only: simulate provider states (spec 09). */
function Simulate({ id }: { id: string }) {
  const opts = [
    { v: 'stale', label: 'Stale' },
    { v: 'reauth', label: 'Re-auth' },
    { v: 'error', label: 'Provider error' },
    { v: 'restore', label: 'Restore' },
  ] as const;
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline, borderStyle: 'dashed', paddingTop: 8, gap: 6 }}>
      <Muted style={{ fontSize: 12 }}>Simulate (dev only)</Muted>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {opts.map((o) => (
          <Pressable
            key={o.v}
            accessibilityRole="button"
            accessibilityLabel={`Simulate ${o.label}`}
            onPress={() => simulate(id, o.v)}
            style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.control, justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft }}>{o.label}</Text>
          </Pressable>
        ))}
      </Row>
    </View>
  );
}
