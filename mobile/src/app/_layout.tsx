import { useEffect } from 'react';
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

  useEffect(() => {
    if (loaded || fontError) SplashScreen.hideAsync();
  }, [loaded, fontError]);

  if (!loaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <DeviceFrame>
      <AgentChatProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
          <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
        </Stack>
      </AgentChatProvider>
      </DeviceFrame>
    </SafeAreaProvider>
  );
}
