import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { Button, ErrorBanner, Loading, Muted, PageHeader, Screen } from '../components/ui';
import { resumeAfterOAuth } from '../features/connectLive';
import { pendingOAuthReturn } from '../features/plaidLink';

// /oauth — where a bank sends the person back after approving (web). Register this URL as
// PLAID_REDIRECT_URI_WEB on the server and in the Plaid dashboard.
export default function OAuthReturn() {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const ctx = pendingOAuthReturn();
    if (Platform.OS !== 'web' || !ctx) {
      router.replace('/');
      return;
    }
    resumeAfterOAuth(ctx, window.location.href)
      .then((ok) => {
        if (!ok) router.replace(ctx.flow === 'accounts' ? '/accounts' : '/onboarding/connect');
      })
      .catch((e) => setError(e as Error));
  }, []);

  return (
    <Screen footer={error ? <Button label="Back to BACI" onPress={() => router.replace('/')} /> : undefined}>
      <PageHeader title="Finishing up with your bank" subtitle="Your bank has sent you back to BACI." />
      {error ? <ErrorBanner error={error} /> : <Loading label="Confirming access with your bank" />}
      <Muted style={{ fontSize: 12.5 }}>BACI never sees your bank login.</Muted>
    </Screen>
  );
}
