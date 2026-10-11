import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BackButton, Button, Card, ErrorBanner, Muted, PageHeader, Screen, Stack, Strong } from '../components/ui';
import { stepRoute } from '../features/flow';
import { peek, signIn, signUp } from '../services/api';
import { useMutation } from '../services/useQuery';
import { colors, fonts, glass, radius } from '../theme';

// Sign up / sign in — /auth?mode=signin. Your data is tied to your BACI account, on BACI's server.
export default function Auth() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'signup' | 'signin'>(params.mode === 'signin' ? 'signin' : 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const go = useMutation(async () => (mode === 'signup' ? signUp(email, password) : signIn(email, password)));
  const signup = mode === 'signup';

  const submit = async () => {
    if ((await go.run()).ok) router.replace(stepRoute[peek.step()]);
  };

  return (
    <Screen
      footer={
        <>
          <ErrorBanner error={go.error} />
          <Button label={go.busy ? 'One moment…' : signup ? 'Create account' : 'Sign in'} disabled={go.busy || !email || !password} onPress={submit} />
          <Button
            label={signup ? 'I already have an account' : 'Create a new account'}
            variant="ghost"
            size="md"
            onPress={() => {
              go.clearError();
              setMode(signup ? 'signin' : 'signup');
            }}
          />
        </>
      }
    >
      <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))} />
      <PageHeader
        title={signup ? 'Create your BACI account' : 'Welcome back'}
        subtitle={signup ? 'Your consent, profile and bank connections are saved to your account, so you can pick up on any device.' : 'Sign in to see your accounts and ask BACI.'}
      />
      <Card style={{ gap: 14 }}>
        <Field label="Email" value={email} onChange={setEmail} autoComplete="email" keyboardType="email-address" />
        <Field
          label="Password"
          value={password}
          onChange={setPassword}
          secure
          autoComplete={signup ? 'new-password' : 'current-password'}
          hint={signup ? 'At least 10 characters.' : undefined}
          onSubmit={submit}
        />
      </Card>
      <Stack gap={6}>
        <Muted style={{ fontSize: 12.5 }}>
          Your bank login is never shared with BACI: you approve access at your bank, through Plaid, and can revoke it at any time. You can delete your account and all your data in Settings.
        </Muted>
        <Muted style={{ fontSize: 12 }}>BACI provides information, not regulated financial advice.</Muted>
      </Stack>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  secure,
  hint,
  autoComplete,
  keyboardType,
  onSubmit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
  hint?: string;
  autoComplete?: 'email' | 'new-password' | 'current-password';
  keyboardType?: 'email-address';
  onSubmit?: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Strong>{label}</Strong>
      <View>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          secureTextEntry={secure && !show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          keyboardType={keyboardType}
          onSubmitEditing={onSubmit}
          placeholderTextColor={colors.muted}
          style={{ ...glass, height: 50, borderRadius: radius.md, paddingHorizontal: 14, paddingRight: secure ? 64 : 14, fontFamily: fonts.body, fontSize: 16, color: colors.ink }}
        />
        {secure ? (
          <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'} onPress={() => setShow(!show)} style={{ position: 'absolute', right: 6, top: 3, height: 44, paddingHorizontal: 10, justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.primary }}>{show ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : null}
      </View>
      {hint ? <Muted style={{ fontSize: 12.5 }}>{hint}</Muted> : null}
    </View>
  );
}
