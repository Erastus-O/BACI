import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Body, Button, Card, H1, Muted, Row, Screen, Stack, StepBar } from '../../../components/ui';
import { Icon } from '../../../components/Icon';
import { exitPath, useFlow } from '../../../features/flow';
import { ApiError, getConnection, sync } from '../../../services/api';
import { useQuery } from '../../../services/useQuery';
import { colors, fonts } from '../../../theme';

const labels = ['Retrieving balances', 'Fetching 12 months of transactions', 'Categorising spending', 'Finding regular payments', 'Building your financial picture'];

// 05a Syncing — /connect/:id/sync
export default function Syncing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const flow = useFlow();
  const conn = useQuery(() => getConnection(id), [id]);
  const bankName = conn.data?.institution.name ?? 'your bank';
  const [done, setDone] = useState(0);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const finished = useRef(false);

  const run = useCallback(async () => {
    setError(null);
    setDone(0);
    finished.current = false;
    // Progress steps animate while the (mock) server syncs.
    const t = setInterval(() => setDone((d) => Math.min(4, d + 1)), 450);
    try {
      await new Promise((r) => setTimeout(r, 1900));
      await sync(id);
      clearInterval(t);
      setDone(5);
      finished.current = true;
      AccessibilityInfo.announceForAccessibility(`${bankName} synced`);
      setTimeout(() => router.replace({ pathname: '/connect/[id]/done', params: { id, flow } }), 600);
    } catch (e) {
      clearInterval(t);
      if (e instanceof ApiError && e.code === 'reauth_required') {
        router.replace({ pathname: '/accounts/reconnect/[connectionId]', params: { connectionId: id } });
        return;
      }
      setError(e as Error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, flow, attempt]);

  useEffect(() => {
    run();
  }, [run]);

  const pct = Math.round((done / 5) * 100);

  return (
    <Screen
      footer={
        error ? (
          <>
            <Button label="Retry sync" icon="refresh" onPress={() => setAttempt((a) => a + 1)} />
            <Button label="Continue without it" variant="ghost" size="md" onPress={() => router.replace(exitPath(flow))} />
          </>
        ) : undefined
      }
    >
      <View style={{ paddingTop: 56 }}>{flow === 'onboarding' ? <StepBar step={4} /> : null}</View>
      <Stack gap={6}>
        <H1>Syncing {bankName}</H1>
        <Muted>This usually takes a few seconds.</Muted>
      </Stack>
      <Card style={{ gap: 14 }}>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Sync progress"
          accessibilityValue={{ min: 0, max: 100, now: pct }}
          style={{ height: 8, borderRadius: 999, backgroundColor: colors.track, overflow: 'hidden' }}
        >
          <View style={{ height: '100%', width: `${pct}%`, backgroundColor: colors.primary, borderRadius: 999 }} />
        </View>
        {labels.map((label, i) => {
          const isDone = i < done;
          const isNow = i === done && !error;
          return (
            <Row key={label}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isDone ? colors.successBg : colors.surface,
                  borderWidth: isDone ? 0 : isNow ? 2 : 1.5,
                  borderColor: isNow ? colors.primary : colors.control,
                  borderStyle: isDone || isNow ? 'solid' : 'dashed',
                }}
              >
                {isDone ? <Icon name="check" size={13} color={colors.successFg} strokeWidth={2.8} /> : null}
              </View>
              <Body style={{ flex: 1, color: isDone || isNow ? colors.ink : colors.muted }}>{label}</Body>
              <Text style={{ fontSize: 12.5, fontFamily: fonts.semibold, color: isDone || isNow ? colors.ink : colors.muted }}>
                {isDone ? 'Done' : isNow ? 'In progress' : 'Waiting'}
              </Text>
            </Row>
          );
        })}
      </Card>
      <View accessibilityLiveRegion="polite">
        {done >= 5 ? <Banner tone="success" icon="check">{`${bankName} synced. Opening your summary…`}</Banner> : null}
        {error ? <Banner tone="danger">{`We couldn't finish syncing ${bankName}. ${error.message}`}</Banner> : null}
      </View>
      {!error && done < 5 ? (
        <Row gap={10} style={{ alignItems: 'flex-start' }}>
          <Icon name="info" size={18} color={colors.inkSoft} />
          <Body style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: colors.inkSoft }}>
            Taking a while? You can carry on — we'll finish in the background and let you know when your first insight is ready.
          </Body>
        </Row>
      ) : null}
    </Screen>
  );
}
