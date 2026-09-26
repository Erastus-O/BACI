import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Display, ErrorBanner, Eyebrow, IconTile, Muted, Row, Screen, Stack, StepBar } from '../components/ui';
import { Icon, IconName } from '../components/Icon';
import { loadSampleData, patchOnboarding } from '../services/api';
import { useMutation } from '../services/useQuery';
import { colors, fonts } from '../theme';

// 01 Introduction — /welcome
export default function Intro() {
  const start = useMutation(patchOnboarding);
  const demo = useMutation(loadSampleData);

  return (
    <Screen
      footer={
        <>
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
          <Muted style={{ fontSize: 12.5, textAlign: 'center' }}>BACI provides information, not regulated financial advice.</Muted>
        </>
      }
    >
      <Stack gap={12}>
        <Text style={{ fontFamily: fonts.displayBold, fontSize: 22, letterSpacing: 0.4, color: colors.ink }}>
          BAC<Text style={{ color: colors.primary }}>I</Text>
        </Text>
        <StepBar step={1} />
        <Muted style={{ fontSize: 12.5 }}>Step 1 of 5</Muted>
      </Stack>

      <View style={{ alignItems: 'center', paddingTop: 8 }}>
        <View style={{ width: 168, height: 168, borderRadius: 84, borderWidth: 1.5, borderColor: colors.ringOuter, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 130, height: 130, borderRadius: 65, borderWidth: 1.5, borderColor: colors.ringInner, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="sparkle" size={40} color="#FFFFFF" strokeWidth={1.6} />
            </View>
          </View>
        </View>
      </View>

      <Stack gap={8} style={{ alignItems: 'center' }}>
        <Eyebrow style={{ fontSize: 13 }}>Finance Intelligence Agent</Eyebrow>
        <Display accessibilityRole="header" style={{ fontSize: 30, lineHeight: 35, textAlign: 'center' }}>
          One clear view of all your money
        </Display>
        <Muted style={{ fontSize: 16, lineHeight: 24, textAlign: 'center' }}>
          With your permission, BACI connects your accounts and analyses your spending and savings together — then answers questions like “Can I afford this?” in plain English.
        </Muted>
      </Stack>

      <Stack gap={16}>
        <Feature icon="shield" title="Secure Vault" body="Read-only access through regulated Open Banking. BACI never sees your bank password, and you can disconnect any account at any time." />
        <Feature icon="bell" title="Smart Alerts" body="Heads-ups before bills land, duplicate subscriptions, and spending that's drifting from normal." />
        <Feature icon="mic" title="Talk it through" body="Ask BACI out loud or by text. Answers are worked out from your connected accounts." />
      </Stack>
    </Screen>
  );
}

function Feature({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <Row style={{ alignItems: 'flex-start' }}>
      <IconTile name={icon} />
      <View style={{ flex: 1, gap: 2 }}>
        <Display style={{ fontSize: 18 }}>{title}</Display>
        <Body style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{body}</Body>
      </View>
    </Row>
  );
}
