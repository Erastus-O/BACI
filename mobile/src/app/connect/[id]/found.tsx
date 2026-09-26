import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Body, Button, H1, Muted, Screen, Stack, StepBar } from '../../../components/ui';
import { Icon } from '../../../components/Icon';
import { pickerPath, readDiscovered, useFlow } from '../../../features/flow';
import { DiscoveredAccount, getConnection } from '../../../services/api';
import { useQuery } from '../../../services/useQuery';
import { colors, fonts } from '../../../theme';

// 04c Back in BACI — accounts found — /connect/:id/found
export default function AccountsFound() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const flow = useFlow();
  const conn = useQuery(() => getConnection(id), [id]);
  const discovered = readDiscovered<DiscoveredAccount[]>(id) ?? [];
  const n = discovered.filter((a) => !a.duplicateOf).length;
  const bankName = conn.data?.institution.name ?? 'your bank';
  const [done, setDone] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setDone((d) => (d >= 3 ? d : d + 1)), 350);
    return () => clearInterval(t);
  }, []);

  const steps = [`Access approved at ${bankName}`, 'Secure connection set up', `Found ${n} account${n === 1 ? '' : 's'}`];

  return (
    <Screen
      footer={
        n > 0 ? (
          <Button
            label={`Review ${n} account${n === 1 ? '' : 's'}`}
            disabled={done < 3}
            onPress={() => router.replace({ pathname: '/connect/[id]/select', params: { id, flow } })}
          />
        ) : (
          <Button label="Choose a different provider" onPress={() => router.replace({ pathname: pickerPath(flow), params: { flow } })} />
        )
      }
    >
      <View style={{ paddingTop: 56 }}>{flow === 'onboarding' ? <StepBar step={4} /> : null}</View>
      <View style={{ alignItems: 'center', paddingTop: 12 }}>
        <View style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 1.5, borderColor: colors.ringOuter, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={40} color={colors.successFg} strokeWidth={2} />
          </View>
        </View>
      </View>
      <Stack gap={6} style={{ alignItems: 'center' }}>
        <H1 style={{ textAlign: 'center' }}>Welcome back</H1>
        <Muted style={{ textAlign: 'center' }}>{bankName} approved access. Here's what's happening.</Muted>
      </Stack>
      <View accessibilityLabel="Connection progress" style={{ padding: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, gap: 14 }}>
        {steps.map((label, i) => (
          <StepRow key={label} label={label} state={i < done ? 'done' : i === done ? 'now' : 'wait'} />
        ))}
        <StepRow label="Choose which ones BACI can use" state={done >= 3 ? 'next' : 'wait'} />
      </View>
      {done >= 3 && n === 0 ? (
        <Banner tone="warn">{`${bankName} didn't return any accounts BACI can use${discovered.length ? ' — they are all already connected through another bank' : ''}. Try a different provider.`}</Banner>
      ) : null}
    </Screen>
  );
}

function StepRow({ label, state }: { label: string; state: 'done' | 'now' | 'wait' | 'next' }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      {state === 'done' ? (
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={14} color={colors.successFg} strokeWidth={2.6} />
        </View>
      ) : state === 'now' ? (
        <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.control }} />
      )}
      <Body style={{ flex: 1, color: state === 'done' || state === 'now' ? colors.ink : colors.muted }}>{label}</Body>
      <Text style={{ fontSize: 12.5, fontFamily: fonts.semibold, color: state === 'done' ? colors.successFg : colors.muted }}>
        {state === 'done' ? 'Done' : state === 'now' ? 'Working' : state === 'next' ? 'Next' : ''}
      </Text>
    </View>
  );
}
