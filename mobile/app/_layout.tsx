import React, { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import Splash from '../components/Splash';
import SignIn from '../components/SignIn';
import { usePalette } from '../constants/theme';
import { useAuth } from '../store/auth';
import { useMessages } from '../store/messages';
import { useNotifications } from '../store/notifications';
import { useThemeStore } from '../store/theme';
import { registerForPush } from '../services/push';
import { api } from '../services/api';
import GlossarySheet from '../components/GlossarySheet';

// The ID token's audience must match the backend's GRQ_IOS_GOOGLE_CLIENT_ID,
// so iosClientId only — no webClientId (that would flip the audience).
GoogleSignin.configure({
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

// Show pushes as banners even while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
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
  });

  const router = useRouter();

  // Hydration races the splash's intro phase; by the tap it's usually settled.
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
    hydrateTheme();
  }, [hydrate, hydrateTheme]);

  // Signed in → register this device for push (no-op on the simulator).
  useEffect(() => {
    if (status === 'signedIn') registerForPush();
  }, [status]);

  // Keep the header badges honest with the web (same server rows): refresh on
  // app-foreground + every 60s while signed in — so clearing on one surface
  // clears on the other within a minute, not just on navigation.
  const refreshMessages = useMessages((s) => s.refreshUnread);
  const refreshBell = useNotifications((s) => s.refreshUnread);
  useEffect(() => {
    if (status !== 'signedIn') return;
    const tick = () => {
      refreshMessages();
      refreshBell();
    };
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') tick();
    });
    const t = setInterval(tick, 60_000);
    return () => {
      sub.remove();
      clearInterval(t);
    };
  }, [status, refreshMessages, refreshBell]);

  // Tapping a push deep-links: a symbol lands on its stock page.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const symbol = res.notification.request.content.data?.symbol;
      if (typeof symbol === 'string' && symbol) router.push(`/stock/${symbol}`);
    });
    return () => sub.remove();
  }, [router]);

  // The usage beacon (web components/Tracker.tsx parity, 2026-07-04): every screen
  // change POSTs the pathname to /api/track, so app usage shows up on the Traffic
  // dashboard beside web usage. Identity resolves server-side from the Bearer;
  // fire-and-forget — a logging miss never surfaces. Consecutive repeats dedupe.
  const pathname = usePathname();
  const lastTracked = useRef<string | null>(null);
  useEffect(() => {
    if (status !== 'signedIn' || !pathname || pathname === lastTracked.current) return;
    lastTracked.current = pathname;
    api('/api/track', { method: 'POST', body: JSON.stringify({ path: pathname }) }).catch(() => {});
  }, [status, pathname]);

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
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="notification-settings" options={{ presentation: 'modal' }} />
        </Stack>
      )}
      {ready && splashDone && status !== 'signedIn' && <SignIn />}
      {(!ready || !splashDone) && <Splash done={() => setSplashDone(true)} />}
      {/* The tap-to-explain glossary sheet — mounted once; any [[term]] opens it. */}
      {ready && <GlossarySheet />}
    </View>
  );
}
