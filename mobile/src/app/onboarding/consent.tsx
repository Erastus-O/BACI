import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, BackButton, Button, Card, ErrorBanner, Muted, PageHeader, Row, Screen, StepBar, Strong, Toggle } from '../../components/ui';
import { CONSENT_VERSION, consentCategories, ConsentCategory } from '../../data/mock';
import { defaultPermissions, patchOnboarding, putConsent } from '../../services/api';
import { useMutation } from '../../services/useQuery';
import { colors, fonts } from '../../theme';

// 02 Data consent — /onboarding/consent
export default function Consent() {
  const [perms, setPerms] = useState<Record<ConsentCategory, boolean>>(defaultPermissions);
  const save = useMutation(async (p: Record<ConsentCategory, boolean>) => {
    await putConsent(p);
    await patchOnboarding('profile');
  });
  const count = Object.values(perms).filter(Boolean).length;
  const allOff = count === 0;
  const allOn = count === consentCategories.length;
  const noTx = !perms.transactions && !allOff;

  return (
    <Screen
      footer={
        <>
          <ErrorBanner error={save.error} />
          <Button
            label={save.busy ? 'Saving…' : 'Agree and continue'}
            disabled={allOff || save.busy}
            onPress={async () => {
              if ((await save.run(perms)).ok) router.push('/onboarding/profile');
            }}
          />
          <Muted style={{ fontSize: 12, textAlign: 'center' }}>Consent version {CONSENT_VERSION} · we record when you agree and what you allowed</Muted>
        </>
      }
    >
      <Row gap={10}>
        <BackButton onPress={() => router.replace('/welcome')} />
        <View style={{ flex: 1 }}>
          <StepBar step={2} label="Data consent" />
        </View>
      </Row>
      <PageHeader title="What do you want me to access?" subtitle="Choose what BACI can analyse, this would help BACI provide more context" />
      <Row style={{ justifyContent: 'space-between' }}>
        <Muted style={{ fontSize: 14 }}>
          {count} of {consentCategories.length} allowed
        </Muted>
        <Pressable
          accessibilityRole="button"
          onPress={() => setPerms(Object.fromEntries(consentCategories.map((c) => [c.id, !allOn])) as Record<ConsentCategory, boolean>)}
          style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.primary }}>{allOn ? 'Turn all off' : 'Allow all'}</Text>
        </Pressable>
      </Row>
      {allOff ? <Banner tone="warn">BACI can't do anything without at least one category. Turn on what you're comfortable sharing.</Banner> : null}
      {noTx ? <Banner tone="info">{consentCategories[0].impact}</Banner> : null}
      <Card style={{ paddingVertical: 6, paddingHorizontal: 20 }}>
        {consentCategories.map((c) => (
          <Row key={c.id} style={{ paddingVertical: 11 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Strong style={{ fontSize: 16 }}>{c.label}</Strong>
              <Muted style={{ fontSize: 13, lineHeight: 18 }}>{perms[c.id] ? 'Allowed' : c.desc}</Muted>
            </View>
            <Toggle label={c.label} value={perms[c.id]} onChange={(on) => setPerms({ ...perms, [c.id]: on })} />
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
