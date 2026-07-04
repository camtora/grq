import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { usePalette, F } from '../../constants/theme';
import { money, signedMoney, pnlColor } from '../../lib/format';

/** Second Opinions — bits shared by the overview (more/race) and the day page
 * (more/race-day/[date]). Web parity: components/race/* + lib/race/standings. */

export const tabular = { fontVariant: ['tabular-nums' as const] };

/* ---------- wire (additive-tolerant: optional fields render nothing pre-deploy) ---------- */

export type RacePosition = {
  symbol: string;
  pnlCadCents: number;
  calls: number;
  shares: number;
  avgPriceCents: number | null;
  currency: string | null;
};

export type RaceModel = {
  model: string;
  label: string;
  role: string; // champion | challenger
  pnlCadCents: number;
  scoredCalls: number;
  greens: number;
  hitRate: number | null;
  avgReturnBps: number | null;
  vsBenchmarkBps: number | null;
  totalCalls: number;
  avgConfidence: number | null;
  spark: number[];
  counts?: { BUY: number; SELL: number; HOLD: number; NONE: number };
  positions?: RacePosition[];
};

export type RaceDayRollup = {
  date: string;
  sessions: number;
  calls: number;
  leader: { label: string; role: string; pnlCadCents: number } | null;
  champion: { pnlCadCents: number } | null;
};

export type RaceCell = {
  role: string;
  action: string | null;
  symbol: string | null;
  qty: number | null;
  confidence: number | null;
  unpriced: boolean;
  text: string;
  returnBps: number | null;
  isGreen: boolean | null;
  pnlCadCents: number | null;
};

export type RaceSession = {
  key: string;
  at: string;
  kind: string;
  label: string;
  reason: string;
  cells: Record<string, RaceCell>;
};

export type RaceDayResponse = {
  date: string;
  hasData: boolean;
  fxUsdCad: number | null;
  models: string[];
  standings: RaceModel[];
  sessions: RaceSession[];
};

/* ---------- helpers ---------- */

export const KIND_LABEL: Record<string, string> = {
  morning: 'Morning plan',
  checkin: 'Intraday check-in',
  midday: 'Midday brief',
  eod: 'EOD report',
  position: 'Position check',
};

/** Signed bps → "+1.2%" (web ModelTile fmtBps). Null → em dash. */
export function fmtBps(bps: number | null): string {
  if (bps == null) return '—';
  const v = bps / 100;
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
}

/** Today's ET date, YYYY-MM-DD (en-CA formats ISO-style). */
export function etToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** YYYY-MM-DD ± n days. */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/* ---------- little shared pieces ---------- */

export function Pill({ text, color }: { text: string; color: string }) {
  return (
    <Text style={[s.pill, { color, borderColor: color + '55', backgroundColor: color + '1a' }]}>{text}</Text>
  );
}

/** BUY green · SELL red · HOLD/stand-down dim; no action at all = a pure read. */
export function ActionChip({ action }: { action: string | null }) {
  const { p } = usePalette();
  if (!action) return <Text style={[s.read, { color: p.textMuted }]}>read</Text>;
  const color = action === 'BUY' ? p.pos : action === 'SELL' ? p.neg : p.textMuted;
  return <Pill text={action} color={color} />;
}

/** One stat of a tile's 3-up row (web ModelTile Stat). */
export function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  const { p } = usePalette();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={[s.statLabel, { color: p.textMuted }]}>{label}</Text>
      <Text style={[s.statValue, tabular, { color: color ?? p.textPrimary }]}>{value}</Text>
      {sub ? <Text style={[s.statSub, tabular, { color: p.textMuted }]}>{sub}</Text> : null}
    </View>
  );
}

/** The model's virtual BOOK — what its buy calls add up to on the $50k stake. */
export function BookList({ positions, max = 6 }: { positions: RacePosition[]; max?: number }) {
  const { p } = usePalette();
  const router = useRouter();
  if (positions.length === 0) return null;
  return (
    <View style={{ gap: 3 }}>
      {positions.slice(0, max).map((pos) => (
        <View key={pos.symbol} style={s.bookRow}>
          <Pressable
            onPress={() => router.push(`/stock/${pos.symbol}`)}
            hitSlop={6}
            style={{ flexDirection: 'row', flexShrink: 1 }}
          >
            <Text numberOfLines={1} style={{ flexShrink: 1 }}>
              <Text style={[s.bookSym, { color: p.accentText }]}>{pos.symbol}</Text>
              {pos.shares > 0 && pos.avgPriceCents != null ? (
                <Text style={[s.bookMeta, tabular, { color: p.textMuted }]}>
                  {'  '}
                  {pos.shares} @ {money(pos.avgPriceCents)}
                  {pos.currency ? ` ${pos.currency}` : ''}
                </Text>
              ) : null}
              {pos.calls > 1 ? <Text style={[s.bookMeta, { color: p.textMuted }]}> · {pos.calls} calls</Text> : null}
            </Text>
          </Pressable>
          <Text style={[s.bookPnl, tabular, { color: pnlColor(pos.pnlCadCents, p) }]}>
            {signedMoney(pos.pnlCadCents)}
          </Text>
        </View>
      ))}
      {positions.length > max ? (
        <Text style={[s.bookMeta, { color: p.textMuted, marginTop: 1 }]}>+{positions.length - max} more</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    fontFamily: F.semi,
    fontSize: 10,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  read: { fontFamily: F.med, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  statLabel: { fontFamily: F.semi, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.8 },
  statValue: { fontFamily: F.semi, fontSize: 13.5, marginTop: 2 },
  statSub: { fontFamily: F.reg, fontSize: 9.5, marginTop: 1 },
  bookRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  bookSym: { fontFamily: F.semi, fontSize: 12 },
  bookMeta: { fontFamily: F.reg, fontSize: 10.5 },
  bookPnl: { fontFamily: F.semi, fontSize: 10.5 },
});
