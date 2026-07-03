import React, { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Splash from '../components/Splash';
import { usePalette } from '../constants/theme';

export default function RootLayout() {
  const { p } = usePalette();
  const [splashDone, setSplashDone] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: p.bodyBg }}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: p.bodyBg },
        }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
      {!splashDone && <Splash done={() => setSplashDone(true)} />}
    </View>
  );
}
