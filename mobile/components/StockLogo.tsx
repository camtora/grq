import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { usePalette, F } from '../constants/theme';
import { useLogoLight } from '../store/logolight';

// The chip colours are deliberately theme-stable (web StockLogo parity): the
// white chip is the default; a predominantly-light mark (NKE, ANET, BA…) flips
// to zinc-800 so it stays visible in BOTH themes. Verdicts come from the server
// (store/logolight — RN has no canvas to measure locally).
const CHIP_WHITE = '#ffffff';
const CHIP_DARK = '#27272a';

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
  const light = useLogoLight((s) => (logoUrl ? (s.verdicts[logoUrl] ?? false) : false));

  useEffect(() => {
    if (logoUrl) useLogoLight.getState().want(logoUrl);
  }, [logoUrl]);

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
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: light ? CHIP_DARK : CHIP_WHITE }}
    />
  );
}

const styles = StyleSheet.create({
  mono: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
