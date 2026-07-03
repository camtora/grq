import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import MoneyRain from './MoneyRain';
import { usePalette } from '../constants/theme';

/**
 * The GRQ splash — ported from ios/GRQ/Views/Splash.swift.
 * Intro (money rain + logo + pulsing "Tap to continue", faces at the bottom)
 * → tap → cross-fade to the welcome greeting (rain keeps falling) → auto-advance
 * after a beat; a tap during the welcome skips the wait.
 */
export default function Splash({ done }: { done: () => void }) {
  const { p, scheme } = usePalette();
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<'intro' | 'welcome'>('intro');
  const dismissed = useRef(false);

  // Pulsing "Tap to continue" hint.
  const hint = useSharedValue(0.35);
  useEffect(() => {
    hint.value = withRepeat(withTiming(1, { duration: 1100 }), -1, true);
  }, [hint]);
  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value }));

  // Scrim + content cross-fade on phase change.
  const welcome = useSharedValue(0);
  const scrimStyle = useAnimatedStyle(() => ({ opacity: welcome.value }));
  const introStyle = useAnimatedStyle(() => ({ opacity: 1 - welcome.value }));
  const welcomeStyle = useAnimatedStyle(() => ({ opacity: welcome.value }));

  const finish = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    done();
  };

  const onTap = () => {
    if (phase === 'intro') {
      setPhase('welcome');
      welcome.value = withTiming(1, { duration: 500 });
      setTimeout(finish, 1900); // 0.5s fade + the 1.4s beat from the native app
    } else {
      finish();
    }
  };

  const logo = scheme === 'dark'
    ? require('../assets/grq-logo.png')
    : require('../assets/grq-logo-light.png');

  return (
    <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: p.bodyBg }]} onPress={onTap}>
      <MoneyRain reduceMotion={reduceMotion} />

      {/* Soft radial scrim so the greeting stays legible over the rain (welcome phase). */}
      <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="scrim" cx="50%" cy="50%" r="55%">
              <Stop offset="0" stopColor={p.bodyBg} stopOpacity="0.88" />
              <Stop offset="1" stopColor={p.bodyBg} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#scrim)" />
        </Svg>
      </Animated.View>

      <View style={styles.center} pointerEvents="none">
        <Image source={logo} style={styles.logo} resizeMode="contain" />
        <View style={styles.phaseSlot}>
          {phase === 'intro' ? (
            <Animated.Text style={[styles.hint, { color: p.textMuted }, hintStyle]}>
              Tap to continue
            </Animated.Text>
          ) : (
            <Animated.View style={[styles.welcomeBlock, welcomeStyle]}>
              <Text style={[styles.welcomeLine, { color: p.textPrimary }]}>Welcome back.</Text>
              <Text style={[styles.subtitle, { color: p.textMuted }]}>Rich quick, slowly.</Text>
            </Animated.View>
          )}
        </View>
      </View>

      {/* Our faces + credit — pinned to the bottom during the intro. */}
      {phase === 'intro' && (
        <Animated.View style={[styles.credit, introStyle]} pointerEvents="none">
          <View style={styles.avatarRow}>
            <MemberAvatar source={require('../assets/people/cam.png')} bg={p.bodyBg} ring={p.accent} />
            <MemberAvatar source={require('../assets/people/graham.png')} bg={p.bodyBg} ring={p.accent} overlap />
          </View>
          <Text style={[styles.creditText, { color: p.textMuted }]}>Created by{'\n'}Cam & Graham</Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

function MemberAvatar({ source, bg, ring, overlap }: { source: number; bg: string; ring: string; overlap?: boolean }) {
  return (
    <View style={[styles.avatarWrap, { borderColor: bg }, overlap && { marginLeft: -12 }]}>
      <Image source={source} style={[styles.avatar, { borderColor: ring + '73' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 32 },
  logo: {
    height: 60,
    width: 279, // 687×148 source, scaled to h60
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  phaseSlot: { marginTop: 16, minHeight: 64, alignItems: 'center', justifyContent: 'flex-start' },
  hint: { fontSize: 13, fontWeight: '600' },
  welcomeBlock: { alignItems: 'center', gap: 8 },
  welcomeLine: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  subtitle: { fontSize: 15 },
  credit: { position: 'absolute', bottom: 44, left: 0, right: 0, alignItems: 'center', gap: 8 },
  avatarRow: { flexDirection: 'row' },
  avatarWrap: { borderWidth: 2.5, borderRadius: 25, overflow: 'hidden' },
  avatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 1 },
  creditText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
