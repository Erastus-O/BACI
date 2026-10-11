import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AgentChatProvider } from '../agent/AgentChat';
import { DeviceFrame } from '../components/DeviceFrame';
import { refresh, restoreSession } from '../services/api';
import { colors } from '../theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  });

  // Resume a signed-in session before the first route renders, so guards see the real state.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    restoreSession().finally(() => setRestored(true));
    // New transactions arrive by webhook while the app is closed; pick them up on return.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh().catch(() => {}));
    return () => sub.remove();
  }, []);

  const ready = (loaded || Boolean(fontError)) && restored;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <DeviceFrame>
      <AgentChatProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
          <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
        </Stack>
      </AgentChatProvider>
      </DeviceFrame>
    </SafeAreaProvider>
  );
}
