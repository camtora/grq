import React from 'react';
import { Stack } from 'expo-router';
import { usePalette } from '../../../constants/theme';

/** More is a nested stack inside its tab — pushes keep the bottom bar. */
export default function MoreLayout() {
  const { p } = usePalette();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: p.bodyBg },
      }}
    />
  );
}
