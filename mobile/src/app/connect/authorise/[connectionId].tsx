import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Icon } from '../../../components/Icon';
import { OrbImage } from '../../../components/orb/OrbImage';
import { BankMark } from '../../../components/ui';
import { accountsFor } from '../../../data/banks';
import { Institution } from '../../../data/mock';
import { cacheDiscovered, useFlow } from '../../../features/flow';
import { sandboxEnabled } from '../../../features/sandbox';
import { ApiError, authorise, getConnection, SandboxOutcome } from '../../../services/api';
import { useQuery } from '../../../services/useQuery';
import { fonts } from '../../../theme';

// 04b Bank sign-in & approval — /connect/authorise/:connectionId?via=app|web
// Stand-in for the bank's own app (Open Banking app-to-app) or, as a fallback, its website.
// Deliberately in the BANK's colours, not BACI's.
//   via=app: BACI hands off → bank app (Face ID) → approve → back to BACI
//   via=web: the bank's hosted pages in a browser sheet → sign in → approve
type Phase = 'handoff' | 'unlock' | 'scanning' | 'sign_in' | 'approve' | 'returning';

export default function BankAuthorise() {
  const { connectionId, via: viaParam } = useLocalSearchParams<{ connectionId: string; via?: string }>();
  const via = viaParam === 'web' ? 'web' : 'app';
  const flow = useFlow();
  const conn = useQuery(() => getConnection(connectionId), [connectionId]);
  const [phase, setPhase] = useState<Phase>(via === 'app' ? 'handoff' : 'sign_in');
  const [busy, setBusy] = useState(false);
  const [sandbox, setSandbox] = useState<SandboxOutcome | undefined>();

  // The phone switching apps, then Face ID: short, timed steps.
  useEffect(() => {
    const next: Partial<Record<Phase, [Phase, number]>> = { handoff: ['unlock', 1100], scanning: ['approve', 900] };
    const n = next[phase];
    if (!n) return;
    const t = setTimeout(() => setPhase(n[0]), n[1]);
    return () => clearTimeout(t);
  }, [phase]);

  const bank = conn.data?.institution;
  if (!bank) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
        {conn.error ? <Text style={s.p}>This approval link is no longer valid.</Text> : <ActivityIndicator />}
      </SafeAreaView>
    );
  }
  const brand = bank.brandColour;
  const accounts = accountsFor(bank.id);

  const submit = async (approved: boolean) => {
    setBusy(true);
    let target: Parameters<typeof router.replace>[0];
    try {
      const r = await authorise(connectionId, approved, sandbox);
      cacheDiscovered(connectionId, r.discovered);
      target = { pathname: r.reauth ? '/connect/[id]/sync' : '/connect/[id]/found', params: { id: connectionId, flow } };
    } catch (e) {
      const d = (e instanceof ApiError ? e.details : undefined) ?? {};
      target = {
        pathname: '/connect/failed',
        params: {
          reason: String(d.reason ?? 'bank_unavailable'),
          institution: String(d.institutionId ?? bank.id),
          name: String(d.institutionName ?? bank.name),
          flow,
          ...(d.reauth ? { reconnect: connectionId } : {}),
        },
      };
    } finally {
      setBusy(false);
    }
    if (via === 'app') {
      // The bank app hands back to BACI (the redirect / universal link).
      setPhase('returning');
      setTimeout(() => router.replace(target), 800);
    } else {
      router.replace(target);
    }
  };

  if (phase === 'handoff' || phase === 'returning') return <Switching bank={bank} toBank={phase === 'handoff'} />;

  const approve = (
    <>
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={s.h1}>Share your account information with BACI?</Text>
        <Text style={s.p}>
          BACI will get read-only access until <Text style={{ fontFamily: fonts.bold }}>25 Dec 2026</Text>.
        </Text>
      </View>
      <View style={s.box}>
        <Text style={s.boxTitle}>Information shared</Text>
        {['Account details', 'Balances', 'Transactions', 'Direct debits and standing orders'].map((t) => (
          <Text key={t} style={s.li}>• {t}</Text>
        ))}
      </View>
      <View style={s.box}>
        <Text style={s.boxTitle}>Accounts</Text>
        {accounts.map((a) => (
          <View key={a.providerAccountId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={s.li}>{a.name}</Text>
            <Text style={[s.li, { color: '#4A5A5E' }]}>••{a.mask}</Text>
          </View>
        ))}
      </View>
      <Text style={[s.p, { fontSize: 13 }]}>You can withdraw access in the {bank.name} app or in BACI at any time.</Text>
      {sandboxEnabled ? <SandboxPanel value={sandbox} onChange={setSandbox} /> : null}
      <View style={{ flex: 1 }} />
      <BankButton label={busy ? 'Approving…' : 'Approve'} brand={brand} disabled={busy} onPress={() => submit(true)} />
      <BankButton label="Don't allow" brand={brand} variant="outline" disabled={busy} onPress={() => submit(false)} />
    </>
  );

  // ---------- In the bank's app ----------
  if (via === 'app') {
    if (phase === 'unlock' || phase === 'scanning') {
      const scanning = phase === 'scanning';
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: brand }}>
          <View style={{ flex: 1, padding: 24, gap: 18, alignItems: 'center', justifyContent: 'center' }}>
            <BankMark initial={bank.initial} colour={brand} logo={bank.logo} size={72} />
            <Text style={{ color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 24 }}>{bank.name}</Text>
            <Text style={{ color: '#FFFFFF', opacity: 0.85, fontFamily: fonts.body, fontSize: 15, textAlign: 'center' }}>
              You're in {bank.name}, not BACI. BACI is asking to view your accounts.
            </Text>
            <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
              <View style={{ width: 96, height: 96, borderRadius: 28, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' }}>
                {scanning ? <ActivityIndicator color="#FFFFFF" size="large" /> : <Icon name="faceId" size={50} color="#FFFFFF" strokeWidth={1.6} />}
              </View>
              <Text style={{ color: '#FFFFFF', fontFamily: fonts.medium, fontSize: 14 }}>{scanning ? 'Checking it’s you…' : 'Face ID, fingerprint or passcode'}</Text>
            </View>
          </View>
          <View style={{ padding: 20, gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              disabled={scanning}
              onPress={() => setPhase('scanning')}
              style={({ pressed }) => ({ height: 54, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', opacity: pressed || scanning ? 0.75 : 1 })}
            >
              <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: brand }}>Unlock with Face ID</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy || scanning} onPress={() => submit(false)} style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: '#FFFFFF' }}>Cancel and return to BACI</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['bottom']}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: brand }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <BankMark initial={bank.initial} colour={brand} logo={bank.logo} size={30} />
              <Text style={{ color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 18, flex: 1 }}>{bank.name}</Text>
              <Icon name="faceId" size={18} color="#FFFFFF" strokeWidth={2} />
            </View>
            <Text style={{ color: '#FFFFFF', opacity: 0.9, fontSize: 13, fontFamily: fonts.body }}>Signed in with Face ID · You're in {bank.name}, not BACI</Text>
          </View>
        </SafeAreaView>
        <ScrollView contentContainerStyle={[s.body, { flexGrow: 1 }]}>{approve}</ScrollView>
      </SafeAreaView>
    );
  }

  // ---------- On the bank's website (no app installed) ----------
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['bottom']}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#F2F2F4' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: '#0A64D8' }}>Done</Text>
          <View style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3E3E8', borderRadius: 10, height: 34 }}>
            <Icon name="lock" size={12} color="#5A5A60" strokeWidth={2} />
            <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: '#1C1C1E' }}>{domainOf(bank)}</Text>
          </View>
        </View>
      </SafeAreaView>
      <View style={{ backgroundColor: brand, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {bank.logo ? (
              <BankMark initial={bank.initial} colour={brand} logo={bank.logo} size={30} />
            ) : (
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: brand, fontFamily: fonts.bold }}>{bank.initial}</Text>
              </View>
            )}
            <Text style={{ color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 18 }}>{bank.name}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', opacity: 0.85 }}>
            <Icon name="lock" size={13} color="#FFFFFF" strokeWidth={2} />
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontFamily: fonts.body }}>Secure</Text>
          </View>
        </View>
        <Text style={{ color: '#FFFFFF', opacity: 0.9, fontSize: 13, fontFamily: fonts.body }}>
          Step {phase === 'sign_in' ? 1 : 2} of 2 · You're in {bank.name}, not BACI
        </Text>
      </View>

      <ScrollView contentContainerStyle={[s.body, { flexGrow: 1 }]}>
        {phase === 'sign_in' ? (
          <>
            <View style={{ gap: 6 }}>
              <Text accessibilityRole="header" style={s.h1}>Confirm it's you</Text>
              <Text style={s.p}>BACI has asked to view your {bank.name} accounts. Sign in the way you normally do.</Text>
            </View>
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
              <View style={{ width: 84, height: 84, borderRadius: 24, borderWidth: 2, borderColor: brand, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="faceId" size={44} color={brand} strokeWidth={1.6} />
              </View>
              <Text style={[s.p, { fontSize: 14 }]}>Face ID, fingerprint or passcode</Text>
            </View>
            <View style={{ flex: 1 }} />
            <BankButton label="Sign in" brand={brand} onPress={() => setPhase('approve')} />
            <BankButton label="Cancel and return to BACI" brand={brand} variant="link" disabled={busy} onPress={() => submit(false)} />
          </>
        ) : (
          approve
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const domainOf = (bank: Institution) => `${bank.name.toLowerCase().replace(/\(.*\)|\b(bank|plc|uk|personal|the)\b/g, '').replace(/[^a-z]/g, '') || 'bank'}.co.uk`;

/** The phone switching between BACI and the bank's app (Open Banking app-to-app). */
function Switching({ bank, toBank }: { bank: Institution; toBank: boolean }) {
  return (
    <SafeAreaView accessibilityLiveRegion="polite" style={{ flex: 1, backgroundColor: '#05060F', alignItems: 'center', justifyContent: 'center', gap: 22, padding: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {toBank ? <OrbImage size={56} interactive={false} /> : <BankMark initial={bank.initial} colour={bank.brandColour} logo={bank.logo} size={56} />}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' }} />
          ))}
        </View>
        {toBank ? <BankMark initial={bank.initial} colour={bank.brandColour} logo={bank.logo} size={56} /> : <OrbImage size={56} interactive={false} />}
      </View>
      <ActivityIndicator color="#FFFFFF" />
      <Text accessibilityRole="header" style={{ color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 20, textAlign: 'center' }}>
        {toBank ? `Opening ${bank.name}…` : 'Returning to BACI…'}
      </Text>
      <Text style={{ color: 'rgba(226,232,255,0.7)', fontFamily: fonts.body, fontSize: 14, textAlign: 'center', maxWidth: 280 }}>
        {toBank ? 'You’ll approve in your bank’s own app. BACI never sees your login.' : `${bank.name} has sent you back. Nothing else is shared.`}
      </Text>
    </SafeAreaView>
  );
}

/** Dev only (spec §04b): preview failure outcomes from the sandbox bank. */
function SandboxPanel({ value, onChange }: { value?: SandboxOutcome; onChange: (v?: SandboxOutcome) => void }) {
  const opts: { v?: SandboxOutcome; label: string }[] = [
    { v: undefined, label: 'Normal' },
    { v: 'one_account_fails', label: 'One account fails' },
    { v: 'timed_out', label: 'Link expires' },
    { v: 'bank_unavailable', label: 'Bank not responding' },
  ];
  return (
    <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#8A8F99', borderRadius: 12, padding: 12, gap: 8 }}>
      <Text style={[s.boxTitle, { fontSize: 13 }]}>Sandbox outcomes (dev only)</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {opts.map((o) => {
          const on = value === o.v;
          return (
            <Pressable
              key={o.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => onChange(o.v)}
              style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 999, justifyContent: 'center', borderWidth: 1, borderColor: on ? '#10262A' : '#D5E2E4', backgroundColor: on ? '#10262A' : '#FFFFFF' }}
            >
              <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: on ? '#FFFFFF' : '#10262A' }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function BankButton({ label, brand, onPress, variant = 'solid', disabled }: { label: string; brand: string; onPress: () => void; variant?: 'solid' | 'outline' | 'link'; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        height: variant === 'solid' ? 52 : 48,
        borderRadius: 12,
        backgroundColor: variant === 'solid' ? brand : 'transparent',
        borderWidth: variant === 'outline' ? 1 : 0,
        borderColor: brand,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed || disabled ? 0.7 : 1,
      })}
    >
      <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: variant === 'solid' ? '#FFFFFF' : brand }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 20, gap: 16 },
  h1: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 29, color: '#10262A' },
  p: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: '#4A5A5E' },
  box: { borderWidth: 1, borderColor: '#D5E2E4', borderRadius: 12, padding: 14, gap: 8 },
  boxTitle: { fontFamily: fonts.semibold, fontSize: 14.5, color: '#10262A' },
  li: { fontFamily: fonts.body, fontSize: 14.5, color: '#10262A' },
});
