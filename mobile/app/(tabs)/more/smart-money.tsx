import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, SectionTitle, Footnote, Divider, Loading, ErrorNote } from '../../../components/Chrome';
import StockLogo from '../../../components/StockLogo';
import { fmpLogo } from '../../../lib/logos';
import MdText from '../../../components/MdText';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { useApi } from '../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

type Holding = { symbol: string; name: string; changeKind: string; valueUsd: number; weightBps: number; putCall: string | null; overlap: string | null };
type SmartMoney = {
  portfolios: { slug: string; name: string; subtitle: string; asOf: string; totalValueUsd: number; topHoldings: Holding[] }[];
  congress: { symbol: string; name: string; primary: string; secondary: string }[];
  insiders: { symbol: string; name: string; primary: string; secondary: string }[];
  clusters: { symbol: string; insiders: number; totalValueUsd: number }[];
  narrative: { title: string; body: string } | null;
};

function usd(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v / 1e3)}k`;
}

function changeColor(kind: string, p: Palette): string {
  if (kind === 'NEW' || kind === 'ADD') return p.pos;
  if (kind === 'TRIM' || kind === 'EXIT') return p.neg;
  return p.textMuted;
}

/** Smart Money — tracked 13F filers, congress, insiders (web parity, D28).
 * Honest: 13F lags ~45d and shows longs+options only; leads, not trades. */
export default function SmartMoneyScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const { data: d, error, loading, refreshing, refresh } = useApi<SmartMoney>('/api/smart-money');

  return (
    <SubScreen title="Smart Money" refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {d && (
        <View>
          {d.narrative && (
            <View>
              <SectionTitle sub="what the crowd is doing">The read</SectionTitle>
              <Card>
                <MdText body={d.narrative.body} foldAt={500} />
              </Card>
            </View>
          )}

          <SectionTitle sub="curated 13F filers · quarterly, ~45-day lag">Tracked portfolios</SectionTitle>
          {d.portfolios.map((pf) => (
            <Card key={pf.slug} style={[s.listCard, { marginBottom: 10 }]}>
              <View style={s.pfHead}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.pfName, { color: p.textPrimary }]}>{pf.name}</Text>
                  <Text style={[s.pfSub, { color: p.textMuted }]}>{pf.subtitle} · as of {pf.asOf}</Text>
                </View>
                <Text style={[s.pfTotal, tabular, { color: p.textPrimary }]}>{usd(pf.totalValueUsd)}</Text>
              </View>
              {pf.topHoldings.slice(0, 5).map((h, i) => (
                <View key={`${h.symbol}-${i}`}>
                  <Divider />
                  <Pressable onPress={() => router.push(`/stock/${h.symbol}`)} style={s.row}>
                    {/* Smart-money names come from FMP's US feeds — bare tickers are real FMP keys. */}
                    <StockLogo symbol={h.symbol} logoUrl={fmpLogo(h.symbol)} size={24} />
                    <Text style={[s.sym, { color: p.accentText }]}>{h.symbol}</Text>
                    {h.putCall && <Text style={[s.putCall, { color: p.warn }]}>{h.putCall}</Text>}
                    <View style={s.rowRight}>
                      <Text style={[s.change, { color: changeColor(h.changeKind, p) }]}>{h.changeKind}</Text>
                      <Text style={[s.meta, tabular, { color: p.textMuted }]}>{usd(h.valueUsd)} · {(h.weightBps / 1).toFixed(0)}%</Text>
                    </View>
                  </Pressable>
                </View>
              ))}
            </Card>
          ))}

          <SectionTitle sub="ranges, not exact sizes">Congress</SectionTitle>
          <Card style={s.listCard}>
            {d.congress.slice(0, 6).map((c, i) => (
              <View key={`${c.symbol}-${i}`}>
                {i > 0 && <Divider />}
                <Pressable onPress={() => router.push(`/stock/${c.symbol}`)} style={s.row}>
                  <StockLogo symbol={c.symbol} logoUrl={fmpLogo(c.symbol)} size={24} />
                  <Text style={[s.sym, { color: p.accentText, width: 58 }]}>{c.symbol}</Text>
                  <Text style={[s.meta, { color: p.textMuted, flex: 1 }]} numberOfLines={1}>{c.name}</Text>
                  <Text style={[s.meta, { color: p.textPrimary }]}>{c.primary} · {c.secondary}</Text>
                </Pressable>
              </View>
            ))}
          </Card>

          <SectionTitle sub="Form 4 buys, 90 days">Insider buys</SectionTitle>
          <Card style={s.listCard}>
            {d.insiders.slice(0, 6).map((c, i) => (
              <View key={`${c.symbol}-${i}`}>
                {i > 0 && <Divider />}
                <Pressable onPress={() => router.push(`/stock/${c.symbol}`)} style={s.row}>
                  <StockLogo symbol={c.symbol} logoUrl={fmpLogo(c.symbol)} size={24} />
                  <Text style={[s.sym, { color: p.accentText, width: 58 }]}>{c.symbol}</Text>
                  <Text style={[s.meta, { color: p.textMuted, flex: 1 }]} numberOfLines={1}>{c.name}</Text>
                  <Text style={[s.meta, tabular, { color: p.textPrimary }]}>{c.primary}</Text>
                </Pressable>
              </View>
            ))}
          </Card>

          <SectionTitle sub="several insiders buying at once">Cluster buys</SectionTitle>
          <Card style={s.listCard}>
            {d.clusters.slice(0, 6).map((c, i) => (
              <View key={`${c.symbol}-${i}`}>
                {i > 0 && <Divider />}
                <Pressable onPress={() => router.push(`/stock/${c.symbol}`)} style={s.row}>
                  <StockLogo symbol={c.symbol} logoUrl={fmpLogo(c.symbol)} size={24} />
                  <Text style={[s.sym, { color: p.accentText, width: 58 }]}>{c.symbol}</Text>
                  <Text style={[s.meta, { color: p.textMuted, flex: 1 }]}>{c.insiders} insiders</Text>
                  <Text style={[s.meta, tabular, { color: p.textPrimary }]}>{usd(c.totalValueUsd)}</Text>
                </Pressable>
              </View>
            ))}
          </Card>
          <Footnote>
            13F lags ~45 days and shows longs + options only · congress amounts are ranges · mostly
            US-listed → leads, not trades — an input Alfred weighs, never the gate
          </Footnote>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  listCard: { paddingVertical: 8, paddingHorizontal: 12 },
  pfHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  pfName: { fontFamily: F.semi, fontSize: 14.5 },
  pfSub: { fontFamily: F.reg, fontSize: 10.5, marginTop: 1 },
  pfTotal: { fontFamily: F.semi, fontSize: 13.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  rowRight: { marginLeft: 'auto', alignItems: 'flex-end' },
  sym: { fontFamily: F.semi, fontSize: 13 },
  meta: { fontFamily: F.reg, fontSize: 11 },
  change: { fontFamily: F.bold, fontSize: 10, letterSpacing: 0.5 },
  putCall: { fontFamily: F.black, fontSize: 9, letterSpacing: 0.5 },
});
