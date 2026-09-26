import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BackButton, BankMark, Body, Button, Card, Display, Divider, ErrorBanner, Eyebrow, Muted, Row, Screen, Stack } from '../../../components/ui';
import { Icon } from '../../../components/Icon';
import { institutions } from '../../../data/mock';
import { pickerPath, useFlow } from '../../../features/flow';
import { postConnection } from '../../../services/api';
import { useMutation } from '../../../services/useQuery';
import { colors, fonts } from '../../../theme';

// 04a Before you go — /connect/before/:institutionId. Nothing is created until Continue.
export default function ConnectBefore() {
  const { institutionId } = useLocalSearchParams<{ institutionId: string }>();
  const flow = useFlow();
  const bank = institutions.find((i) => i.id === institutionId) ?? institutions[0];
  const start = useMutation(postConnection);

  return (
    <Screen
      footer={
        <>
          <ErrorBanner error={start.error} />
          <Button
            label={start.busy ? 'Opening…' : `Continue to ${bank.name}`}
            iconRight="external"
            disabled={start.busy}
            onPress={async () => {
              const r = await start.run(bank.id);
              if (r.ok) router.push({ pathname: '/connect/authorise/[connectionId]', params: { connectionId: r.value.connection.id, flow } });
            }}
          />
          <Button label="Choose a different provider" variant="ghost" size="md" onPress={() => router.replace({ pathname: pickerPath(flow), params: { flow } })} />
        </>
      }
    >
      <BackButton label="Back to providers" />
      <Row gap={14} style={{ justifyContent: 'center', paddingVertical: 8 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontFamily: fonts.displayBold, fontSize: 18 }}>B</Text>
        </View>
        <Row gap={4}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.control }} />
          ))}
        </Row>
        <BankMark initial={bank.initial} colour={bank.brandColour} size={56} />
      </Row>
      <Stack gap={6}>
        <Display accessibilityRole="header" style={{ fontSize: 26, lineHeight: 31, textAlign: 'center' }}>
          You'll approve access at {bank.name}
        </Display>
        <Muted style={{ textAlign: 'center' }}>We'll open {bank.name}'s app or website. Sign in there as usual, then come straight back.</Muted>
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
          Access lasts 90 days, then we'll ask you to reconfirm. You can disconnect any time in Accounts. Connection provided by [OPEN BANKING PROVIDER], authorised by the FCA.
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
