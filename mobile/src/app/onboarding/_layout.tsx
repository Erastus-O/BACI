import { Redirect, Stack, usePathname } from 'expo-router';
import { liveAvailable, peek } from '../../services/api';
import { useServerVersion } from '../../services/useQuery';
import { colors } from '../../theme';

/** Guard: no step after 02 without consent. Finished users go to the product. */
export default function OnboardingLayout() {
  useServerVersion();
  const path = usePathname();
  // Builds with a server: onboarding happens in a signed-in account (sample data skips it).
  if (liveAvailable && peek.mode() === 'demo' && peek.step() !== 'done') return <Redirect href="/welcome" />;
  if (peek.step() === 'done' && !['/onboarding/profile', '/onboarding/insight'].includes(path)) return <Redirect href="/home" />;
  if (!peek.hasConsent() && path !== '/onboarding/consent') return <Redirect href="/onboarding/consent" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }} />;
}
