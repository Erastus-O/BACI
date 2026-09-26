import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Body, Button, Card, Display, Muted, Screen, Stack, StepBar } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { exitPath, pickerPath, useFlow } from '../../features/flow';
import { colors } from '../../theme';

type Reason = 'cancelled' | 'timed_out' | 'bank_unavailable';

// E1 Connection didn't complete — /connect/failed?reason=&institution=&name=&flow=[&reconnect=]
export default function ConnectFailed() {
  const { reason = 'cancelled', institution = '', name = 'Your bank', reconnect } = useLocalSearchParams<{ reason?: Reason; institution?: string; name?: string; reconnect?: string }>();
  const flow = useFlow();
  const copy = {
    cancelled: {
      title: `${name} wasn't connected`,
      body: `You chose not to share access at ${name}, so nothing was connected. You can try again whenever you like.`,
      what: 'Access not approved at the bank',
      retry: 'Try again',
      bg: colors.hairline,
      fg: colors.inkSoft,
    },
    timed_out: {
      title: `The link to ${name} expired`,
      body: "For your security, approval links only last 15 minutes. Start again and it'll only take a moment.",
      what: 'Approval not completed in time',
      retry: 'Start again',
      bg: colors.warnBg,
      fg: colors.warnFg,
    },
    bank_unavailable: {
      title: `${name} isn't responding`,
      body: "This is on the bank's side, not yours. Try again in a few minutes, or connect a different account for now.",
      what: 'Bank service unavailable',
      retry: 'Retry',
      bg: colors.dangerBg,
      fg: colors.dangerFg,
    },
  }[reason as Reason] ?? { title: `${name} wasn't connected`, body: '', what: 'Unknown', retry: 'Try again', bg: colors.hairline, fg: colors.inkSoft };

  const retry = () =>
    reconnect
      ? router.replace({ pathname: '/accounts/reconnect/[connectionId]', params: { connectionId: reconnect } })
      : router.replace({ pathname: '/connect/before/[institutionId]', params: { institutionId: institution, flow } });

  return (
    <Screen
      footer={
        <>
          <Button label={copy.retry} onPress={retry} />
          {!reconnect ? <Button label="Choose a different provider" variant="secondary" onPress={() => router.replace({ pathname: pickerPath(flow), params: { flow } })} /> : null}
          <Button label="Skip for now" variant="ghost" size="md" onPress={() => router.replace(reconnect ? '/accounts' : exitPath(flow))} />
        </>
      }
    >
      <View style={{ paddingTop: 56 }}>{flow === 'onboarding' && !reconnect ? <StepBar step={4} /> : null}</View>
      <View style={{ alignItems: 'center', paddingTop: 12 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: copy.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="unlink" size={40} color={copy.fg} />
        </View>
      </View>
      <View accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <Stack gap={8} style={{ alignItems: 'center' }}>
          <Display accessibilityRole="header" style={{ fontSize: 26, lineHeight: 31, textAlign: 'center' }}>
            {copy.title}
          </Display>
          <Muted style={{ textAlign: 'center' }}>{copy.body}</Muted>
        </Stack>
      </View>
      <Card style={{ gap: 8 }}>
        <Detail label="Provider" value={name} />
        <Detail label="What happened" value={copy.what} />
        <Detail label="Your data" value="Nothing was shared with BACI." />
      </Card>
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Muted style={{ width: 110, fontSize: 14 }}>{label}</Muted>
      <Body style={{ flex: 1, fontSize: 14 }}>{value}</Body>
    </View>
  );
}
