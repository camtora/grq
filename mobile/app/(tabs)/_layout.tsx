import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePalette } from '../../constants/theme';

export default function TabsLayout() {
  const { p } = usePalette();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.accent,
        tabBarInactiveTintColor: p.textMuted,
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
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
