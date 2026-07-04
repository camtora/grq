import React from 'react';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { usePalette } from '../../constants/theme';

const R = 22;
const CIRC = 2 * Math.PI * R; // ≈ 138.23

/** The confidence gauge — a radial ring meter (web components/hunt/ConfidenceGauge).
 * Alfred's conviction (0–100) as an accent arc over a faint track, number centered. */
export default function ConfidenceGauge({
  value,
  size = 58,
  label = 'CONF',
}: {
  value: number | null;
  size?: number;
  label?: string;
}) {
  const { p } = usePalette();
  const frac = value == null ? 0 : Math.min(1, Math.max(0, value / 100));
  const stroke = size >= 80 ? 5.5 : size >= 56 ? 5 : 6;
  const labelSize = label.length > 5 ? 6.5 : 7;
  return (
    <Svg viewBox="0 0 52 52" width={size} height={size}>
      <Circle cx={26} cy={26} r={R} fill="none" stroke={p.cardBorder} strokeWidth={stroke} />
      {value != null && (
        <Circle
          cx={26}
          cy={26}
          r={R}
          fill="none"
          stroke={p.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(frac * CIRC).toFixed(1)} ${CIRC.toFixed(1)}`}
          rotation={-90}
          origin="26, 26"
        />
      )}
      <SvgText x={26} y={label ? 28 : 31} textAnchor="middle" fill={p.textPrimary} fontSize={15} fontWeight="700">
        {value == null ? '—' : String(value)}
      </SvgText>
      {label ? (
        <SvgText x={26} y={37} textAnchor="middle" fill={p.textMuted} fontSize={labelSize} letterSpacing={1}>
          {label}
        </SvgText>
      ) : null}
    </Svg>
  );
}
