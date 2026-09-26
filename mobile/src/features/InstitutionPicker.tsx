import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, BackButton, BankMark, Card, ErrorBanner, H1, Loading, Muted, Screen, Stack, StepBar, Strong } from '../components/ui';
import { Icon } from '../components/Icon';
import { getConnections, getInstitutions } from '../services/api';
import { useQuery } from '../services/useQuery';
import { colors, fonts } from '../theme';
import { Flow } from './flow';

// 04 Connect a bank — /onboarding/connect (flow=onboarding), /accounts/add (flow=accounts)
export function InstitutionPicker({ flow }: { flow: Flow }) {
  const insts = useQuery(getInstitutions);
  const conns = useQuery(getConnections);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const list = (insts.data ?? []).filter((b) => !q || b.name.toLowerCase().includes(q));
  const existing = (conns.data ?? []).filter((c) => c.status !== 'awaiting_authorisation');

  return (
    <Screen>
      <Stack gap={12}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace(flow === 'accounts' ? '/accounts' : '/onboarding/profile'))} />
        {flow === 'onboarding' ? <StepBar step={4} /> : null}
      </Stack>
      <Stack gap={6}>
        <H1>{existing.length ? 'Connect another account' : 'Connect your first account'}</H1>
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
                <BankMark initial={b.initial} colour={b.brandColour} />
                <View style={{ flex: 1 }}>
                  <Strong>{b.name}</Strong>
                  <Muted style={{ fontSize: 13 }}>{connected ? `Connected · ${b.types}` : b.types}</Muted>
                </View>
                <Icon name="chevron" size={18} color={colors.muted} />
              </Pressable>
            );
          })}
          {list.length === 0 ? (
            <View style={{ paddingVertical: 20, paddingHorizontal: 4, gap: 4 }}>
              <Strong>No providers match “{query}”</Strong>
              <Muted style={{ fontSize: 13 }}>Check the spelling, or search for the bank that runs your account.</Muted>
            </View>
          ) : null}
        </Card>
      ) : null}
      <Banner tone="info">You can add more banks, cards and savings accounts next — BACI works best with all of them.</Banner>
    </Screen>
  );
}
