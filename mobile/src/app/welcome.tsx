import { Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, ErrorBanner, Muted, Screen, StepBar } from '../components/ui';
import { Orb } from '../components/orb/Orb';
import { loadSampleData, patchOnboarding } from '../services/api';
import { useMutation } from '../services/useQuery';
import { colors, fonts } from '../theme';

// 01 Introduction — /welcome
export default function Intro() {
  const start = useMutation(patchOnboarding);
  const demo = useMutation(loadSampleData);
  const { height } = useWindowDimensions();
  const orbSize = Math.max(160, Math.min(260, height * 0.3));

  return (
    <Screen
      scroll={false}
      footer={
        <Card style={{ gap: 12, padding: 18 }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 29, color: colors.ink }}>
            Hello, I'm BACI
          </Text>
          <Muted style={{ fontSize: 15.5, lineHeight: 22 }}>
            Your financial intelligence agent. With your permission, I'll look at your spending and savings together, then answer questions like “Can I afford this?” in plain English.
          </Muted>
          <ErrorBanner error={start.error ?? demo.error} />
          <Button
            label={start.busy ? 'Starting…' : 'Get started'}
            disabled={start.busy}
            onPress={async () => {
              if ((await start.run('consent')).ok) router.push('/onboarding/consent');
            }}
          />
          <Button
            label="Explore with sample data"
            variant="ghost"
            size="md"
            disabled={demo.busy}
            onPress={async () => {
              if ((await demo.run()).ok) router.replace('/home');
            }}
          />
          <Muted style={{ fontSize: 12, textAlign: 'center' }}>BACI provides information, not regulated financial advice.</Muted>
        </Card>
      }
    >
      <StepBar step={1} label="Welcome" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <Orb size={orbSize} accessibilityLabel="BACI. Drag to spin, tap to wake." />
        <Text style={{ fontFamily: fonts.medium, fontSize: 12.5, color: colors.muted, letterSpacing: 0.3 }}>Drag to spin · tap to wake</Text>
      </View>
    </Screen>
  );
}
