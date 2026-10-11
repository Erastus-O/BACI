import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, BackButton, BankMark, Body, Button, Card, Divider, ErrorBanner, Eyebrow, H1, Loading, Muted, Row, Screen, Stack, StepBar, Strong } from '../components/ui';
import { Icon } from '../components/Icon';
import { getConnections, getInstitutions, peek } from '../services/api';
import { useMutation } from '../services/useQuery';
import { connectBank, connectSandboxBank } from './connectLive';
import { useQuery } from '../services/useQuery';
import { colors, fonts } from '../theme';
import { Flow } from './flow';
import { bankDirectory } from '../data/banks';

// Without a search, show this many (popular banks first); searching covers the full list.
const FIRST = 25;

// 04 Connect a bank — /onboarding/connect (flow=onboarding), /accounts/add (flow=accounts)
export function InstitutionPicker({ flow }: { flow: Flow }) {
  return peek.mode() === 'live' ? <LiveConnect flow={flow} /> : <SandboxPicker flow={flow} />;
}

/** Live: Plaid Link lists every supported bank (with logos) and handles approval in the bank's app. */
function LiveConnect({ flow }: { flow: Flow }) {
  const conns = useQuery(getConnections);
  const existing = (conns.data ?? []).filter((c) => c.status !== 'awaiting_authorisation');
  const open = useMutation(() => connectBank(flow));
  const sandbox = useMutation(() => connectSandboxBank(flow));
  const busy = open.busy || sandbox.busy;

  return (
    <Screen
      footer={
        <>
          <ErrorBanner error={open.error ?? sandbox.error} />
          <Button label={open.busy ? 'Opening…' : 'Choose your bank'} icon="search" disabled={busy} onPress={() => open.run()} />
          {peek.features().sandboxShortcut ? (
            <Button label={sandbox.busy ? 'Connecting…' : 'Use Plaid’s test bank (sandbox)'} variant="secondary" size="md" disabled={busy} onPress={() => sandbox.run()} />
          ) : null}
        </>
      }
    >
      <Stack gap={12}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace(flow === 'accounts' ? '/accounts' : '/onboarding/profile'))} />
        {flow === 'onboarding' ? <StepBar step={4} /> : null}
      </Stack>
      <Stack gap={6}>
        <H1>{existing.length ? 'Connect another account' : 'Connect your account'}</H1>
        <Muted>
          Find your bank, building society or card provider. You'll approve read-only access in your bank's app (or its website), then come straight back to choose which accounts BACI can use.
        </Muted>
        {existing.length ? (
          <Muted style={{ fontSize: 13 }}>
            {existing.length} connection{existing.length === 1 ? '' : 's'} already: {existing.map((c) => c.institution.name).join(', ')}
          </Muted>
        ) : null}
      </Stack>
      <Card style={{ gap: 12 }}>
        <Eyebrow>BACI will be able to see</Eyebrow>
        <Line ok text="Account names, types and last 4 digits" />
        <Line ok text="Balances and up to 12 months of transactions" />
        <Line ok text="Direct debits and standing orders" />
        <Divider />
        <Eyebrow>BACI can never</Eyebrow>
        <Line text="See your bank password or login details" />
        <Line text="Move money or make payments" />
      </Card>
      <Muted style={{ fontSize: 12.5 }}>
        Secure connection by Plaid, authorised by the FCA to provide account information services. Access lasts 90 days, then your bank asks you to reconfirm. Disconnect any time in Accounts.
      </Muted>
    </Screen>
  );
}

function Line({ ok, text }: { ok?: boolean; text: string }) {
  return (
    <Row gap={10} style={{ alignItems: 'flex-start' }}>
      <Icon name={ok ? 'check' : 'close'} size={18} color={ok ? colors.successFg : colors.dangerFg} strokeWidth={2.2} />
      <Body style={{ flex: 1, fontSize: 14.5 }}>{text}</Body>
    </Row>
  );
}

/** Demo: the sandbox banks (or the Plaid directory baked in at build time), with simulated approval. */
function SandboxPicker({ flow }: { flow: Flow }) {
  const insts = useQuery(getInstitutions);
  const conns = useQuery(getConnections);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (insts.data ?? []).filter((b) => !q || b.name.toLowerCase().includes(q));
  const list = q ? matches : matches.slice(0, FIRST);
  const more = matches.length - list.length;
  const existing = (conns.data ?? []).filter((c) => c.status !== 'awaiting_authorisation');

  return (
    <Screen>
      <Stack gap={12}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace(flow === 'accounts' ? '/accounts' : '/onboarding/profile'))} />
        {flow === 'onboarding' ? <StepBar step={4} /> : null}
      </Stack>
      <Stack gap={6}>
        <H1>{existing.length ? 'Connect another account' : 'Connect your account'}</H1>
        <Muted>Pick your bank, building society or card provider. You'll approve read-only access on their side, then choose which accounts BACI can use.</Muted>
        {existing.length ? (
          <Muted style={{ fontSize: 13 }}>
            {existing.length} connection{existing.length === 1 ? '' : 's'} already
          </Muted>
        ) : null}
      </Stack>
      <View>
        <View style={{ position: 'absolute', left: 14, top: 15, zIndex: 1 }}>
          <Icon name="search" size={18} color={colors.muted} />
        </View>
        <TextInput
          accessibilityLabel="Search institutions"
          value={query}
          onChangeText={setQuery}
          placeholder="Search banks and providers"
          placeholderTextColor={colors.muted}
          style={{ height: 48, borderWidth: 1, borderColor: colors.control, borderRadius: 10, backgroundColor: colors.surface, paddingLeft: 40, paddingRight: 14, fontFamily: fonts.body, fontSize: 16, color: colors.ink }}
        />
      </View>
      {insts.loading ? <Loading label="Loading providers" /> : null}
      <ErrorBanner error={insts.error} onRetry={insts.reload} />
      {insts.data ? (
        <Card style={{ paddingVertical: 4, paddingHorizontal: 12 }}>
          {list.map((b, i) => {
            const connected = existing.some((c) => c.institutionId === b.id);
            return (
              <Pressable
                key={b.id}
                accessibilityRole="button"
                accessibilityLabel={`${b.name}, ${b.types}${connected ? ', already connected' : ''}`}
                onPress={() => router.push({ pathname: '/connect/before/[institutionId]', params: { institutionId: b.id, flow } })}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: colors.hairline, opacity: pressed ? 0.7 : 1 })}
              >
                <BankMark initial={b.initial} colour={b.brandColour} logo={b.logo} />
                <View style={{ flex: 1 }}>
                  <Strong>{b.name}</Strong>
                  <Muted style={{ fontSize: 13 }}>{connected ? `Connected · ${b.types}` : b.types}</Muted>
                </View>
                <Icon name="chevron" size={18} color={colors.muted} />
              </Pressable>
            );
          })}
          {more > 0 ? (
            <Muted style={{ fontSize: 13, paddingVertical: 14, paddingHorizontal: 4 }}>
              {more} more — search to find yours.
            </Muted>
          ) : null}
          {list.length === 0 ? (
            <View style={{ paddingVertical: 20, paddingHorizontal: 4, gap: 4 }}>
              <Strong>No providers match “{query}”</Strong>
              <Muted style={{ fontSize: 13 }}>Check the spelling, or search for the bank that runs your account.</Muted>
            </View>
          ) : null}
        </Card>
      ) : null}
      {bankDirectory.source === 'plaid' ? (
        <Muted style={{ fontSize: 12, textAlign: 'center' }}>
          {(insts.data ?? []).length} {bankDirectory.country} banks and logos from Plaid · updated {bankDirectory.fetchedAt}. Connecting is simulated in this prototype.
        </Muted>
      ) : null}
      <Banner tone="info">You can add more banks, cards and savings accounts next — BACI works best with all of them.</Banner>
    </Screen>
  );
}
