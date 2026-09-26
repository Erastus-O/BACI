import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, Button, Card, Dialog, ErrorBanner, H1, Loading, Muted, Row, Screen, Stack, Strong, Toggle } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { CONSENT_VERSION, consentCategories, ConsentCategory } from '../../data/mock';
import { defaultPermissions, deleteConsent, getConsent, putConsent } from '../../services/api';
import { useMutation, useQuery } from '../../services/useQuery';
import { colors, fonts } from '../../theme';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// S2 Data permissions — /settings/permissions
export default function Permissions() {
  const q = useQuery(getConsent);
  const saved = q.data?.consent?.permissions;
  const [perms, setPerms] = useState<Record<ConsentCategory, boolean> | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const save = useMutation(putConsent);
  const revoke = useMutation(deleteConsent);

  useEffect(() => {
    if (q.data && perms === null) setPerms(saved ?? defaultPermissions());
  }, [q.data, saved, perms]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  if (!perms || !q.data) {
    return (
      <Screen>
        <BackLink onPress={back} />
        {q.loading ? <Loading label="Loading permissions" /> : <ErrorBanner error={q.error} onRetry={q.reload} />}
      </Screen>
    );
  }

  const c = q.data.consent;
  const changed = consentCategories.filter((cat) => (saved ? saved[cat.id] !== perms[cat.id] : true));
  const turnedOff = changed.filter((cat) => !perms[cat.id]);
  const noneOn = !Object.values(perms).some(Boolean);

  return (
    <Screen>
      <BackLink onPress={back} />
      <Stack gap={4}>
        <H1>Data permissions</H1>
        <Muted style={{ fontSize: 12.5 }}>
          {c
            ? `Version ${c.version} · first agreed ${fmtDate(c.firstAgreedAt)} · updated ${fmtTime(c.updatedAt)}`
            : `Access revoked${q.data.revokedAt ? ` ${fmtTime(q.data.revokedAt)}` : ''}. Save to agree to version ${CONSENT_VERSION} again.`}
        </Muted>
      </Stack>

      {changed.length && saved ? (
        <View accessibilityLiveRegion="polite">
          <Banner tone="info">
            {`Unsaved change. ${turnedOff.length ? turnedOff.map((t) => t.impact).join(' ') : 'Turning a category on adds it to insights and answers once you save.'}`}
          </Banner>
        </View>
      ) : null}
      {noneOn ? <Banner tone="warn">Allow at least one category, or use “Revoke all access” below.</Banner> : null}

      <Card style={{ paddingVertical: 0 }}>
        {consentCategories.map((cat, i) => (
          <Row key={cat.id} style={{ paddingVertical: 10, borderBottomWidth: i === consentCategories.length - 1 ? 0 : 1, borderBottomColor: colors.hairline }}>
            <View style={{ flex: 1, gap: 1 }}>
              <Strong>{cat.label}</Strong>
              <Muted style={{ fontSize: 12.5, lineHeight: 17 }}>{cat.desc}</Muted>
            </View>
            <Toggle label={cat.label} value={perms[cat.id]} onChange={(on) => setPerms({ ...perms, [cat.id]: on })} />
          </Row>
        ))}
      </Card>

      <ErrorBanner error={save.error ?? revoke.error} />
      <Button
        label={save.busy ? 'Saving…' : c ? 'Save permissions' : 'Agree and restore access'}
        disabled={save.busy || noneOn || (Boolean(c) && changed.length === 0)}
        onPress={() => save.run(perms)}
      />
      {c ? <Button label="Revoke all access" variant="danger" size="md" onPress={() => setConfirmRevoke(true)} /> : null}

      <Dialog visible={confirmRevoke} title="Revoke all access?" onRequestClose={() => setConfirmRevoke(false)}>
        <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink }}>
          BACI will stop analysing your data straight away. Home will be empty and Ask BACI won't use your accounts.
        </Text>
        <Muted style={{ fontSize: 13.5 }}>Your bank connections stay in place until you disconnect them in Accounts.</Muted>
        <Button
          label={revoke.busy ? 'Revoking…' : 'Revoke all access'}
          style={{ backgroundColor: colors.dangerFg }}
          disabled={revoke.busy}
          onPress={async () => {
            if ((await revoke.run()).ok) {
              setConfirmRevoke(false);
              router.replace('/home');
            }
          }}
        />
        <Button label="Cancel" variant="secondary" onPress={() => setConfirmRevoke(false)} />
      </Dialog>
    </Screen>
  );
}

function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={{ alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name="back" size={16} color={colors.primary} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.primary }}>Settings</Text>
    </Pressable>
  );
}
