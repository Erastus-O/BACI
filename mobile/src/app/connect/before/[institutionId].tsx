import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BackButton, BankMark, Body, Button, Card, Display, Divider, ErrorBanner, Eyebrow, Muted, Row, Screen, Stack } from '../../../components/ui';
import { Icon } from '../../../components/Icon';
import { OrbImage } from '../../../components/orb/OrbImage';
import { findInstitution, pickerInstitutions } from '../../../data/banks';
import { pickerPath, useFlow } from '../../../features/flow';
import { postConnection } from '../../../services/api';
import { useMutation } from '../../../services/useQuery';
import { colors } from '../../../theme';

// 04a Before you go — /connect/before/:institutionId. Nothing is created until Continue.
export default function ConnectBefore() {
  const { institutionId } = useLocalSearchParams<{ institutionId: string }>();
  const flow = useFlow();
  const bank = findInstitution(institutionId) ?? pickerInstitutions[0];
  const start = useMutation(postConnection);

  // Open Banking app-to-app: approve in the bank's own app, or on its website if the app isn't installed.
  const go = async (via: 'app' | 'web') => {
    const r = await start.run(bank.id);
    if (r.ok) router.push({ pathname: '/connect/authorise/[connectionId]', params: { connectionId: r.value.connection.id, flow, via } });
  };

  return (
    <Screen
      footer={
        <>
          <ErrorBanner error={start.error} />
          <Button label={start.busy ? 'Opening…' : `Open the ${bank.name} app`} icon="phone" disabled={start.busy} onPress={() => go('app')} />
          <Button label={`Use ${bank.name}'s website instead`} variant="secondary" size="md" iconRight="external" disabled={start.busy} onPress={() => go('web')} />
          <Button label="Choose a different provider" variant="ghost" size="md" onPress={() => router.replace({ pathname: pickerPath(flow), params: { flow } })} />
        </>
      }
    >
      <BackButton label="Back to providers" />
      <Row gap={14} style={{ justifyContent: 'center', paddingVertical: 8 }}>
        <OrbImage size={56} interactive={false} />
        <Row gap={4}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.control }} />
          ))}
        </Row>
        <BankMark initial={bank.initial} colour={bank.brandColour} logo={bank.logo} size={56} />
      </Row>
      <Stack gap={6}>
        <Display accessibilityRole="header" style={{ fontSize: 26, lineHeight: 31, textAlign: 'center' }}>
          Approve in your {bank.name} app
        </Display>
        <Muted style={{ textAlign: 'center' }}>We'll open the {bank.name} app on this phone. Confirm it's you with Face ID or your passcode, approve, and you'll come straight back to BACI. No app? Use their website.</Muted>
      </Stack>
      <Card style={{ gap: 12 }}>
        <Eyebrow>BACI will be able to see</Eyebrow>
        <Item ok text="Account names, types and last 4 digits" />
        <Item ok text="Balances and up to 12 months of transactions" />
        <Item ok text="Direct debits and standing orders" />
        <Divider />
        <Eyebrow>BACI can never</Eyebrow>
        <Item text="See your bank password or login details" />
        <Item text="Move money or make payments" />
      </Card>
      <Row gap={10} style={{ alignItems: 'flex-start' }}>
        <Icon name="clock" size={18} color={colors.inkSoft} />
        <Body style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: colors.inkSoft }}>
          Access lasts 90 days, then we'll ask you to reconfirm.
        </Body>
      </Row>
    </Screen>
  );
}

function Item({ ok, text }: { ok?: boolean; text: string }) {
  return (
    <Row gap={10} style={{ alignItems: 'flex-start' }}>
      <Icon name={ok ? 'check' : 'close'} size={18} color={ok ? colors.successFg : colors.dangerFg} strokeWidth={2.2} />
      <Body style={{ flex: 1, fontSize: 14.5 }}>{text}</Body>
    </Row>
  );
}
