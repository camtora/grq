import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, SectionTitle, Footnote, Divider, Loading, ErrorNote, Grid } from '../../../components/Chrome';
import StockLogo from '../../../components/StockLogo';
import { fmpLogo } from '../../../lib/logos';
import MdText from '../../../components/MdText';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { useApi } from '../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

/* ---------- wire (additive-tolerant: optional fields render nothing pre-deploy) ---------- */

type Overlap = 'universe' | 'watching' | null;
type Holding = {
  symbol: string;
  linkSymbol?: string; // page symbol for THIS company (bare-ticker collisions resolved)
  name: string | null;
  changeKind: string | null; // NEW | ADD | TRIM | HOLD | EXIT
  valueUsd: number | null;
  weightBps: number | null; // percent of the book, despite the name
  putCall: string | null;
  overlap: Overlap;
};
type SmPortfolio = {
  slug: string;
  name: string;
  subtitle: string | null;
  asOf: string | null;
  totalValueUsd: number | null;
  firm?: string;
  blurb?: string;
  avatar?: string | null;
  holdingsCount?: number;
  hasPuts?: boolean;
  perf1yPct?: number | null;
  securitiesAdded?: number | null;
  securitiesRemoved?: number | null;
  topHoldings: Holding[];
};
type SmMember = {
  slug: string;
  name: string;
  role: string;
  blurb: string;
  avatar?: string | null;
  trades: { symbol: string; linkSymbol?: string; side: string; amountRange: string; txnDate: string; overlap: Overlap }[];
};
type BoardRow = { symbol: string; linkSymbol?: string; name: string | null; primary: string; secondary: string | null; value?: number; overlap?: Overlap };
type SmartMoney = {
  portfolios: SmPortfolio[];
  members?: SmMember[];
  congress: BoardRow[];
  funds?: BoardRow[];
  insiders: BoardRow[];
  clusters: { symbol: string; linkSymbol?: string; insiders: number; totalValueUsd: number | null }[];
  narrative: { title: string; body: string; at?: string; sources?: string[] } | null;
  updatedAt?: string | null;
};

/* ---------- little shared bits (web PortfolioCard/Leaderboard parity) ---------- */

function usd(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v / 1e3)}k`;
}

function when(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ', ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Action → colour (web ACTION map): NEW teal · ADD emerald · TRIM amber · EXIT red.
function actionColor(kind: string, p: Palette): string {
  if (kind === 'NEW') return p.accentText;
  if (kind === 'ADD') return p.pos;
  if (kind === 'TRIM') return p.warn;
  if (kind === 'EXIT') return p.neg;
  return p.textMuted;
}

function Pill({ text, color }: { text: string; color: string }) {
  return (
    <Text style={[s.pill, { color, borderColor: color + '55', backgroundColor: color + '1a' }]}>{text}</Text>
  );
}

function OverlapPill({ overlap, p }: { overlap: Overlap; p: Palette }) {
  if (overlap === 'universe') return <Pill text="ours" color={p.pos} />;
  if (overlap === 'watching') return <Pill text="watching" color={p.accentText} />;
  return null;
}

/** Magnitude bar (web's subtle teal weight bars). */
function Bar({ frac, p }: { frac: number; p: Palette }) {
  return (
    <View style={[s.barTrack, { backgroundColor: p.cardHi }]}>
      <View style={[s.barFill, { width: `${Math.max(5, Math.round(frac * 100))}%`, backgroundColor: p.accent + '66' }]} />
    </View>
  );
}

// Curated faces (web /public/smartmoney/* — SSO-walled, so the app bundles them).
const SM_AVATARS: Record<string, number> = {
  'berkshire.jpg': require('../../../assets/smartmoney/berkshire.jpg'),
  'scion.webp': require('../../../assets/smartmoney/scion.webp'),
  'pershing.jpg': require('../../../assets/smartmoney/pershing.jpg'),
  'ark.jpeg': require('../../../assets/smartmoney/ark.jpeg'),
  'situational.webp': require('../../../assets/smartmoney/situational.webp'),
  'pelosi.webp': require('../../../assets/smartmoney/pelosi.webp'),
};

function SmAvatar({ name, avatar, p, size = 44 }: { name: string; avatar?: string | null; p: Palette; size?: number }) {
  const asset = avatar ? SM_AVATARS[avatar.replace(/^\/smartmoney\//, '')] : undefined;
  if (asset) {
    return (
      <Image
        source={asset}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#ffffff', borderWidth: 1, borderColor: p.cardBorder }}
      />
    );
  }
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: p.cardHi,
        borderWidth: 1,
        borderColor: p.cardBorder,
      }}
    >
      <Text style={{ color: p.accentText, fontFamily: F.black, fontSize: size * 0.34 }}>{initials}</Text>
    </View>
  );
}

/* ---------- tracked portfolios: the collapsible fund card ---------- */

function FundCard({ pf, p }: { pf: SmPortfolio; p: Palette }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const maxW = Math.max(...pf.topHoldings.map((h) => h.weightBps ?? 0), 1);
  const ownsCount = pf.topHoldings.filter((h) => h.overlap).length;

  return (
    <Card style={s.pfCard}>
      <Pressable onPress={() => setOpen(!open)} style={s.pfHead}>
        <SmAvatar name={pf.name} avatar={pf.avatar} p={p} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.pfNameRow}>
            <Text style={[s.pfName, { color: p.textPrimary }]}>{pf.name}</Text>
            {pf.hasPuts && <Pill text="holds puts" color={p.neg} />}
          </View>
          <Text style={[s.pfSub, { color: p.textMuted }]} numberOfLines={1}>
            {pf.firm ?? pf.subtitle ?? ''}
          </Text>
          <Text style={[s.pfMeta, tabular, { color: p.textMuted }]} numberOfLines={2}>
            {[
              pf.totalValueUsd != null ? usd(pf.totalValueUsd) : null,
              pf.holdingsCount != null ? `${pf.holdingsCount} holdings` : null,
              pf.asOf ? `13F ${pf.asOf}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            {pf.perf1yPct != null && (
              <Text style={{ color: pf.perf1yPct >= 0 ? p.pos : p.neg }}>
                {' · '}
                {pf.perf1yPct >= 0 ? '+' : ''}
                {pf.perf1yPct.toFixed(1)}% 1y
              </Text>
            )}
            {ownsCount > 0 && <Text style={{ color: p.pos }}>{` · ${ownsCount} overlap${ownsCount > 1 ? 's' : ''} our universe`}</Text>}
          </Text>
        </View>
        <Text style={[s.chev, { color: p.textMuted }]}>{open ? '▴' : '▾'}</Text>
      </Pressable>

      {open && (
        <View style={{ marginTop: 4 }}>
          {pf.blurb ? <Text style={[s.blurb, { color: p.textMuted }]}>{pf.blurb}</Text> : null}
          <Text style={[s.pfMeta, { color: p.textMuted, marginBottom: 4 }]}>
            Top {pf.topHoldings.length}
            {pf.holdingsCount != null ? ` of ${pf.holdingsCount}` : ''}
            {pf.securitiesAdded != null && <Text style={{ color: p.pos }}> · +{pf.securitiesAdded} new</Text>}
            {pf.securitiesRemoved != null && <Text style={{ color: p.neg }}> · −{pf.securitiesRemoved} exited</Text>}
            {(pf.securitiesAdded != null || pf.securitiesRemoved != null) && ' this quarter'}
          </Text>
          {pf.topHoldings.map((h, i) => (
            <View key={`${h.symbol}-${h.putCall ?? ''}-${i}`}>
              <Divider />
              <Pressable onPress={() => router.push(`/stock/${h.linkSymbol ?? h.symbol}`)} style={s.hRow}>
                <Text style={[s.rank, tabular, { color: p.textMuted }]}>{i + 1}</Text>
                <StockLogo symbol={h.symbol} logoUrl={fmpLogo(h.symbol)} size={24} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.hSymRow}>
                    <Text style={[s.sym, { color: h.overlap ? p.accentText : p.textPrimary }]}>{h.symbol}</Text>
                    {h.putCall && <Pill text={h.putCall} color={h.putCall === 'PUT' ? p.neg : p.accentText} />}
                    <OverlapPill overlap={h.overlap} p={p} />
                  </View>
                  {h.name ? (
                    <Text style={[s.meta, { color: p.textMuted }]} numberOfLines={1}>
                      {h.name}
                    </Text>
                  ) : null}
                  {h.weightBps != null && (
                    <View style={{ marginTop: 4 }}>
                      <Bar frac={(h.weightBps ?? 0) / maxW} p={p} />
                    </View>
                  )}
                </View>
                <View style={s.hRight}>
                  {h.weightBps != null && (
                    <Text style={[s.meta, tabular, { color: p.textPrimary }]}>{h.weightBps.toFixed(0)}%</Text>
                  )}
                  {h.changeKind && <Pill text={h.changeKind} color={actionColor(h.changeKind, p)} />}
                </View>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

/* ---------- tracked congress member (Pelosi…) — disclosed trades, no 13F ---------- */

function MemberCard({ m, p }: { m: SmMember; p: Palette }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ownsCount = m.trades.filter((t) => t.overlap).length;

  return (
    <Card style={s.pfCard}>
      <Pressable onPress={() => setOpen(!open)} style={s.pfHead}>
        <SmAvatar name={m.name} avatar={m.avatar} p={p} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.pfName, { color: p.textPrimary }]}>{m.name}</Text>
          <Text style={[s.pfSub, { color: p.textMuted }]} numberOfLines={1}>{m.role}</Text>
          <Text style={[s.pfMeta, tabular, { color: p.textMuted }]}>
            {m.trades.length} disclosed trade{m.trades.length === 1 ? '' : 's'}
            {ownsCount > 0 && <Text style={{ color: p.pos }}>{` · ${ownsCount} overlap${ownsCount > 1 ? 's' : ''} our universe`}</Text>}
          </Text>
        </View>
        <Text style={[s.chev, { color: p.textMuted }]}>{open ? '▴' : '▾'}</Text>
      </Pressable>

      {open && (
        <View style={{ marginTop: 4 }}>
          <Text style={[s.blurb, { color: p.textMuted }]}>{m.blurb}</Text>
          {m.trades.map((t, i) => (
            <View key={`${t.symbol}-${i}`}>
              <Divider />
              <Pressable onPress={() => router.push(`/stock/${t.linkSymbol ?? t.symbol}`)} style={s.hRow}>
                <StockLogo symbol={t.symbol} logoUrl={fmpLogo(t.symbol)} size={24} />
                <Text style={[s.sym, { color: t.overlap ? p.accentText : p.textPrimary, width: 58 }]}>{t.symbol}</Text>
                <Pill text={t.side} color={t.side === 'BUY' ? p.pos : p.neg} />
                <Text style={[s.meta, { color: p.textMuted, flex: 1 }]} numberOfLines={1}>
                  {t.amountRange}
                </Text>
                <Text style={[s.meta, tabular, { color: p.textMuted }]}>{t.txnDate.slice(5)}</Text>
              </Pressable>
            </View>
          ))}
          <Text style={[s.footnoteLine, { color: p.textMuted }]}>
            disclosed transactions — ranges, not a holdings list
          </Text>
        </View>
      )}
    </Card>
  );
}

/* ---------- the ranked "most-bought" boards ---------- */

function Board({ title, blurb, rows, empty, p }: { title: string; blurb: string; rows: BoardRow[]; empty: string; p: Palette }) {
  const router = useRouter();
  const max = Math.max(...rows.map((r) => r.value ?? 0), 1);
  return (
    <View>
      <SectionTitle sub={blurb}>{title}</SectionTitle>
      <Card style={s.listCard}>
        {rows.length === 0 ? (
          <Text style={[s.empty, { color: p.textMuted }]}>{empty}</Text>
        ) : (
          rows.map((r, i) => (
            <View key={`${r.symbol}-${i}`}>
              {i > 0 && <Divider />}
              <Pressable onPress={() => router.push(`/stock/${r.linkSymbol ?? r.symbol}`)} style={s.hRow}>
                <Text style={[s.rank, tabular, { color: p.textMuted }]}>{i + 1}</Text>
                <StockLogo symbol={r.symbol} logoUrl={fmpLogo(r.symbol)} size={24} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.hSymRow}>
                    <Text style={[s.sym, { color: r.overlap ? p.accentText : p.textPrimary }]}>{r.symbol}</Text>
                    <OverlapPill overlap={r.overlap ?? null} p={p} />
                  </View>
                  {r.name ? (
                    <Text style={[s.meta, { color: p.textMuted }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                  ) : null}
                  {r.value != null && (
                    <View style={{ marginTop: 4 }}>
                      <Bar frac={(r.value ?? 0) / max} p={p} />
                    </View>
                  )}
                </View>
                <View style={s.hRight}>
                  <Text style={[s.meta, tabular, { color: p.textPrimary, fontFamily: F.semi }]}>{r.primary}</Text>
                  {r.secondary ? <Text style={[s.metaSmall, tabular, { color: p.textMuted }]}>{r.secondary}</Text> : null}
                </View>
              </Pressable>
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

/* ---------- the page ---------- */

/** Smart Money — web /market/smart-money parity (D28): tracked portfolios (13F
 * funds + congress members) that expand into the book, the three most-bought
 * boards, cluster buys, and Alfred's read. Leads, not trades. */
export default function SmartMoneyScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const { data: d, error, loading, refreshing, refresh } = useApi<SmartMoney>('/api/smart-money');

  return (
    <SubScreen title="Smart Money" refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {d && (
        <View style={{ marginTop: 8 }}>
          <Text style={[s.intro, { color: p.textMuted }]}>
            What notable portfolios are buying — Congress, famous funds, and company insiders. Colour and
            leads, not trade instructions.
            {d.updatedAt ? <Text> · updated {when(d.updatedAt)}</Text> : null}
          </Text>

          <SectionTitle sub="who notable investors hold — tap a card to see the book">Tracked portfolios</SectionTitle>
          {/* Portfolio cards go 2–3 up on an iPad, one column on a phone. */}
          <Grid min={320} gap={10}>
            {d.portfolios.map((pf) => (
              <FundCard key={pf.slug} pf={pf} p={p} />
            ))}
            {(d.members ?? []).map((m) => (
              <MemberCard key={m.slug} m={m} p={p} />
            ))}
          </Grid>

          <Grid min={320} gap={14}>
            <Board
              title="Congress's most-bought"
              blurb="most members disclosed buying · last 90 days"
              rows={d.congress}
              empty="No congressional buys in range."
              p={p}
            />
            <Board
              title="Funds piling in"
              blurb="most tracked funds newly bought or added · latest 13F"
              rows={d.funds ?? []}
              empty="No new fund positions yet."
              p={p}
            />
            <Board
              title="Biggest insider buys"
              blurb="largest open-market Form 4 purchases · last 14 days"
              rows={d.insiders}
              empty="No insider buys in range."
              p={p}
            />
          </Grid>

          {d.clusters.length > 0 && (
            <View style={{ marginBottom: 14 }}>
              <SectionTitle sub="multiple insiders, one stock · last 30 days">Cluster buys</SectionTitle>
              <Card>
                <View style={s.clusterWrap}>
                  {d.clusters.map((c) => (
                    <Pressable
                      key={c.symbol}
                      onPress={() => router.push(`/stock/${c.linkSymbol ?? c.symbol}`)}
                      style={[s.clusterChip, { borderColor: p.cardBorder, backgroundColor: p.cardHi }]}
                    >
                      <Text style={[s.sym, { color: p.accentText, fontSize: 12 }]}>{c.symbol}</Text>
                      <Text style={[s.metaSmall, tabular, { color: p.textMuted }]}>
                        {c.insiders} insiders{c.totalValueUsd != null ? ` · ${usd(c.totalValueUsd)}` : ''}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Card>
            </View>
          )}

          {d.narrative && (
            <View style={{ marginBottom: 4 }}>
              <SectionTitle sub={d.narrative.at ? when(d.narrative.at) : 'the weekly scan'}>Alfred&apos;s read</SectionTitle>
              <Card>
                <Text style={[s.narrTitle, { color: p.textPrimary }]}>{d.narrative.title}</Text>
                <MdText body={d.narrative.body} foldAt={500} />
                {d.narrative.sources && d.narrative.sources.length > 0 && (
                  <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 8 }]}>
                    via {d.narrative.sources.slice(0, 3).join(', ')}
                  </Text>
                )}
              </Card>
            </View>
          )}

          <Footnote>
            Alfred surfaces what smart money is doing as one input — it does not copy these trades. 13F lags
            ~45 days by law and shows longs + options only; congress amounts are ranges; most names are
            US-listed → leads, not trades. Congress + insider feeds refresh daily, 13Fs on a new filing;
            Alfred&apos;s read is the weekly scan, first market day ~11 AM ET.
          </Footnote>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  pfCard: { paddingVertical: 12 },
  pfHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pfNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pfName: { fontFamily: F.semi, fontSize: 14.5 },
  pfSub: { fontFamily: F.reg, fontSize: 11, marginTop: 1 },
  pfMeta: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 15, marginTop: 3 },
  chev: { fontFamily: F.reg, fontSize: 13, paddingTop: 2 },
  blurb: { fontFamily: F.reg, fontStyle: 'italic', fontSize: 11.5, lineHeight: 16, marginTop: 8, marginBottom: 8 },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  hRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
  hSymRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  hRight: { alignItems: 'flex-end', gap: 3 },
  rank: { fontFamily: F.reg, fontSize: 10.5, width: 16, textAlign: 'right' },
  sym: { fontFamily: F.semi, fontSize: 13.5 },
  meta: { fontFamily: F.reg, fontSize: 11 },
  metaSmall: { fontFamily: F.reg, fontSize: 10 },
  pill: {
    fontFamily: F.bold,
    fontSize: 8.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    overflow: 'hidden',
  },
  barTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 3, borderRadius: 2 },
  empty: { fontFamily: F.reg, fontSize: 12, paddingVertical: 10 },
  clusterWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  clusterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  narrTitle: { fontFamily: F.semi, fontSize: 13.5, marginBottom: 6 },
  footnoteLine: { fontFamily: F.reg, fontSize: 10, marginTop: 8 },
});
