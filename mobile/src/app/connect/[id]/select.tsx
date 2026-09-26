import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Checkbox, ErrorBanner, Eyebrow, H1, Muted, Screen, Stack, StepBar, Strong } from '../../../components/ui';
import { kindLabel } from '../../../data/mock';
import { pickerPath, readDiscovered, useFlow } from '../../../features/flow';
import { DiscoveredAccount, getConnection, selectAccounts } from '../../../services/api';
import { useMutation, useQuery } from '../../../services/useQuery';
import { colors } from '../../../theme';

// 05 Choose accounts — /connect/:id/select
export default function SelectAccounts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const flow = useFlow();
  const conn = useQuery(() => getConnection(id), [id]);
  const discovered = readDiscovered<DiscoveredAccount[]>(id);
  const selectable = (discovered ?? []).filter((a) => !a.duplicateOf);
  const dupes = (discovered ?? []).filter((a) => a.duplicateOf);
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(selectable.map((a) => [a.providerAccountId, true])));
  const save = useMutation(selectAccounts);
  const picked = selectable.filter((a) => on[a.providerAccountId]).map((a) => a.providerAccountId);
  const count = picked.length;
  const allOn = count === selectable.length;

  if (!discovered) {
    // Discovery cache missing (e.g. app restarted mid-flow).
    return (
      <Screen footer={<Button label="Start again" onPress={() => router.replace({ pathname: pickerPath(flow), params: { flow } })} />}>
        <View style={{ paddingTop: 56 }} />
        <H1>We lost track of your accounts</H1>
        <Banner tone="warn">The list of accounts from your bank has expired. Start again to fetch it — nothing has been shared yet.</Banner>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <ErrorBanner error={save.error} />
          {count > 0 ? (
            <Button
              label={save.busy ? 'Saving…' : count === 1 ? 'Use 1 account' : `Use ${count} accounts`}
              disabled={save.busy}
              onPress={async () => {
                if ((await save.run(id, picked)).ok) router.replace({ pathname: '/connect/[id]/sync', params: { id, flow } });
              }}
            />
          ) : (
            <Button label="Select at least one account" disabled />
          )}
        </>
      }
    >
      <View style={{ paddingTop: 56 }}>{flow === 'onboarding' ? <StepBar step={4} /> : null}</View>
      <Stack gap={6}>
        <Eyebrow style={{ fontSize: 13 }}>{conn.data?.institution.name ?? ''}</Eyebrow>
        <H1>Choose accounts</H1>
        <Muted>
          We found {discovered.length} account{discovered.length === 1 ? '' : 's'}. BACI will only analyse the ones you tick.
        </Muted>
      </Stack>
      <Stack gap={8}>
        {selectable.length > 1 ? (
          <CheckRow checked={allOn} onPress={() => setOn(Object.fromEntries(selectable.map((a) => [a.providerAccountId, !allOn])))} title="Select all" />
        ) : null}
        {selectable.map((a) => (
          <CheckRow
            key={a.providerAccountId}
            checked={!!on[a.providerAccountId]}
            onPress={() => setOn({ ...on, [a.providerAccountId]: !on[a.providerAccountId] })}
            title={a.name}
            detail={`${kindLabel[a.kind]} ••${a.mask}`}
          />
        ))}
        {dupes.map((a) => (
          <CheckRow key={a.providerAccountId} checked={false} disabled title={a.name} detail={`${kindLabel[a.kind]} ••${a.mask} · already connected via ${a.duplicateOf}`} />
        ))}
      </Stack>
      <Banner tone="info">Duplicates are detected automatically, so an account is never counted twice. You can change this later in Accounts.</Banner>
    </Screen>
  );
}

function CheckRow({ checked, onPress, title, detail, disabled }: { checked: boolean; onPress?: () => void; title: string; detail?: string; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      disabled={disabled}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 56, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface, opacity: disabled ? 0.65 : 1 }}
    >
      <Checkbox checked={checked} disabled={disabled} />
      <View style={{ flex: 1 }}>
        <Strong>{title}</Strong>
        {detail ? <Muted style={{ fontSize: 13 }}>{detail}</Muted> : null}
      </View>
    </Pressable>
  );
}
