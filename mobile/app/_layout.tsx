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
import { routeForNotification } from '../lib/notification-routes';
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

  // Tapping a push deep-links — dest/category rules first, then symbol → stock
  // page (lib/notification-routes; fx opens Settings even though it carries a
  // symbol). Two iOS gotchas handled here (Cam 2026-07-04 — the TSM test push
  // opened Today):
  // 1. Remote-push custom keys arrive in request.trigger.payload on iOS, not
  //    always content.data — read both (content.data wins).
  // 2. A tap that COLD-STARTS the app fires before the navigator (and the
  //    tap-through splash) exist — so the route is parked in state and the
  //    navigation happens once the app is actually ready.
  const [pendingPushPath, setPendingPushPath] = useState<string | null>(null);
  const handledPushId = useRef<string | null>(null);
  const routeOf = (res: Notifications.NotificationResponse | null): string | null => {
    if (!res) return null;
    const req = res.notification.request;
    const trigger = req.trigger as { payload?: Record<string, unknown> } | null;
    const merged: Record<string, unknown> = { ...(trigger?.payload ?? {}), ...(req.content.data ?? {}) };
    const str = (k: string): string | null => (typeof merged[k] === 'string' && merged[k] ? (merged[k] as string) : null);
    return routeForNotification({ category: str('category'), symbol: str('symbol'), dest: str('dest') });
  };
  const takeResponse = (res: Notifications.NotificationResponse | null) => {
    if (!res || handledPushId.current === res.notification.request.identifier) return;
    const path = routeOf(res);
    if (!path) return;
    handledPushId.current = res.notification.request.identifier;
    setPendingPushPath(path);
  };
  useEffect(() => {
    // Warm/background taps.
    const sub = Notifications.addNotificationResponseReceivedListener(takeResponse);
    // The cold-start tap — the launching notification never hits the listener.
    Notifications.getLastNotificationResponseAsync().then(takeResponse).catch(() => {});
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!pendingPushPath || !fontsLoaded || !splashDone || status !== 'signedIn') return;
    const path = pendingPushPath;
    setPendingPushPath(null);
    router.push(path);
  }, [pendingPushPath, fontsLoaded, splashDone, status, router]);

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
