import React, { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Full-page "make it rain" — a faithful port of MoneyRainView from
 * ios/GRQ/Views/Splash.swift: ~46 bills in two depth layers (near = big/opaque,
 * far = small/faint), spanning edge to edge, tumbling continuously.
 */
type Bill = {
  x: number;
  size: number;
  speed: number;
  offset: number;
  sway: number;
  spin: number;
  phase: number;
  opacity: number;
};

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

function makeBills(): Bill[] {
  return Array.from({ length: 46 }, () => {
    const near = Math.random() < 0.5;
    return {
      x: rand(-0.05, 1.05),
      size: near ? rand(30, 52) : rand(16, 28),
      speed: near ? rand(0.16, 0.3) : rand(0.1, 0.18),
      offset: rand(0, 1.3),
      sway: rand(0.5, 1.7),
      spin: rand(0.5, 2.0),
      phase: rand(0, Math.PI * 2),
      opacity: near ? 1.0 : 0.6,
    };
  });
}

function BillView({ bill, time, w, h }: { bill: Bill; time: SharedValue<number>; w: number; h: number }) {
  const style = useAnimatedStyle(() => {
    const t = time.value;
    const cycle = (t * bill.speed + bill.offset) % 1.3;
    const py = cycle * (h + 120) - 60;
    const px = bill.x * w + Math.sin(t * bill.sway + bill.phase) * 22;
    const rot = Math.sin(t * bill.spin + bill.phase) * 40;
    return {
      transform: [
        { translateX: px - bill.size / 2 },
        { translateY: py - bill.size / 2 },
        { rotate: `${rot}deg` },
      ],
    };
  });
  return (
    <Animated.Text style={[styles.bill, { fontSize: bill.size, opacity: bill.opacity }, style]}>
      💵
    </Animated.Text>
  );
}

export default function MoneyRain({ reduceMotion }: { reduceMotion?: boolean }) {
  const { width, height } = useWindowDimensions();
  const bills = useMemo(makeBills, []);
  const time = useSharedValue(0);

  useFrameCallback((frame) => {
    time.value = (frame.timeSinceFirstFrame ?? 0) / 1000;
  });

  if (reduceMotion) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text style={{ fontSize: 96, opacity: 0.25 }}>💵</Text>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {bills.map((b, i) => (
        <BillView key={i} bill={b} time={time} w={width} h={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bill: { position: 'absolute', top: 0, left: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
