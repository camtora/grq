import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { usePalette, brandAccent } from '../constants/theme';
import { useAuth } from '../store/auth';

/** The door — mirror of ios/GRQ/Views/SignIn.swift. Members-only, one button. */
export default function SignIn() {
  const { p, scheme } = usePalette();
  const { signInWithGoogle, signingIn, error } = useAuth();

  const logo = scheme === 'dark'
    ? require('../assets/grq-logo.png')
    : require('../assets/grq-logo-light.png');

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: p.bodyBg }]}>
      {/* Soft accent washes, like the native ScreenBackground. */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="glowTop" cx="30%" cy="12%" r="55%">
            <Stop offset="0" stopColor={p.accent} stopOpacity={scheme === 'dark' ? 0.16 : 0.09} />
            <Stop offset="1" stopColor={p.accent} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="glowBottom" cx="80%" cy="95%" r="55%">
            <Stop offset="0" stopColor={p.accent} stopOpacity={scheme === 'dark' ? 0.1 : 0.05} />
            <Stop offset="1" stopColor={p.accent} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#glowTop)" />
        <Rect width="100%" height="100%" fill="url(#glowBottom)" />
      </Svg>

      <View style={styles.body}>
        <View style={styles.top}>
          <Image source={logo} style={styles.logo} resizeMode="contain" />
          <Text style={[styles.tagline, { color: p.textMuted }]}>
            Get rich quick, slowly, with receipts.
          </Text>
        </View>

        <View style={styles.bottom}>
          <Text style={[styles.invite, { color: p.textMuted }]}>
            GRQ is invite-only — Cam & Graham.
          </Text>
          <Pressable
            onPress={signInWithGoogle}
            disabled={signingIn}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: brandAccent, opacity: pressed || signingIn ? 0.7 : 1 },
            ]}
          >
            {signingIn ? (
              <ActivityIndicator color="#04211d" />
            ) : (
              <Text style={styles.buttonLabel}>Sign in with Google</Text>
            )}
          </Pressable>
          {error ? (
            <Text style={[styles.footnote, { color: p.neg }]}>{error}</Text>
          ) : (
            <Text style={[styles.footnote, { color: p.textMuted, opacity: 0.6 }]}>
              Bearer-JWT sessions, signed by the GRQ backend.
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: 28, justifyContent: 'space-between' },
  top: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  logo: {
    height: 56,
    width: 260,
    shadowColor: brandAccent,
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  tagline: { fontSize: 15, textAlign: 'center' },
  bottom: { alignItems: 'center', gap: 12, paddingBottom: 20 },
  invite: { fontSize: 13 },
  button: {
    minWidth: 220,
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  buttonLabel: { color: '#04211d', fontSize: 16, fontWeight: '700' },
  footnote: { fontSize: 11, textAlign: 'center', paddingHorizontal: 16 },
});
