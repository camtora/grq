import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { usePalette, F } from '../constants/theme';

/** Company logo with monogram fallback (mirrors web components/StockLogo). */
export default function StockLogo({
  symbol,
  logoUrl,
  size = 32,
}: {
  symbol: string;
  logoUrl: string | null | undefined;
  size?: number;
}) {
  const { p } = usePalette();
  const [failed, setFailed] = useState(false);
  const radius = size / 4;

  if (!logoUrl || failed) {
    return (
      <View
        style={[
          styles.mono,
          { width: size, height: size, borderRadius: radius, backgroundColor: p.cardHi, borderColor: p.cardBorder },
        ]}
      >
        <Text style={{ color: p.accentText, fontFamily: F.bold, fontSize: size * 0.34 }}>
          {symbol.replace(/\..*$/, '').slice(0, 2)}
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: logoUrl }}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#ffffff' }}
    />
  );
}

const styles = StyleSheet.create({
  mono: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
