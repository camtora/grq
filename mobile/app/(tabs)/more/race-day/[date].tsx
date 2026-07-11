import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SubScreen, Card, Loading, ErrorNote, Footnote, Masonry } from '../../../../components/Chrome';
import MdText from '../../../../components/MdText';
import { usePalette, F } from '../../../../constants/theme';
import { useResponsive } from '../../../../constants/layout';
import { signedMoney, pnlColor, fmtDate } from '../../../../lib/format';
import { useApi } from '../../../../services/hooks';
import {
  tabular, Pill, ActionChip, BookList, KIND_LABEL, etToday, addDays,
  type RaceDayResponse, type RaceSession, type RaceModel,
} from '../../../../components/race/shared';

/** "gpt-5.1" → "Gpt 5.1" — only for a model missing from the day's standings. */
function fallbackLabel(id: string): string {
  const tail = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
  return tail.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Roll up one model's calls across the day (web SessionMatrix daySummary). */
function daySummary(sessions: RaceSession[], model: string) {
  const buys: string[] = [];
  const sells: string[] = [];
  let holds = 0;
  let reads = 0;
  for (const sess of sessions) {
    const c = sess.cells[model];
    if (!c) continue;
    if (c.action === 'BUY' && c.symbol) buys.push(`${c.symbol}${c.qty ? ` ×${c.qty}` : ''}`);
    else if (c.action === 'SELL' && c.symbol) sells.push(c.symbol);
    else if (c.action === 'HOLD') holds++;
    else reads++; // NONE / stand-down / pure read
  }
  return { buys, sells, holds, reads };
}

/** What one side did across the day: bought / sold / held, then its book. */
function SummaryCard({
  model, label, sessions, book, champ,
}: {
  model: string;
  label: string;
  sessions: RaceSession[];
  book: RaceModel['positions'];
  champ: boolean;
}) {
  const { p } = usePalette();
  if (!model) return null;
  const { buys, sells, holds, reads } = daySummary(sessions, model);
  const Row = ({ name, value, color }: { name: string; value: string; color: string }) => (
    <View style={s.sumRow}>
      <Text style={[s.sumKey, { color: p.textMuted }]}>{name}</Text>
      <Text style={[s.sumVal, tabular, { color }]}>{value}</Text>
    </View>
  );
  return (
    <View style={[s.cell, { borderColor: champ ? p.accent + '55' : p.cardBorder, backgroundColor: p.cardBg }]}>
      <Text style={[s.cellName, { color: p.textPrimary }]}>
        {champ ? '★ ' : ''}{label} — today
      </Text>
      <View style={{ gap: 3, marginTop: 6 }}>
        <Row name="Bought" value={buys.length ? buys.join(', ') : '—'} color={p.pos} />
        <Row name="Sold" value={sells.length ? sells.join(', ') : '—'} color={p.neg} />
        <Row
          name="Held"
          value={`${holds} hold${holds === 1 ? '' : 's'}${reads ? ` · ${reads} read${reads === 1 ? '' : 's'}` : ''}`}
          color={p.textPrimary}
        />
      </View>
      {book && book.length > 0 ? (
        <View style={[s.cellBook, { borderTopColor: p.cardBorder }]}>
          <Text style={[s.miniLabel, { color: p.textMuted, marginBottom: 4 }]}>Book (what it owns)</Text>
          <BookList positions={book} />
        </View>
      ) : null}
    </View>
  );
}

/** One model's call for one session (web SessionMatrix ModelCell). */
function ModelCell({
  session, model, label, champ,
}: {
  session: RaceSession;
  model: string;
  label: string;
  champ: boolean;
}) {
  const { p } = usePalette();
  if (!model) return null;
  const cell = session.cells[model];
  if (!cell) {
    return (
      <View style={[s.cell, { borderColor: p.cardBorder, opacity: 0.5 }]}>
        <Text style={[s.cellMeta, { color: p.textMuted }]}>{label} — no call this session</Text>
      </View>
    );
  }
  const directional = cell.action === 'BUY' || cell.action === 'SELL';
  return (
    <View style={[s.cell, { borderColor: champ ? p.accent + '55' : p.cardBorder }]}>
      <View style={s.cellHead}>
        <Text numberOfLines={1} style={[s.cellName, { color: p.textPrimary, flexShrink: 1 }]}>
          {champ ? '★ ' : ''}{label}
        </Text>
        <View style={s.cellChips}>
          <ActionChip action={cell.action} />
          {cell.pnlCadCents != null ? (
            <Text style={[s.cellPnl, tabular, { color: pnlColor(cell.pnlCadCents, p) }]}>
              {signedMoney(cell.pnlCadCents)}
            </Text>
          ) : null}
        </View>
      </View>
      {directional && cell.symbol ? (
        <Text style={[s.cellMeta, tabular, { color: p.textMuted, marginTop: 4 }]}>
          <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>
            {cell.action} {cell.qty ?? ''} {cell.symbol}
          </Text>
          {cell.confidence != null ? ` · ${cell.confidence}%` : ''}
          {cell.unpriced ? ' · unpriced' : ''}
        </Text>
      ) : null}
      {cell.text ? (
        <View style={[s.cellBody, { borderTopColor: p.cardBorder }]}>
          <MdText body={cell.text} foldAt={420} />
        </View>
      ) : null}
    </View>
  );
}

/** One race day — day standings strip + the champion-vs-challenger call matrix
 * (web /race/[date]). Tap a challenger in the strip to swap the compare. */
export default function RaceDayScreen() {
  const { p } = usePalette();
  const { isTablet } = useResponsive();
  const router = useRouter();
  const params = useLocalSearchParams<{ date: string; vs?: string }>();
  const today = etToday();
  const date = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const { data, error, loading, refreshing, refresh } = useApi<RaceDayResponse>(`/api/race/day/${date}`);
  const d = data && data.date === date ? data : null;

  const [picked, setPicked] = useState<string | null>(typeof params.vs === 'string' ? params.vs : null);

  const standings = d?.standings ?? [];
  const labelFor = (m: string) => standings.find((x) => x.model === m)?.label ?? fallbackLabel(m);
  const champion = standings.find((x) => x.role === 'champion')?.model ?? d?.models[0] ?? '';
  const challengers = standings.filter((x) => x.role !== 'champion').map((x) => x.model);
  const selected = picked && challengers.includes(picked) ? picked : challengers[0] ?? '';
  const bookFor = (m: string) => standings.find((x) => x.model === m)?.positions ?? [];

  // Day-by-day nav swaps the route in place (keeps back → the overview) and
  // carries the picked challenger along.
  const goto = (nextDate: string) =>
    router.replace(
      `/more/race-day/${nextDate}${selected ? `?vs=${encodeURIComponent(selected)}` : ''}`,
    );

  return (
    <SubScreen title="Second Opinions" refreshing={refreshing} onRefresh={refresh}>
      <View style={s.nav}>
        <Pressable onPress={() => goto(addDays(date, -1))} hitSlop={8} style={s.navBtn}>
          <Ionicons name="chevron-back" size={16} color={p.accentText} />
          <Text style={[s.navText, { color: p.accentText }]}>{addDays(date, -1).slice(5)}</Text>
        </Pressable>
        <Text style={[s.navDate, { color: p.textPrimary }]}>{fmtDate(date)}</Text>
        {date < today ? (
          <Pressable onPress={() => goto(addDays(date, 1))} hitSlop={8} style={[s.navBtn, s.navRight]}>
            <Text style={[s.navText, { color: p.accentText }]}>{addDays(date, 1).slice(5)}</Text>
            <Ionicons name="chevron-forward" size={16} color={p.accentText} />
          </Pressable>
        ) : (
          <View style={[s.navBtn, s.navRight]} />
        )}
      </View>

      {!d && !error && <Loading />}
      {error && !d && <ErrorNote message={error} />}

      {d && !d.hasData && (
        <Card style={{ marginTop: 12 }}>
          <Text style={[s.cellName, { color: p.textPrimary }]}>No races this day</Text>
          <Text style={[s.cellMeta, { color: p.textMuted, marginTop: 4 }]}>
            Sessions land on market days — try the previous day.
          </Text>
        </Card>
      )}

      {d && d.hasData && (
        <View>
          {/* Day standings — champion pinned, tap a challenger to compare it with ★ Opus. */}
          <Text style={[s.miniLabel, { color: p.textMuted, marginTop: 14, marginBottom: 6 }]}>
            Day standings — tap a challenger to compare
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {standings.map((m, i) => {
              const champ = m.role === 'champion';
              const sel = m.model === selected;
              return (
                <Pressable
                  key={m.model}
                  disabled={champ}
                  onPress={() => setPicked(m.model)}
                  style={[
                    s.stripTile,
                    { borderColor: p.cardBorder, backgroundColor: p.cardBg },
                    champ && { borderColor: p.accent + '66', backgroundColor: p.accent + '0d' },
                    sel && { borderColor: p.accent, backgroundColor: p.accent + '1f' },
                  ]}
                >
                  <Text style={[s.stripRank, tabular, { color: p.textMuted }]}>
                    #{i + 1}{champ ? ' ★' : ''}
                  </Text>
                  <Text numberOfLines={1} style={[s.stripLabel, { color: p.textPrimary }]}>{m.label}</Text>
                  {m.scoredCalls ? (
                    <Text style={[s.stripPnl, tabular, { color: pnlColor(m.pnlCadCents, p) }]}>
                      {signedMoney(m.pnlCadCents)}
                    </Text>
                  ) : (
                    <Text style={[s.stripPnl, { color: p.textMuted, opacity: 0.5 }]}>—</Text>
                  )}
                  <Text style={[s.stripHit, tabular, { color: p.textMuted }]}>
                    {m.hitRate != null ? `${Math.round(m.hitRate * 100)}% hit` : '—'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Today so far — what each side did across all sessions */}
          <Text style={[s.miniLabel, { color: p.textMuted, marginTop: 16, marginBottom: 6 }]}>
            Today so far · ★ {labelFor(champion)} vs {selected ? labelFor(selected) : 'pick a challenger above'}
          </Text>
          {/* Champion vs challenger sit side by side on an iPad, stacked on a phone (§9). */}
          <Masonry columns={isTablet && !!selected ? 2 : 1} style={{ gap: 8 }}>
            <SummaryCard model={champion} label={labelFor(champion)} sessions={d.sessions} book={bookFor(champion)} champ />
            {selected ? (
              <SummaryCard model={selected} label={labelFor(selected)} sessions={d.sessions} book={bookFor(selected)} champ={false} />
            ) : null}
          </Masonry>

          {/* Session-by-session calls */}
          {d.sessions.map((sess) => (
            <Card key={sess.key} style={{ marginTop: 12 }}>
              <View style={s.sessHead}>
                <Pill text={KIND_LABEL[sess.kind] ?? sess.kind} color={p.accentText} />
                <Text numberOfLines={2} style={[s.sessReason, { color: p.textMuted, flex: 1 }]}>{sess.reason}</Text>
                <Text style={[s.sessTime, tabular, { color: p.textMuted }]}>{fmtTime(sess.at)}</Text>
              </View>
              <Masonry columns={isTablet && !!selected ? 2 : 1} style={{ gap: 8, marginTop: 10 }}>
                <ModelCell session={sess} model={champion} label={labelFor(champion)} champ />
                {selected ? (
                  <ModelCell session={sess} model={selected} label={labelFor(selected)} champ={false} />
                ) : null}
              </Masonry>
            </Card>
          ))}

          <Footnote>
            same frozen prompt, session by session — the challengers are shadow-only and never
            touch the order gate; P&L marked to the live price, in CAD
          </Footnote>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 76 },
  navRight: { justifyContent: 'flex-end' },
  navText: { fontFamily: F.med, fontSize: 12 },
  navDate: { flex: 1, textAlign: 'center', fontFamily: 'System', fontWeight: '800', fontSize: 14 },
  miniLabel: { fontFamily: F.semi, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.8 },
  stripTile: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, width: 108 },
  stripRank: { fontFamily: F.reg, fontSize: 9.5 },
  stripLabel: { fontFamily: F.semi, fontSize: 11.5, marginTop: 1 },
  stripPnl: { fontFamily: F.semi, fontSize: 12.5, marginTop: 3 },
  stripHit: { fontFamily: F.reg, fontSize: 9.5, marginTop: 1 },
  cell: { borderWidth: 1, borderRadius: 12, padding: 10 },
  cellHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cellChips: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cellName: { fontFamily: F.semi, fontSize: 12.5 },
  cellPnl: { fontFamily: F.semi, fontSize: 11.5 },
  cellMeta: { fontFamily: F.reg, fontSize: 11.5 },
  cellBody: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 8 },
  cellBook: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 8 },
  sumRow: { flexDirection: 'row', gap: 8 },
  sumKey: { fontFamily: F.reg, fontSize: 11.5, width: 48 },
  sumVal: { fontFamily: F.med, fontSize: 11.5, flex: 1 },
  sessHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessReason: { fontFamily: F.reg, fontSize: 11.5 },
  sessTime: { fontFamily: F.reg, fontSize: 10.5 },
});
