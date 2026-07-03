import React from 'react';
import { Text } from 'react-native';
import { usePalette, F } from '../constants/theme';
import { Screen, Card } from './Chrome';

/** Scaffold-phase screen stub — replaced page by page as each design lands. */
export default function Placeholder({ title, note }: { title: string; note: string }) {
  const { p } = usePalette();
  return (
    <Screen title={title}>
      <Card style={{ marginTop: 16 }}>
        <Text style={{ color: p.textMuted, fontFamily: F.reg, fontSize: 14, lineHeight: 20 }}>{note}</Text>
      </Card>
    </Screen>
  );
}
