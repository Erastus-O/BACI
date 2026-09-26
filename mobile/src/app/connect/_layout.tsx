import { Redirect, Stack } from 'expo-router';
import { peek } from '../../services/api';
import { useServerVersion } from '../../services/useQuery';
import { colors } from '../../theme';

/** Guard: connecting a bank needs active consent. */
export default function ConnectLayout() {
  useServerVersion();
  if (!peek.hasConsent()) return <Redirect href={peek.step() === 'done' ? '/home' : '/onboarding/consent'} />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
      <Stack.Screen name="authorise/[connectionId]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
