import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Button, Card, Display, H1, Muted, Row, Screen, Stack, Strong, Toggle } from '../../components/ui';
import { Icon, IconName } from '../../components/Icon';
import { agentConfig, isAgentConfigured } from '../../agent/config';
import { useAgentChat } from '../../agent/AgentChat';
import { sandboxEnabled } from '../../features/sandbox';
import { consentCategories } from '../../data/mock';
import { money } from '../../lib/format';
import { getConnections, getConsent, getProfile, getSnapshot, peek, resetAll, setSimulateDataOutage } from '../../services/api';
import { useQuery } from '../../services/useQuery';
import { colors } from '../../theme';

// S1 Settings — /settings
export default function Settings() {
  const consent = useQuery(getConsent);
  const profile = useQuery(getProfile);
  const conns = useQuery(getConnections);
  const snap = useQuery(getSnapshot);
  const { reset } = useAgentChat();

  const perms = consent.data?.consent?.permissions;
  const allowedCount = perms ? Object.values(perms).filter(Boolean).length : 0;
  const accounts = (conns.data ?? []).flatMap((c) => c.accounts.filter((a) => a.selected));
  const attention = (conns.data ?? []).filter((c) => c.status !== 'active').length;
  const p = profile.data;

  return (
    <Screen edges={['top']}>
      <H1 style={{ paddingTop: 8 }}>Settings</H1>

      <LinkCard
        icon="shield"
        tint={colors.primaryTint}
        fg={colors.primary}
        title="Data permissions"
        sub={perms ? `${allowedCount} of ${consentCategories.length} allowed · review or revoke` : 'Access revoked · review permissions'}
        onPress={() => router.push('/settings/permissions')}
      />
      <LinkCard
        icon="wallet"
        tint={colors.infoBg}
        fg={colors.infoFg}
        title="Connected accounts"
        sub={`${accounts.length} account${accounts.length === 1 ? '' : 's'}${attention ? ` · ${attention} need${attention === 1 ? 's' : ''} attention` : ''}`}
        onPress={() => router.navigate('/accounts')}
      />

      <Card style={{ gap: 14 }}>
        <Display style={{ fontSize: 19 }}>Financial profile</Display>
        <Muted style={{ fontSize: 13 }}>What you tell us is kept separately from what we detect in your accounts; one never overwrites the other.</Muted>
        <View style={{ gap: 10 }}>
          <Field label="Take-home income">
            <Strong style={{ fontSize: 14.5 }}>
              {p?.income ? `${money(p.income.value, true)} a year ` : 'Not given '}
              <Muted style={{ fontSize: 12.5 }}>{p?.income ? '(you said)' : ''}</Muted>
            </Strong>
            <Muted style={{ fontSize: 12.5 }}>{snap.data?.monthlyIncome ? `${money(snap.data.monthlyIncome, true)}/month detected` : 'Nothing detected yet'}</Muted>
          </Field>
          <Field label="Status" value={p?.status?.value} />
          <Field label="Primary goal" value={p?.goal?.value} />
          <Field label="Risk approach" value={p?.risk?.value} />
          <Field label="Check-ins" value={p?.frequency?.value} />
          <Field label="Safety buffer" value={p?.buffer ? money(p.buffer.value, true) : undefined} />
        </View>
        <Button label="Edit profile" variant="secondary" size="md" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/onboarding/profile')} />
      </Card>

      <Card style={{ gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Display style={{ fontSize: 19 }}>Voice agent</Display>
          {isAgentConfigured ? <Badge tone="success" icon="check" label="Connected" /> : <Badge tone="warn" icon="warn" label="Not set up" />}
        </Row>
        <Muted style={{ fontSize: 13.5 }}>
          {agentConfig.tokenUrl
            ? `ElevenLabs private agent via token server: ${agentConfig.tokenUrl}`
            : agentConfig.agentId
              ? `ElevenLabs agent: ${agentConfig.agentId}`
              : 'Add EXPO_PUBLIC_ELEVENLABS_AGENT_ID to mobile/.env and restart. Until then, Ask BACI answers balance, bills and affordability questions on this device.'}
        </Muted>
      </Card>

      {sandboxEnabled ? <DevPanel onReset={reset} /> : null}

      <Muted style={{ fontSize: 12.5 }}>BACI provides information, not regulated financial advice.</Muted>
    </Screen>
  );
}

function DevPanel({ onReset }: { onReset: () => void }) {
  const outage = peek.simulateDataOutage();
  return (
    <Card style={{ gap: 10, borderStyle: 'dashed' }}>
      <Strong>Prototype controls (dev only)</Strong>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Strong style={{ fontSize: 14 }}>Live data unavailable</Strong>
          <Muted style={{ fontSize: 12.5 }}>Agent tools fail, to preview A2 “won't guess”.</Muted>
        </View>
        <Toggle label="Simulate live data unavailable" value={outage} onChange={setSimulateDataOutage} />
      </Row>
      <Button
        label="Restart the prototype"
        variant="danger"
        size="md"
        onPress={async () => {
          onReset();
          await resetAll();
          router.replace('/welcome');
        }}
      />
    </Card>
  );
}

function LinkCard({ icon, tint, fg, title, sub, onPress }: { icon: IconName; tint: string; fg: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}. ${sub}`}
      onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: pressed ? colors.hairline : colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 12, alignItems: 'center' })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Strong>{title}</Strong>
        <Muted style={{ fontSize: 13 }}>{sub}</Muted>
      </View>
      <Icon name="chevron" size={18} color={colors.muted} />
    </Pressable>
  );
}

function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <Row style={{ alignItems: 'flex-start' }}>
      <Muted style={{ width: 128, fontSize: 14.5 }}>{label}</Muted>
      <Stack gap={0} style={{ flex: 1 }}>
        {children ?? <Strong style={{ fontSize: 14.5 }}>{value ?? 'Not given'}</Strong>}
      </Stack>
    </Row>
  );
}
