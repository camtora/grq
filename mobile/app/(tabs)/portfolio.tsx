import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen, Card, SectionTitle, Footnote, Divider, Segmented, MiniLabel, Loading, ErrorNote } from '../../components/Chrome';
import StockLogo from '../../components/StockLogo';
import Sparkline from '../../components/Sparkline';
import { usePalette, F, type Palette } from '../../constants/theme';
import { money, signedMoney, signedPctFromBps, pnlColor } from '../../lib/format';
import { useApi } from '../../services/hooks';
import type { Portfolio, AccountsResponse, Today } from '../../services/types';

const tabular = { fontVariant: ['tabular-nums' as const] };

/** Portfolio — split between the fund (Alfred, default) and the members' own
 * brokerage accounts (Personal, read-only via SnapTrade; Alfred can't see
 * these — D97). Both views share the same book structure: cash strip, then
 * holdings under Canada / United States headers. */
export default function PortfolioScreen() {
  const [view, setView] = useState<'alfred' | 'personal'>('alfred');
  const pf = useApi<Portfolio>('/api/portfolio');
  const today = useApi<Today>('/api/today');
  const accounts = useApi<AccountsResponse>('/api/accounts');

  const refreshing = pf.refreshing || today.refreshing || accounts.refreshing;
  const refresh = () => {
    pf.refresh();
    today.refresh();
    accounts.refresh();
  };

  return (
    <Screen title="Portfolio" refreshing={refreshing} onRefresh={refresh}>
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
      {view === 'alfred' ? (
        <AlfredView pf={pf.data} t={today.data} loading={pf.loading} error={pf.error} />
      ) : (
        <PersonalView data={accounts.data} loading={accounts.loading} error={accounts.error} />
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
};

function countryOf(currency: string): string {
  if (currency === 'USD') return 'United States';
  if (currency === 'CAD') return 'Canada';
  return 'Other';
}

function BookRowView({ r }: { r: BookRow }) {
  const { p } = usePalette();
  return (
    <View style={s.row}>
      <StockLogo symbol={r.symbol} logoUrl={r.logoUrl} size={32} />
      <View style={s.rowMain}>
        <Text style={[s.sym, { color: p.accentText }]}>{r.symbol}</Text>
        <Text style={[s.sub, tabular, { color: p.textMuted }]} numberOfLines={1}>{r.qtyLine}</Text>
      </View>
      <View style={s.rowRight}>
        {r.valueCents != null && (
          <Text style={[s.val, tabular, { color: p.textPrimary }]}>{money(r.valueCents)}</Text>
        )}
        <View style={s.rowRightSub}>
          {r.dayBps != null && (
            <Text style={[s.subPct, tabular, { color: pnlColor(r.dayBps, p) }]}>
              {signedPctFromBps(r.dayBps)}
            </Text>
          )}
          {r.pnlCents != null && (
            <Text style={[s.subPct, tabular, { color: pnlColor(r.pnlCents, p) }]}>
              {signedMoney(r.pnlCents)}
            </Text>
          )}
        </View>
      </View>
    </View>
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

function AlfredView({ pf, t, loading, error }: { pf: Portfolio | null; t: Today | null; loading: boolean; error: string | null }) {
  const { p } = usePalette();
  if (loading) return <Loading />;
  if (error && !pf) return <View style={{ marginTop: 16 }}><ErrorNote message={error} /></View>;
  if (!pf) return null;

  const rows = [...pf.positions]
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((pos) => ({
      row: {
        symbol: pos.symbol,
        logoUrl: pos.logoUrl,
        qtyLine: `${pos.qty} sh @ ${money(pos.avgCostCents)}${pos.currency === 'USD' ? ' US' : ''}`,
        valueCents: pos.marketValueCents,
        dayBps: pos.dayChangeBps,
        pnlCents: pos.unrealizedPnlCents,
      },
      country: countryOf(pos.currency),
    }));
  const groups = groupBy(rows, (r) => r.country);
  const bookGroups = new Map([...groups.entries()].map(([k, v]) => [k, v.map((x) => x.row)]));
  const tape = t?.tape ?? [];

  return (
    <View>
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

      {/* Hero — NAV + day & total P&L */}
      <View style={s.hero}>
        <Text style={[s.heroLabel, { color: p.textMuted }]}>NET ASSET VALUE</Text>
        <Text style={[s.heroNav, tabular, { color: p.textPrimary }]}>{money(pf.navCents)}</Text>
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

      {/* The book — cash strip, then holdings by country */}
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

      {/* Latest fund-level briefing (symbol-null reads only — the house rule) */}
      {t?.leadStoryMarkdown && (
        <View>
          <SectionTitle sub="the latest fund-level read">{t.leadTitle.split('·')[0].trim()}</SectionTitle>
          <Card>
            <Briefing body={t.leadStoryMarkdown} />
          </Card>
        </View>
      )}
    </View>
  );
}

/** Markdown briefing, shown as plain text with a read-more fold. */
function Briefing({ body }: { body: string }) {
  const { p } = usePalette();
  const [open, setOpen] = useState(false);
  const text = body
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`/g, '')
    .trim();
  const folded = !open && text.length > 420;
  return (
    <View>
      <Text style={{ color: p.textPrimary, fontFamily: F.reg, fontSize: 13, lineHeight: 20 }}>
        {folded ? `${text.slice(0, 420).trimEnd()}…` : text}
      </Text>
      {text.length > 420 && (
        <Text
          onPress={() => setOpen(!open)}
          style={{ color: p.accentText, fontFamily: F.semi, fontSize: 12, marginTop: 8 }}
        >
          {open ? 'show less' : 'read more'}
        </Text>
      )}
    </View>
  );
}

/* ---------- Personal (SnapTrade — read-only, same book structure) ---------- */

function PersonalView({ data, loading, error }: { data: AccountsResponse | null; loading: boolean; error: string | null }) {
  const { p } = usePalette();
  if (loading) return <Loading />;
  if (error && !data) return <View style={{ marginTop: 16 }}><ErrorNote message={error} /></View>;
  if (!data) return null;

  return (
    <View>
      {data.members.map((m) => {
        const accounts = m.connected ? m.accounts.filter((a) => !a.disabled) : [];
        const cad = accounts.filter((a) => a.currency === 'CAD').reduce((s2, a) => s2 + (a.cashCents ?? 0), 0);
        const usd = accounts.filter((a) => a.currency === 'USD').reduce((s2, a) => s2 + (a.cashCents ?? 0), 0);
        const holdings = accounts.flatMap((a) => a.holdings);
        const positions = holdings.reduce((s2, h) => s2 + (h.marketValueCents ?? 0), 0);
        const total = accounts.reduce((s2, a) => s2 + (a.totalValueCents ?? 0), 0);
        const openPnl = holdings.reduce((s2, h) => s2 + (h.openPnlCents ?? 0), 0);
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
              logoUrl: null,
              qtyLine: `${h.qty} sh${h.priceCents != null ? ` @ ${money(h.priceCents)}` : ''}${h.currency === 'USD' ? ' US' : ''}`,
              valueCents: h.marketValueCents,
              pnlCents: h.openPnlCents,
            },
            country: countryOf(h.currency),
          }));
        const groups = groupBy(rows, (r) => r.country);
        const bookGroups = new Map([...groups.entries()].map(([k, v]) => [k, v.map((x) => x.row)]));
        const synced = accounts.map((a) => a.syncedAt).filter(Boolean).sort().pop();

        if (!(m.connected && accounts.length > 0)) {
          return (
            <View key={m.email}>
              <SectionTitle sub={m.isSelf ? '· you' : undefined}>{m.name}</SectionTitle>
              <Card>
                <Text style={[s.empty, { color: p.textMuted }]}>
                  {m.isSelf
                    ? 'Not connected yet — link your brokerage on the web Accounts page.'
                    : `${m.name} hasn't connected an account yet.`}
                </Text>
              </Card>
            </View>
          );
        }

        // Every member's section is structurally IDENTICAL to Alfred's view:
        // hero (NET ASSET VALUE) → The Tape → The book.
        return (
          <View key={m.email}>
            <SectionTitle sub={m.isSelf ? '· you' : undefined}>{m.name}</SectionTitle>

            <View style={s.hero}>
              <Text style={[s.heroLabel, { color: p.textMuted }]}>NET ASSET VALUE</Text>
              <Text style={[s.heroNav, tabular, { color: p.textPrimary }]}>{money(total)}</Text>
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

            <SectionTitle sub={m.isSelf ? "what you're holding" : `what ${m.name} is holding`}>
              The book
            </SectionTitle>
            <CashStrip cad={cad} usd={usd} positions={positions} p={p} />
            <View style={{ marginTop: 10 }}>
              <CountryBook groups={bookGroups} empty="No holdings synced yet." />
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
  heroNav: { fontFamily: F.display, fontSize: 40, marginTop: 4, letterSpacing: -0.5 },
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
});
