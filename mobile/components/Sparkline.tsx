import React from 'react';
import { View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { usePalette } from '../constants/theme';

/** Minimal sparkline — values in cents, colored by first→last direction. */
export default function Sparkline({
  values,
  height = 56,
}: {
  values: number[];
  height?: number;
}) {
  const { p } = usePalette();
  const [w, setW] = React.useState(0);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 4;
  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const up = values[values.length - 1] >= values[0];

  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Svg width={w} height={height}>
          <Polyline
            points={points}
            fill="none"
            stroke={up ? p.pos : p.neg}
            strokeWidth={1.8}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      )}
    </View>
  );
}
