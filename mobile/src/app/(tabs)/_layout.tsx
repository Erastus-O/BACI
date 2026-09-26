import { ColorValue } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
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
  const step = peek.step();
  if (step !== 'done') return <Redirect href={stepRoute[step]} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
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
