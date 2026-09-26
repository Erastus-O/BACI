import { ColorValue } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../../components/Icon';
import { stepRoute } from '../../features/flow';
import { peek } from '../../services/api';
import { useServerVersion } from '../../services/useQuery';
import { colors, fonts } from '../../theme';

const icon =
  (name: IconName) =>
  ({ color }: { color: ColorValue }) => <Icon name={name} size={22} color={String(color)} />;

/** Guard: product routes need onboarding.step === 'done'; otherwise go to the current step. */
export default function TabsLayout() {
  useServerVersion();
  const insets = useSafeAreaInsets();
  const step = peek.step();
  if (step !== 'done') return <Redirect href={stepRoute[step]} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        // Explicit height and line height so labels aren't clipped (with the home-indicator inset).
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 58 + insets.bottom, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
        sceneStyle: { backgroundColor: colors.ground },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="chat" options={{ title: 'Ask BACI', tabBarIcon: icon('chat') }} />
      <Tabs.Screen name="accounts" options={{ title: 'Accounts', tabBarIcon: icon('wallet') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings') }} />
    </Tabs>
  );
}
