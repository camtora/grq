import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePalette, F } from '../../constants/theme';
import SearchOverlay from '../../components/SearchOverlay';

export default function TabsLayout() {
  const { p } = usePalette();

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      // Back returns to the tab you CAME FROM (watchlist → stock → back →
      // watchlist) — the default is first-route, which dumped every stock-page
      // back onto Today (Cam 2026-07-04).
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.accent,
        tabBarInactiveTintColor: p.textMuted,
        tabBarLabelStyle: { fontFamily: F.med, fontSize: 10 },
        tabBarStyle: {
          backgroundColor: p.cardBg,
          borderTopColor: p.cardBorder,
        },
        sceneStyle: { backgroundColor: p.bodyBg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <Ionicons name="newspaper-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Portfolio',
          tabBarIcon: ({ color, size }) => <Ionicons name="pie-chart-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="wire"
        options={{
          title: 'The Wire',
          tabBarIcon: ({ color, size }) => <Ionicons name="flash-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="watchlist"
        options={{
          title: 'Watchlist',
          tabBarIcon: ({ color, size }) => <Ionicons name="eye-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal" color={color} size={size} />,
        }}
      />
      {/* The stock page lives INSIDE the tab navigator (hidden from the bar) so
          the bottom nav stays visible while reading a dossier (Cam 2026-07-03). */}
      <Tabs.Screen name="stock/[symbol]" options={{ href: null }} />
    </Tabs>
    {/* The jump-search floats over every tab (the web's round button) — Search
        left the tab bar for this; the freed slot is More (Cam 2026-07-03). */}
    <SearchOverlay />
    </View>
  );
}
