import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Card, SectionTitle, Footnote, Divider, Segmented, MiniLabel, Loading, ErrorNote, Bounded } from '../../components/Chrome';
import ReconnectBanner from '../../components/accounts/ReconnectBanner';
import StockLogo from '../../components/StockLogo';
import Sparkline from '../../components/Sparkline';
import MdText from '../../components/MdText';
import { usePalette, F, type Palette } from '../../constants/theme';
import { useResponsive } from '../../constants/layout';
import { money, signedMoney, signedPctFromBps, pnlColor } from '../../lib/format';
import { useApi } from '../../services/hooks';
import type { Portfolio, AccountsResponse, Today, BriefingItem } from '../../services/types';

const tabular = { fontVariant: ['tabular-nums' as const] };

/** Portfolio — split between the fund (Alfred, default) and the members' own
 * brokerage accounts (Personal, read-only via SnapTrade; Alfred can't see
 * these — D97). Both views share the same book structure: cash strip, then
 * holdings under Canada / United States headers. */
export default function PortfolioScreen() {
  const [view, setView] = useState<'alfred' | 'personal'>('alfred');
  const { isWide } = useResponsive();

  // An `accounts` push tap (SnapTrade reconnect) routes here with ?segment=personal
  // (lib/notification-routes) — apply it, then clear so a later tap re-fires.
  const router = useRouter();
  const { segment } = useLocalSearchParams<{ segment?: string }>();
  useEffect(() => {
    if (segment !== 'alfred' && segment !== 'personal') return;
    setView(segment);
    router.setParams({ segment: '' });
  }, [segment, router]);

  const pf = useApi<Portfolio>('/api/portfolio');
  const today = useApi<Today>('/api/today');
  const accounts = useApi<AccountsResponse>('/api/accounts');
  const briefings = useApi<{ items: BriefingItem[] }>('/api/briefings');

  const refreshing = pf.refreshing || today.refreshing || accounts.refreshing || briefings.refreshing;
  const refresh = () => {
    pf.refresh();
    today.refresh();
    accounts.refresh();
    briefings.refresh();
  };

  return (
    <Screen title="Portfolio" wide={isWide} refreshing={refreshing} onRefresh={refresh}>
      <Bounded style={{ paddingHorizontal: 0 }}>
        <View style={{ marginTop: 8 }}>
          <Segmented
            options={[
              { key: 'alfred', label: 'Alfred' },
              { key: 'personal', label: 'Personal' },
            ]}
            value={view}
            onChange={setView}
          />
        </View>
      </Bounded>
      {view === 'alfred' ? (
        <AlfredView pf={pf.data} t={today.data} briefings={briefings.data?.items ?? []} loading={pf.loading} error={pf.error} />
      ) : (
        <PersonalView data={accounts.data} loading={accounts.loading} error={accounts.error} onChanged={accounts.reload} />
      )}
    </Screen>
  );
}

/* ---------- the shared book: rows split by country ---------- */

type BookRow = {
  symbol: string;
  logoUrl: string | null;
  qtyLine: string;
  valueCents: number | null;
  dayBps?: number | null;
  pnlCents?: number | null;
  label?: string; // display override for non-stock rows (e.g. Cash) — no link
  usd?: boolean; // house convention: $ is CAD unless it wears a US prefix
  cash?: boolean; // uninvested-cash rows wear Scrooge instead of a company logo
};

// The cash row's "logo" — Scrooge McDuck (Cam's pick, image supplied 2026-07-04).
const SCROOGE = require('../../assets/scrooge.png');

function ScroogeChip({ size }: { size: number }) {
  const { p } = usePalette();
  return (
    <Image
      source={SCROOGE}
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        backgroundColor: '#ffffff', // the art is on white — same chip as the logos
        borderWidth: 1,
        borderColor: p.cardBorder,
      }}
    />
  );
}

// "US$1,234.56" / "-US$12.34" — the US prefix rides inside the sign.
const usMoney = (cents: number) => money(cents).replace('$', 'US$');
const usSignedMoney = (cents: number) => signedMoney(cents).replace('$', 'US$');

function countryOf(currency: string): string {
  if (currency === 'USD') return 'United States';
  if (currency === 'CAD') return 'Canada';
  return 'Other';
}

function BookRowView({ r }: { r: BookRow }) {
  const { p } = usePalette();
  const router = useRouter();
  return (
    <Pressable onPress={r.label ? undefined : () => router.push(`/stock/${r.symbol}`)} style={s.row}>
      {r.cash ? <ScroogeChip size={32} /> : <StockLogo symbol={r.symbol} logoUrl={r.logoUrl} size={32} />}
      <View style={s.rowMain}>
        <Text style={[s.sym, { color: r.label ? p.textPrimary : p.accentText }]}>{r.label ?? r.symbol}</Text>
        <Text style={[s.sub, tabular, { color: p.textMuted }]} numberOfLines={1}>{r.qtyLine}</Text>
      </View>
      <View style={s.rowRight}>
        {r.valueCents != null && (
          <Text style={[s.val, tabular, { color: p.textPrimary }]}>
            {r.usd ? usMoney(r.valueCents) : money(r.valueCents)}
          </Text>
        )}
        <View style={s.rowRightSub}>
          {r.dayBps != null && (
            <Text style={[s.subPct, tabular, { color: pnlColor(r.dayBps, p) }]}>
              {signedPctFromBps(r.dayBps)}
            </Text>
          )}
          {r.pnlCents != null && (
            <Text style={[s.subPct, tabular, { color: pnlColor(r.pnlCents, p) }]}>
              {r.usd ? usSignedMoney(r.pnlCents) : signedMoney(r.pnlCents)}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/** Holdings under Canada / United States headers (docs/MOBILE-DESIGN.md §8). */
function CountryBook({ groups, empty }: { groups: Map<string, BookRow[]>; empty: string }) {
  const { p } = usePalette();
  const order = ['Canada', 'United States', 'Other'].filter((c) => (groups.get(c)?.length ?? 0) > 0);
  if (!order.length) {
    return (
      <Card style={s.listCard}>
        <Text style={[s.empty, { color: p.textMuted }]}>{empty}</Text>
      </Card>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      {order.map((country) => (
        <View key={country}>
          <MiniLabel>{country}</MiniLabel>
          <Card style={s.listCard}>
            {(groups.get(country) ?? []).map((r, i) => (
              <View key={`${r.symbol}-${i}`}>
                {i > 0 && <Divider />}
                <BookRowView r={r} />
              </View>
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}

function CashStrip({ cad, usd, positions, p }: { cad: number; usd: number; positions: number; p: Palette }) {
  return (
    <Card style={s.cashCard}>
      <View style={s.cashStat}>
        <Text style={[s.cashLabel, { color: p.textMuted }]}>CAD cash</Text>
        <Text style={[s.cashValue, tabular, { color: p.textPrimary }]}>{money(cad)}</Text>
      </View>
      <View style={s.cashStat}>
        <Text style={[s.cashLabel, { color: p.textMuted }]}>USD cash</Text>
        <Text style={[s.cashValue, tabular, { color: p.textPrimary }]}>US{money(usd)}</Text>
      </View>
      <View style={s.cashStat}>
        <Text style={[s.cashLabel, { color: p.textMuted }]}>Positions</Text>
        <Text style={[s.cashValue, tabular, { color: p.textPrimary }]}>{money(positions)}</Text>
      </View>
    </Card>
  );
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
}

/* ---------- Alfred (the fund) ---------- */

function AlfredView({ pf, t, briefings, loading, error }: { pf: Portfolio | null; t: Today | null; briefings: BriefingItem[]; loading: boolean; error: string | null }) {
  const { p } = usePalette();
  const { isWide } = useResponsive();
  if (loading) return <Loading />;
  if (error && !pf) return <View style={{ marginTop: 16 }}><ErrorNote message={error} /></View>;
  if (!pf) return null;

  const rows = [...pf.positions]
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((pos) => ({
      row: {
        symbol: pos.symbol,
        logoUrl: pos.logoUrl,
        qtyLine: `${pos.qty} sh @ ${pos.currency === 'USD' ? usMoney(pos.avgCostCents) : money(pos.avgCostCents)}`,
        valueCents: pos.marketValueCents,
        dayBps: pos.dayChangeBps,
        pnlCents: pos.unrealizedPnlCents,
        usd: pos.currency === 'USD',
      },
      country: countryOf(pos.currency),
    }));
  const groups = groupBy(rows, (r) => r.country);
  const bookGroups = new Map([...groups.entries()].map(([k, v]) => [k, v.map((x) => x.row)]));
  const tape = t?.tape ?? [];

  // The book — cash strip, then holdings by country.
  const bookSection = (
    <View>
      <SectionTitle sub="what the fund is holding">The book</SectionTitle>
      <CashStrip cad={pf.cadCashCents} usd={pf.usdCashCents} positions={pf.positionsCents} p={p} />
      <View style={{ marginTop: 10 }}>
        <CountryBook
          groups={bookGroups}
          empty="All cash — Alfred only buys when a thesis clears every guardrail. Patience is a position."
        />
        <Footnote>
          risk dial {pf.riskLevel.toLowerCase()} · fees {money(pf.feeSpentMonthCents)} of {money(pf.feeBudgetCentsMonth)} this month
          {pf.quotesAsOf ? ` · quotes ${pf.quotesAsOf.slice(11, 16)}Z` : ''}
        </Footnote>
      </View>
    </View>
  );

  // From the desk — the current day's printouts, latest auto-opened (Cam
  // 2026-07-03). Weekends show the most recent day that HAS printouts.
  const deskSection = (() => {
    const dayKey = (iso: string) => new Date(iso).toDateString();
    const latestDay = briefings.length ? dayKey(briefings[0].at) : null;
    const todays = briefings.filter((b) => dayKey(b.at) === latestDay);
    if (!todays.length) return null;
    return (
      <View>
        <SectionTitle sub="Alfred's printouts — pre-market to close">From the desk</SectionTitle>
        <Card style={s.listCard}>
          {todays.map((b, i) => (
            <BriefingRow key={b.id} b={b} prev={i > 0 ? todays[i - 1] : null} first={i === 0} defaultOpen={i === 0} />
          ))}
        </Card>
        <Footnote>fund-level reads only — per-name notes live on each stock page</Footnote>
      </View>
    );
  })();

  return (
    <View>
      {/* NAV hero + the intraday tape span the full width (matching the book +
          desk columns below). */}
        {pf.killSwitch && (
          <Card style={{ marginTop: 14, borderColor: p.neg }}>
            <Text style={{ color: p.neg, fontFamily: F.bold, fontSize: 13 }}>
              KILL SWITCH ENGAGED{pf.killSwitchBy ? ` — by ${pf.killSwitchBy}` : ''}
            </Text>
            <Text style={{ color: p.textMuted, fontFamily: F.reg, fontSize: 11.5, marginTop: 3 }}>
              Nothing trades while it's on. Flip it back on the web Settings page.
            </Text>
          </Card>
        )}

        {/* Hero — NAV (CAD, house convention) + the US$ equivalent + day & total P&L */}
        <View style={s.hero}>
          <Text style={[s.heroLabel, { color: p.textMuted }]}>NET ASSET VALUE</Text>
          <Text style={[s.heroNav, tabular, { color: p.textPrimary }]}>{money(pf.navCents)}</Text>
          {pf.fxUsdCad != null && pf.fxUsdCad > 0 && (
            <Text style={[s.heroUsd, tabular, { color: p.textMuted }]}>
              ≈ {usMoney(Math.round(pf.navCents / pf.fxUsdCad))}
            </Text>
          )}
          <View style={s.heroRow}>
            {t && (
              <Text style={[s.heroPnl, tabular, { color: pnlColor(t.dayPnlCents, p) }]}>
                {signedMoney(t.dayPnlCents)} ({signedPctFromBps(t.dayPnlBps)}) today
              </Text>
            )}
            <Text style={[s.heroPnl, tabular, { color: pnlColor(pf.totalPnlCents, p) }]}>
              {signedMoney(pf.totalPnlCents)} all-time
            </Text>
          </View>
        </View>

        {/* The Tape — intraday NAV */}
        {tape.length >= 2 && (
          <View>
            <SectionTitle sub="intraday NAV, open → now">The Tape</SectionTitle>
            <Card>
              <Sparkline values={tape.map((x) => x.navCents)} height={64} />
              <View style={s.tapeLabels}>
                <Text style={[s.tapeLabel, { color: p.textMuted }]}>{tape[0].at}</Text>
                <Text style={[s.tapeLabel, { color: p.textMuted }]}>{tape[tape.length - 1].at}</Text>
              </View>
            </Card>
          </View>
        )}

      {/* iPad: the book and the desk sit side by side; phone stacks them. */}
      {isWide && deskSection ? (
        <View style={{ flexDirection: 'row', gap: 20, marginTop: 4, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>{bookSection}</View>
          <View style={{ flex: 1, minWidth: 0 }}>{deskSection}</View>
        </View>
      ) : (
        <Bounded style={{ paddingHorizontal: 0 }}>
          {bookSection}
          {deskSection}
        </Bounded>
      )}
    </View>
  );
}

/* ---------- From the desk ---------- */

const BRIEFING_META: Record<BriefingItem['kind'], { label: string; tone: 'accent' | 'pos' | 'warn' | 'muted' }> = {
  premarket: { label: 'Pre-market', tone: 'warn' },
  plan: { label: 'Morning plan', tone: 'accent' },
  checkin: { label: 'Check-in', tone: 'muted' },
  midday: { label: 'Midday', tone: 'accent' },
  eod: { label: 'Evening', tone: 'pos' },
  weekly: { label: 'Weekly review', tone: 'pos' },
};

function BriefingRow({ b, prev, first, defaultOpen = false }: { b: BriefingItem; prev: BriefingItem | null; first: boolean; defaultOpen?: boolean }) {
  const { p } = usePalette();
  const [open, setOpen] = useState(defaultOpen);
  const meta = BRIEFING_META[b.kind];
  const tone = meta.tone === 'pos' ? p.pos : meta.tone === 'warn' ? p.warn : meta.tone === 'accent' ? p.accentText : p.textMuted;
  const d = new Date(b.at);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dayOf = (iso: string) => new Date(iso).toDateString();
  const newDay = !prev || dayOf(prev.at) !== dayOf(b.at);
  const dayLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  // The title's tail is the summary ("Intraday Check-in — US closed, …");
  // a bare-date tail (e.g. "Midday brief — 2026-07-03") isn't worth showing.
  const tail = b.title.split('—').slice(1).join('—').trim();
  const summary = /^\d{4}-\d{2}-\d{2}$/.test(tail) ? '' : tail;

  return (
    <View>
      {newDay && (
        <Text style={[s.briefDay, { color: p.textMuted, marginTop: first ? 4 : 10 }]}>{dayLabel}</Text>
      )}
      {!newDay && <Divider />}
      <Pressable onPress={() => setOpen(!open)} style={s.briefRow}>
        <View style={s.briefHead}>
          <Text style={[s.briefKind, { color: tone }]}>{meta.label}</Text>
          <Text style={[s.briefTime, { color: p.textMuted }]}>{time}</Text>
          <Text style={[s.briefTime, { color: p.accentText, marginLeft: 'auto' }]}>{open ? 'close' : 'read'}</Text>
        </View>
        {!open && summary ? (
          <Text style={[s.briefSummary, { color: p.textMuted }]} numberOfLines={2}>{summary}</Text>
        ) : null}
        {open && (
          <View style={{ marginTop: 6 }}>
            <MdText body={b.body} foldAt={100_000} />
          </View>
        )}
      </Pressable>
    </View>
  );
}

/* ---------- Personal (SnapTrade — read-only, same book structure) ---------- */

function PersonalView({
  data,
  loading,
  error,
  onChanged,
}: {
  data: AccountsResponse | null;
  loading: boolean;
  error: string | null;
  onChanged: () => void;
}) {
  const { p } = usePalette();
  const router = useRouter();
  if (loading) return <Loading />;
  if (error && !data) return <View style={{ marginTop: 16 }}><ErrorNote message={error} /></View>;
  if (!data) return null;

  return (
    <View>
      {/* Only the signed-in member's own accounts (Cam 2026-07-03). */}
      {data.members.filter((m) => m.isSelf).map((m) => {
        // Web parity (Cam 2026-07-04): a DISABLED connection still shows its (stale)
        // book — hiding it read as "not connected". The banner below owns the honesty.
        const accounts = m.connected ? m.accounts : [];
        const broken = accounts.find((a) => a.disabled);
        // House convention: $ is CAD unless US-prefixed. USD accounts convert into
        // the CAD NAV at the BoC rate; rows below keep their native currency.
        const rate = data.fxUsdCad ?? null;
        const inCad = (cents: number, currency: string) =>
          currency === 'USD' && rate != null ? Math.round(cents * rate) : cents;
        const cad = accounts.filter((a) => a.currency === 'CAD').reduce((s2, a) => s2 + (a.cashCents ?? 0), 0);
        const usd = accounts.filter((a) => a.currency === 'USD').reduce((s2, a) => s2 + (a.cashCents ?? 0), 0);
        const holdings = accounts.flatMap((a) => a.holdings);
        const positions = holdings.reduce((s2, h) => s2 + inCad(h.marketValueCents ?? 0, h.currency), 0);
        const usdSleeve = accounts
          .filter((a) => a.currency === 'USD')
          .reduce((s2, a) => s2 + (a.totalValueCents ?? 0), 0);
        const navCad = accounts.reduce((s2, a) => s2 + inCad(a.totalValueCents ?? 0, a.currency), 0);
        const navUsd = rate != null && rate > 0 ? Math.round(navCad / rate) : null;
        const openPnl = holdings.reduce((s2, h) => s2 + inCad(h.openPnlCents ?? 0, h.currency), 0);
        const daily = m.dailyValues ?? [];
        const prev = daily.length >= 2 ? daily[daily.length - 2].valueCents : null;
        const last = daily.length >= 1 ? daily[daily.length - 1].valueCents : null;
        const dayDelta = prev != null && last != null ? last - prev : null;
        const dayBps = prev && dayDelta != null ? Math.round((dayDelta / prev) * 10_000) : null;
        const rows = holdings
          .sort((a, b) => a.symbol.localeCompare(b.symbol))
          .map((h) => ({
            row: {
              symbol: h.symbol,
              logoUrl: h.logoUrl ?? null,
              qtyLine: `${h.qty} sh${h.priceCents != null ? ` @ ${h.currency === 'USD' ? usMoney(h.priceCents) : money(h.priceCents)}` : ''}`,
              valueCents: h.marketValueCents,
              pnlCents: h.openPnlCents,
              usd: h.currency === 'USD',
            } as BookRow,
            country: countryOf(h.currency),
          }));
        // Cash as its own visible row in the book (web accounts-page parity,
        // Cam 2026-07-03) — real since the SnapTrade balances fix.
        if (cad > 0) {
          rows.push({
            row: { symbol: '$', label: 'Cash', logoUrl: null, qtyLine: 'uninvested cash', valueCents: cad, cash: true },
            country: 'Canada',
          });
        }
        if (usd > 0) {
          rows.push({
            row: { symbol: '$', label: 'Cash', logoUrl: null, qtyLine: 'uninvested cash (USD)', valueCents: usd, usd: true, cash: true },
            country: 'United States',
          });
        }
        const groups = groupBy(rows, (r) => r.country);
        const bookGroups = new Map([...groups.entries()].map(([k, v]) => [k, v.map((x) => x.row)]));
        const cashLine = [cad > 0 ? money(cad) : null, usd > 0 ? `US${money(usd)}` : null].filter(Boolean).join(' + ');
        const synced = accounts.map((a) => a.syncedAt).filter(Boolean).sort().pop();

        if (!(m.connected && accounts.length > 0)) {
          return (
            <View key={m.email} style={{ marginTop: 16 }}>
              <Card>
                <Text style={[s.empty, { color: p.textMuted }]}>
                  Not connected yet —{' '}
                  <Text
                    style={{ color: p.accentText, fontFamily: F.med }}
                    onPress={() => router.push('/accounts')}
                  >
                    link your brokerage in Settings → Accounts
                  </Text>
                  .
                </Text>
              </Card>
            </View>
          );
        }

        // Structurally IDENTICAL to Alfred's view: hero (NET ASSET VALUE) →
        // The Tape → The book.
        return (
          <View key={m.email}>
            {broken && (
              <ReconnectBanner
                authorizationId={broken.authorizationId ?? null}
                syncedAt={synced ? String(synced).slice(0, 10) : null}
                p={p}
                onFixed={onChanged}
              />
            )}
            <View style={s.hero}>
              <Text style={[s.heroLabel, { color: p.textMuted }]}>NET ASSET VALUE</Text>
              <Text style={[s.heroNav, tabular, { color: p.textPrimary }]}>{money(navCad)}</Text>
              {navUsd != null ? (
                <Text style={[s.heroUsd, tabular, { color: p.textMuted }]}>≈ {usMoney(navUsd)}</Text>
              ) : usdSleeve > 0 ? (
                // No BoC rate on the wire (pre-deploy / BoC down) — show the USD sleeve unconverted.
                <Text style={[s.heroUsd, tabular, { color: p.textMuted }]}>+ {usMoney(usdSleeve)} in USD accounts</Text>
              ) : null}
              <View style={s.heroRow}>
                {dayDelta != null && dayBps != null && (
                  <Text style={[s.heroPnl, tabular, { color: pnlColor(dayDelta, p) }]}>
                    {signedMoney(dayDelta)} ({signedPctFromBps(dayBps)}) vs yesterday
                  </Text>
                )}
                <Text style={[s.heroPnl, tabular, { color: pnlColor(openPnl, p) }]}>
                  {signedMoney(openPnl)} open P&L
                </Text>
              </View>
            </View>

            {daily.length >= 2 && (
              <View>
                <SectionTitle sub="value over time · nightly sync">The Tape</SectionTitle>
                <Card>
                  <Sparkline values={daily.map((d) => d.valueCents)} height={64} />
                  <View style={s.tapeLabels}>
                    <Text style={[s.tapeLabel, { color: p.textMuted }]}>{daily[0].date}</Text>
                    <Text style={[s.tapeLabel, { color: p.textMuted }]}>{daily[daily.length - 1].date}</Text>
                  </View>
                </Card>
              </View>
            )}

            <SectionTitle sub="what you're holding">The book</SectionTitle>
            <CashStrip cad={cad} usd={usd} positions={positions} p={p} />
            <View style={{ marginTop: 10 }}>
              <CountryBook
                groups={bookGroups}
                empty={
                  cashLine
                    ? `All cash — ${cashLine} uninvested, no holdings.`
                    : 'No holdings synced yet.'
                }
              />
            </View>
            {synced && <Footnote>synced {String(synced).slice(0, 10)}</Footnote>}
          </View>
        );
      })}
      <Footnote>
        read-only via SnapTrade — Alfred can neither see nor trade these accounts, ever
      </Footnote>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 22 },
  heroLabel: { fontFamily: F.semi, fontSize: 10, letterSpacing: 2 },
  heroNav: { fontFamily: 'System', fontWeight: '800', fontSize: 40, marginTop: 4, letterSpacing: -0.5 },
  heroUsd: { fontFamily: F.semi, fontSize: 13, marginTop: 2 },
  heroRow: { flexDirection: 'row', gap: 14, marginTop: 6 },
  heroPnl: { fontFamily: F.semi, fontSize: 12.5 },
  tapeLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  tapeLabel: { fontFamily: F.reg, fontSize: 9.5 },
  cashCard: { flexDirection: 'row', paddingVertical: 12 },
  cashStat: { flex: 1, alignItems: 'center' },
  cashLabel: { fontFamily: F.med, fontSize: 10 },
  cashValue: { fontFamily: F.semi, fontSize: 14, marginTop: 3 },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowMain: { flex: 1, minWidth: 0 },
  rowRight: { alignItems: 'flex-end' },
  rowRightSub: { flexDirection: 'row', gap: 8, marginTop: 1 },
  sym: { fontFamily: F.semi, fontSize: 14 },
  sub: { fontFamily: F.reg, fontSize: 11, marginTop: 1 },
  subPct: { fontFamily: F.semi, fontSize: 11 },
  val: { fontFamily: F.semi, fontSize: 13.5 },
  empty: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18, paddingVertical: 6 },
  briefDay: { fontFamily: F.semi, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 2, marginBottom: 2 },
  briefRow: { paddingVertical: 9 },
  briefHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  briefKind: { fontFamily: F.bold, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5 },
  briefTime: { fontFamily: F.reg, fontSize: 10.5 },
  briefSummary: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, marginTop: 3 },
});
