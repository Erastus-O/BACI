import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { BackButton, Button, Card, Chip, ErrorBanner, Muted, PageHeader, Row, Screen, Stack, StepBar, Strong } from '../../components/ui';
import { getProfile, patchOnboarding, peek, Profile as ProfileT, putProfile } from '../../services/api';
import { useMutation, useQuery } from '../../services/useQuery';
import { colors, fonts } from '../../theme';

type V<K extends keyof ProfileT> = NonNullable<ProfileT[K]>['value'];

const parseMoney = (s: string) => {
  const t = s.replace(/[£,\s]/g, '');
  if (!t) return { value: null, invalid: false };
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? { value: n, invalid: false } : { value: null, invalid: true };
};
const fmt = (n: number | undefined) => (n == null ? '' : n.toLocaleString('en-GB'));

// 03 Profile setup — /onboarding/profile (also "Edit profile" from S1)
export default function Profile() {
  const editing = peek.step() === 'done';
  const { data } = useQuery(getProfile);
  const [income, setIncome] = useState('');
  const [buffer, setBuffer] = useState('500');
  const [status, setStatus] = useState<V<'status'> | null>('Employed');
  const [goal, setGoal] = useState<V<'goal'> | null>('Build savings');
  const [risk, setRisk] = useState<V<'risk'>>('Balanced');
  const [frequency, setFrequency] = useState<V<'frequency'>>('Weekly');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!data || loaded) return;
    setLoaded(true);
    if (data.income) setIncome(fmt(data.income.value));
    if (data.buffer) setBuffer(fmt(data.buffer.value));
    if (data.status) setStatus(data.status.value);
    if (data.goal) setGoal(data.goal.value);
    if (data.risk) setRisk(data.risk.value);
    if (data.frequency) setFrequency(data.frequency.value);
  }, [data, loaded]);

  const inc = parseMoney(income);
  const buf = parseMoney(buffer);
  const invalid = inc.invalid || buf.invalid;

  const save = useMutation(async (skip: boolean) => {
    if (!skip) await putProfile({ income: inc.value, buffer: buf.value, status, goal, risk, frequency });
    if (!editing) await patchOnboarding('connect');
  });
  const next = async (skip: boolean) => {
    if (!(await save.run(skip)).ok) return;
    if (editing) router.back();
    else router.push({ pathname: '/onboarding/connect', params: { flow: 'onboarding' } });
  };

  const chips = <T extends string>(label: string, options: readonly T[], value: T | null, set: (v: T) => void, toggle = false) => (
    <Stack gap={10}>
      <Strong style={{ fontSize: 16 }}>{label}</Strong>
      <View accessibilityRole={toggle ? undefined : 'radiogroup'} accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => (
          <Chip key={o} label={o} selected={value === o} onPress={() => (toggle && value === o ? set(null as unknown as T) : set(o))} />
        ))}
      </View>
    </Stack>
  );

  return (
    <Screen>
      <Row gap={10}>
        <BackButton onPress={() => (editing ? router.back() : router.replace('/onboarding/consent'))} />
        {!editing ? (
          <View style={{ flex: 1 }}>
            <StepBar step={3} label="About you" />
          </View>
        ) : null}
      </Row>
      <PageHeader
        title={editing ? 'Your financial profile' : 'I’d love to know a little about you'}
        subtitle="This helps BACI understand your financial profile and shape answers that suit you."
      />

      <Card style={{ gap: 20, padding: 18 }}>
        <MoneyField
          id="income"
          label="Annual take-home income"
          value={income}
          onChange={setIncome}
          invalid={inc.invalid}
          hint="We show this alongside what we detect in your accounts, and never overwrite it."
        />
        {chips('Current status', ['Employed', 'Self-employed', 'Student', 'Other'] as const, status, setStatus, true)}
        {chips('Primary financial goal', ['Build savings', 'Pay off debt', 'Save for a home', 'Spend smarter'] as const, goal, setGoal, true)}
        {chips('Investment risk approach', ['Cautious', 'Balanced', 'Adventurous'] as const, risk, setRisk)}
        {chips('Insight frequency', ['Daily', 'Weekly', 'Monthly'] as const, frequency, setFrequency)}
        <MoneyField
          id="buffer"
          label="Safety buffer"
          value={buffer}
          onChange={setBuffer}
          invalid={buf.invalid}
          hint="The least you want left in your current accounts. “Can I afford this?” warns you before you dip below it."
        />
        <ErrorBanner error={save.error} />
        <Stack gap={6}>
          <Button label={save.busy ? 'Saving…' : editing ? 'Save profile' : 'Continue'} disabled={invalid || save.busy} onPress={() => next(false)} />
          {!editing ? <Button label="Skip for now" variant="ghost" size="md" disabled={save.busy} onPress={() => next(true)} /> : null}
        </Stack>
      </Card>
    </Screen>
  );
}

function MoneyField({ id, label, value, onChange, invalid, hint }: { id: string; label: string; value: string; onChange: (s: string) => void; invalid: boolean; hint: string }) {
  return (
    <Stack gap={6}>
      <Strong>{label}</Strong>
      <View>
        <Text style={{ position: 'absolute', left: 14, top: 13, fontFamily: fonts.body, fontSize: 16, color: colors.muted }}>£</Text>
        <TextInput
          nativeID={id}
          accessibilityLabel={`${label} in pounds`}
          aria-invalid={invalid}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          style={{
            height: 48,
            borderWidth: invalid ? 2 : 1,
            borderColor: invalid ? colors.dangerFg : colors.control,
            borderRadius: 10,
            backgroundColor: colors.surface,
            paddingLeft: 30,
            paddingRight: 14,
            fontFamily: fonts.body,
            fontSize: 16,
            color: colors.ink,
          }}
        />
      </View>
      {invalid ? (
        <Text accessibilityRole="alert" style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.dangerFg }}>
          Enter an amount in pounds, like 42,000.
        </Text>
      ) : (
        <Muted style={{ fontSize: 12.5 }}>{hint}</Muted>
      )}
    </Stack>
  );
}
