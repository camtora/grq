import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import Splash from '../components/Splash';
import SignIn from '../components/SignIn';
import { usePalette } from '../constants/theme';
import { useAuth } from '../store/auth';

// The ID token's audience must match the backend's GRQ_IOS_GOOGLE_CLIENT_ID,
// so iosClientId only — no webClientId (that would flip the audience).
GoogleSignin.configure({
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

export default function RootLayout() {
  const { p, scheme } = usePalette();
  const [splashDone, setSplashDone] = useState(false);
  const { status, hydrate } = useAuth();

  // Fonts bundle locally (@expo-google-fonts) so this resolves fast and offline;
  // the splash covers the load either way.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  // Hydration races the splash's intro phase; by the tap it's usually settled.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const ready = fontsLoaded;

  return (
    <View style={{ flex: 1, backgroundColor: p.bodyBg }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {ready && (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: p.bodyBg },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="notifications" options={{ presentation: 'modal' }} />
          <Stack.Screen name="messages" options={{ presentation: 'modal' }} />
          <Stack.Screen name="chat" options={{ presentation: 'modal' }} />
        </Stack>
      )}
      {ready && splashDone && status !== 'signedIn' && <SignIn />}
      {(!ready || !splashDone) && <Splash done={() => setSplashDone(true)} />}
    </View>
  );
}
