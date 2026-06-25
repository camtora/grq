import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { universeEntry, bareTicker, yahooForListing } from "@/lib/universe";
import { fmpLogo } from "@/lib/logos";
import { getQuote } from "@/lib/broker/quotes";
import { getCloses, refreshBars } from "@/lib/bars";
import { computeSignals, overallSignal, signalsOneLine } from "@/agent/signals";
import { DIALS } from "@/agent/policy";
import { getScoreboard } from "@/lib/scoreboard";
import { getSession, displayName } from "@/lib/session";
import { otherMemberEmail, userForEmail } from "@/lib/users";
import UniverseActions from "@/components/UniverseActions";
import AddNote from "@/components/AddNote";
import RecordFilter from "@/components/RecordFilter";
import AskGrq from "@/components/AskGrq";
import ShareStockButton from "@/components/ShareStockButton";
import { money, signedMoney, pct, fmtWhen, pnlClass } from "@/lib/money";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";
import RatingBar from "@/components/RatingBar";
import WatchButton from "@/components/WatchButton";
import WatchedBy from "@/components/hunt/WatchedBy";
import { personByName } from "@/lib/people";
import { fmpEnabled, fmpAnalystTarget, fmpPeerComparison, fmpEarningsReport, fmpStockNews, fmpGrades, fmpGradeActions, fmpGradesTrend, fmpTargetTrend, fmpInstitutional, fmpTopHolders } from "@/lib/fmp";
import { getSmartMoneyForSymbol } from "@/lib/smart-money/queries";
import StockSmartMoney from "@/components/smart-money/StockSmartMoney";
import LiveQuote from "@/components/LiveQuote";
import StockLogo from "@/components/StockLogo";
import { Card, Chip, StatCard, Pnl } from "@/components/ui";
import Md from "@/components/Md";
import CollapsibleMd from "@/components/CollapsibleMd";
import Sparkline from "@/components/Sparkline";
import PriceChart from "@/components/PriceChart";
import Scoreboard from "@/components/Scoreboard";
import DirectiveButtons from "@/components/DirectiveButtons";
import Term from "@/components/Term";

// Always render fresh on the server — never a prefetch-cached copy. A find researched
// AFTER it was first opened (e.g. its full dossier landed) must show the NEW dossier when
// navigated to from the hunt page, not a stale "hunt dossier" snapshot (2026-06-23).
export const dynamic = "force-dynamic";

const SIG_TONE: Record<string, "green" | "red" | "dim"> = { BUY: "green", SELL: "red", HOLD: "dim" };

// Honest empty state for a data panel that has no coverage for this name. Every
// panel renders on every stock page (CA or US, held or not) — when a feed is dark
// we say so + why, rather than hiding the panel and making pages inconsistent.
// Compact "today / 3d / 2w / 4mo" relative age from a YYYY-MM-DD date — used for
// analyst-action timestamps in the ratings panel.
function agoShort(dateStr: string): string {
  const t = Date.parse(dateStr);
  if (isNaN(t)) return "";
  const days = Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  if (days < 1) return "today";
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
}

// 13F holder names arrive ALL-CAPS ("BLACKROCK, INC.") — title-case them for the
// panel, but keep the common corporate-form tokens upper (LLC, LP, INC…).
const HOLDER_UPPER = new Set(["LLC", "LP", "NA", "PLC", "AG", "SA", "NV", "LTD", "INC", "CO", "SE", "LLP"]);
function prettyHolder(name: string): string {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => {
      const bare = w.replace(/[.,]/g, "").toUpperCase();
      if (HOLDER_UPPER.has(bare)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ")
    .replace(/,\s*$/, "");
}

// Compact revenue: $111.2B / $940M — for the earnings actual-vs-estimate bullets.
function fmtRev(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v).toLocaleString()}`;
}

function PanelEmpty({ reason }: { reason: string }) {
  return (
    <Card className="flex flex-1 items-center p-4 text-sm">
      <p className="text-teal-200/40">{reason}</p>
    </Card>
  );
}

function SourceChips({ sourcesJson }: { sourcesJson: string | null }) {
  if (!sourcesJson) return null;
  let sources: string[] = [];
  try {
    sources = JSON.parse(sourcesJson);
  } catch {
    return null;
  }
  if (sources.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((s, i) => (
        <span key={i} className="rounded-full border border-teal-400/15 bg-teal-400/5 px-2 py-0.5 text-[10px] text-teal-200/60">
          {s}
        </span>
      ))}
    </div>
  );
}

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = raw.toUpperCase();
  const session = await getSession();
  const me = displayName(session);
  const isMember = session?.role === "member";
  const otherEmail = session ? otherMemberEmail(session.email) : null;
  const otherName = otherEmail ? (userForEmail(otherEmail)?.name ?? null) : null;
  const realEntry = await universeEntry(symbol);
  let entry = realEntry;
  // Whether the name is actually in the universe. An untracked-but-researched find gets a
  // SYNTHESISED row below so it renders the SAME rich page as a tracked name — the
  // universe-lifecycle controls (promote/demote/retire) are gated on `tracked`.
  const tracked = !!realEntry;

  // Not in the universe — synthesise a row from the dossier's listing so a researched find
  // (e.g. a discovery-hunt name) renders the FULL rich page, not a stripped text view. A
  // genuinely unknown symbol (no journal, no quote, no research in flight) still 404s.
  if (!entry) {
    const [pquote, pjournal, pendingReq] = await Promise.all([
      getQuote(symbol).catch(() => null),
      prisma.journalEntry.findMany({ where: { symbol }, orderBy: { at: "desc" }, take: 30 }),
      prisma.researchRequest.findFirst({ where: { symbol, status: { in: ["QUEUED", "RUNNING"] } } }),
    ]);
    if (pjournal.length === 0 && !pquote && !pendingReq) notFound();

    // On-demand full dossier (Cam 2026-06-19, D46): the hunt writes only LEADS, so opening a
    // find's page is what kicks off its FULL dossier — idempotent (skipped once a full
    // "Dossier —" exists or research is already in flight). Members only.
    const hasResearch = pjournal.some((j) => j.kind === "RESEARCH");
    const hasFullDossier = pjournal.some((j) => j.kind === "RESEARCH" && j.title.startsWith("Dossier"));
    if (isMember && hasResearch && !hasFullDossier && !pendingReq) {
      try {
        await prisma.researchRequest.create({ data: { symbol: bareTicker(symbol), requestedBy: me } });
      } catch {
        /* best-effort — a race just means it's already queued */
      }
    }

    // The synthesised row: resolve the listing from the dossier's exchange (so FMP/quotes/
    // logo key correctly), derive currency from the suffix. The "researching…" state still
    // surfaces via researchInFlight below; the action row offers Watch + Share (not the
    // universe lifecycle) since the name isn't tracked.
    const listingEntry = pjournal.find((j) => j.kind === "RESEARCH" && j.exchange) ?? null;
    const yahoo = yahooForListing(symbol, listingEntry?.exchange);
    const cadListing = /\.(TO|V|NE|CN)$/i.test(yahoo);
    entry = {
      symbol,
      yahoo,
      name: pjournal.find((j) => j.companyName)?.companyName ?? symbol,
      tier: null,
      status: "CANDIDATE",
      addedBy: null,
      promotionRequestedBy: null,
      proposedTier: null,
      note: null,
      logoUrl: fmpLogo(yahoo),
      sector: null,
      industry: null,
      country: cadListing ? "CA" : "US",
      currency: cadListing ? "CAD" : "USD",
      exchange: listingEntry?.exchange ?? null,
      marketCapM: null,
    };
  }

  const researchInFlight =
    (await prisma.researchRequest.count({
      where: { symbol, status: { in: ["QUEUED", "RUNNING"] } },
    })) > 0;

  const [quote, position, watch, trades, journal, closes, signals, directive, symbolScores, analyst, peers, earnings, news, grades, gradeActions, gradesTrend, targetTrend, institutional, holders, smartMoney, settings] =
    await Promise.all([
      getQuote(symbol),
      prisma.position.findUnique({ where: { symbol } }),
      prisma.agentFocus.findUnique({ where: { symbol } }),
      prisma.trade.findMany({ where: { symbol }, orderBy: { at: "desc" }, take: 50 }),
      prisma.journalEntry.findMany({ where: { symbol }, orderBy: { at: "desc" }, take: 50 }),
      // Self-heal the price tape for untracked names (dossier'd hunt finds, candidates):
      // bars only get nightly-refreshed for tracked symbols, so an untracked page would
      // otherwise have no closes → no tape/sparkline. Mirror the market/feed self-heal —
      // if the DB has nothing, backfill from Yahoo once (keyed by the bare route symbol,
      // toYahoo() resolves the listing) and re-read. First-visit only; then it's cached.
      (async () => {
        let c = await getCloses(symbol, 260).catch(() => []);
        if (c.length < 2) {
          await refreshBars([symbol], "1y").catch(() => 0);
          c = await getCloses(symbol, 260).catch(() => []);
        }
        return c;
      })(),
      computeSignals(symbol).catch(() => null),
      prisma.symbolDirective.findUnique({ where: { symbol } }),
      getScoreboard(symbol).catch(() => []),
      fmpEnabled() ? fmpAnalystTarget(entry.yahoo).catch(() => null) : Promise.resolve(null),
      fmpEnabled() ? fmpPeerComparison(entry.yahoo).catch(() => []) : Promise.resolve([]),
      fmpEnabled() ? fmpEarningsReport(entry.yahoo).catch(() => null) : Promise.resolve(null),
      fmpEnabled() ? fmpStockNews(entry.yahoo, 5).catch(() => []) : Promise.resolve([]),
      fmpEnabled() ? fmpGrades(entry.yahoo).catch(() => null) : Promise.resolve(null),
      fmpEnabled() ? fmpGradeActions(entry.yahoo).catch(() => []) : Promise.resolve([]),
      fmpEnabled() ? fmpGradesTrend(entry.yahoo).catch(() => null) : Promise.resolve(null),
      fmpEnabled() ? fmpTargetTrend(entry.yahoo).catch(() => null) : Promise.resolve(null),
      fmpEnabled() ? fmpInstitutional(entry.yahoo).catch(() => null) : Promise.resolve(null),
      fmpEnabled() ? fmpTopHolders(entry.yahoo).catch(() => []) : Promise.resolve([]),
      getSmartMoneyForSymbol(symbol).catch(() => null),
      prisma.settings.findUnique({ where: { id: 1 } }),
    ]);
  // The risk dial sets the deterministic exits (enforceExits): a protective stop
  // stopPct% below ACB and a take-profit takeProfitPct% above it — both enforced in
  // code each tick, so the levels below are the REAL ones, not aspirational (D11).
  const dial = DIALS[settings?.riskLevel ?? "BALANCED"];

  const currentRead = journal.find((j) => j.kind === "DECISION" || j.kind === "RESEARCH");
  // Who's watching: the member who put this name on the watchlist (UniverseMember.addedBy),
  // resolved to a real person so agent/seed/migration adds don't surface a pill. Only while
  // it's actually on the watchlist (tracked & not retired) — same rule as the Watchlist page.
  const watcher =
    tracked && entry.status !== "RETIRED" ? personByName(entry.addedBy) : null;
  // When the agent last researched this name (latest dossier / research entry) — shown
  // in the header under the price so coverage freshness is always visible (Cam 2026-06-19).
  const lastResearched = journal.find((j) => j.kind === "RESEARCH")?.at ?? null;
  const dayBps = quote?.dayChangeBps ?? 0;

  // The at-a-glance verdict + the agent's expected return (latest dossier target).
  const rec = signals ? overallSignal(signals) : null;
  const targetEntry = journal.find((j) => j.targetFarCents != null || j.targetNearCents != null);
  const cur = quote?.midCents ?? null;
  const nearPct = targetEntry?.targetNearCents != null && cur ? (targetEntry.targetNearCents - cur) / cur : null;
  const farPct = targetEntry?.targetFarCents != null && cur ? (targetEntry.targetFarCents - cur) / cur : null;
  const selfPeer = peers.find((p) => p.self);
  const peerPes = peers.filter((p) => !p.self && p.peTtm != null).map((p) => p.peTtm as number);
  const avgPeerPe = peerPes.length ? peerPes.reduce((a, b) => a + b, 0) / peerPes.length : null;
  const bottomLineEntry = journal.find((j) => j.bottomLine);
  // The agent's OWN call (judgment), distinct from the signal formula (rec).
  const stanceEntry = journal.find((j) => j.stance);
  const stance = stanceMeta(stanceEntry?.stance);
  // The confidence GRQ filed WITH that call (0–100) and when — shown under the
  // bull/bear bar in the bottom line. Pulled off the same entry the bar reflects.
  const stanceConfidence = stanceEntry?.confidence ?? null;
  const stanceConfidenceAt = stanceEntry?.at ?? null;
  // Fallback rating when GRQ hasn't filed a call: the technical signal lean (tagged
  // as such), so the header always shows the buy→sell slider like the watchlist.
  const recMeta = rec ? stanceMeta(rec.label) : null;

  // The 10-tier data-coverage map (docs/DATA-SOURCES.md) for THIS name: what's
  // wired & live, what's partial, and — honestly — why the rest is dark.
  type Cov = { tier: number; name: string; status: "live" | "partial" | "none"; detail: string };
  const cadListing = /\.(TO|V|NE|CN)$/i.test(entry.yahoo); // CA listing → no structured insider feed yet
  const insiderBuys = smartMoney?.insiderBuyers ?? 0;
  const coverage: Cov[] = [
    { tier: 1, name: "Price/vol", status: closes.length > 1 ? "live" : "partial", detail: `${closes.length} sessions of OHLCV → signals` },
    { tier: 2, name: "Fundamentals", status: analyst || grades || entry.marketCapM ? "live" : "none", detail: analyst ? "analyst targets · peers · ratings" : "cap/sector only" },
    { tier: 6, name: "Earnings", status: earnings ? "live" : "none", detail: earnings ? (earnings.next ? `next ${earnings.next.date}` : `last ${earnings.last?.date}`) : "no FMP coverage for this name" },
    { tier: 7, name: "News", status: news.length > 0 ? "live" : "none", detail: news.length > 0 ? `${news.length} recent headlines` : "no FMP coverage for this name" },
    { tier: 9, name: "Macro", status: "live", detail: "BoC structured feed — rates/CPI/FX (in the agent + Today)" },
    {
      tier: 4,
      name: "Insider",
      status: insiderBuys > 0 ? "live" : "partial",
      detail:
        insiderBuys > 0
          ? `${insiderBuys} insider buy(s), 90d · structured Form 4 / OpenInsider`
          : cadListing
            ? "CA insider not yet structured — agent web-researches SEDI/SEDAR+ in dossiers"
            : "US Form 4 + OpenInsider wired — no recent open-market buys on file",
    },
    {
      tier: 5,
      name: "Institutional",
      status: institutional ? "live" : "none",
      detail: institutional
        ? `${institutional.investorsHolding.toLocaleString()} institutions · ${institutional.investorsHoldingChange >= 0 ? "+" : ""}${institutional.investorsHoldingChange} QoQ`
        : "13F is US-listed holdings — empty for pure-TSX issuers",
    },
    { tier: 3, name: "Options flow", status: "none", detail: "never traded; flow is US-centric — later" },
    { tier: 8, name: "Social", status: "none", detail: "deliberately late — noisy, gameable" },
    { tier: 10, name: "Alt data", status: "none", detail: "paid + US-centric — revisit at scale" },
  ];
  coverage.sort((a, b) => a.tier - b.tier); // show tiers in order T1→T10

  return (
    <main>
      <Link href={tracked ? "/universe" : "/market"} className="text-xs text-teal-300 hover:underline">
        {tracked ? "← universe" : "← the hunt"}
      </Link>

      {/* Hero band: the ticker/quote/actions ride the stock's own price tape — the
          per-name "tape" as a faint backdrop so the chart reads as the headline
          instead of getting buried below (Cam 2026-06-18). */}
      <div className="relative mt-3 mb-6 overflow-hidden rounded-2xl border border-teal-400/10 bg-teal-400/[0.02] px-4 py-3">
        {closes.length > 1 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.13] [mask-image:linear-gradient(to_bottom,transparent,#000_45%,transparent)]"
          >
            <Sparkline values={closes.map((c) => c.closeCents)} className="h-full w-full" />
          </div>
        )}
        <div className="relative flex flex-col gap-3">
          {/* Top row: title group on the left, the live price right-justified onto the ticker's
              own baseline (items-baseline) — the ticker isn't moved; the price just sits inline
              with it instead of floating high (Cam 2026-06-25). */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            {/* logo · symbol · name · status/watcher chips — baseline-aligned to the symbol. */}
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <StockLogo symbol={symbol} logoUrl={entry.logoUrl} className="h-10 w-10 self-center text-sm" />
              <h1 className="text-3xl font-bold text-teal-50">{symbol}</h1>
              <span className="text-teal-200/60">{entry.name}</span>
              {/* The chips ride in their own centre-aligned group so the watched-by pill (it
                  carries a face) lines up with the text chips rather than floating high. Status
                  uses the same words as the rest of the site (Cam 2026-06-25). */}
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="dim">{entry.tier ?? "untiered"}</Chip>
                {entry.currency && entry.currency !== "CAD" && <Chip tone="teal">{entry.currency}</Chip>}
                {!tracked && <Chip tone="dim">not tracked</Chip>}
                {tracked && entry.status === "CANDIDATE" && <Chip tone="teal">on watchlist</Chip>}
                {tracked && entry.status === "ACTIVE" && <Chip tone="green">in universe</Chip>}
                {tracked && entry.status === "RETIRED" && <Chip tone="dim">retired</Chip>}
                {watch && <Chip tone="teal">agent watching</Chip>}
                {watcher && <WatchedBy name={watcher.name} pill />}
              </div>
            </div>
            {/* Live price, right-justified onto the ticker's baseline; the $/% move (sized to the
                company name) + live marker stack just beneath it. */}
            {quote && (
              <div className="flex flex-col items-end gap-1">
                <LiveQuote
                  symbol={symbol}
                  initialCents={quote.midCents}
                  initialChangePct={dayBps / 10_000}
                  currency={entry.currency}
                  className="text-3xl font-bold leading-none text-teal-50"
                  changeClassName="text-base"
                  dollars
                  live
                />
              </div>
            )}
          </div>
          {/* Bottom row: the action buttons sit bottom-justified; the researched-freshness line
              rides the bottom-right. */}
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {isMember && tracked && (
                <UniverseActions
                  symbol={symbol}
                  status={entry.status}
                  pendingBy={entry.promotionRequestedBy}
                  proposedTier={entry.proposedTier}
                  currentUser={me}
                  researchInFlight={researchInFlight}
                />
              )}
              {isMember && !tracked && <WatchButton symbol={symbol} state="none" />}
              <DirectiveButtons
                symbol={symbol}
                current={directive ? { directive: directive.directive, by: directive.by, note: directive.note } : null}
                canEdit={isMember}
              />
              {isMember && otherName && <ShareStockButton symbol={symbol} toName={otherName} />}
              {isMember && <AskGrq symbol={symbol} />}
            </div>
            <span className="text-sm text-teal-200/45" title="When the agent last researched this name">
              {lastResearched ? `researched ${fmtWhen(lastResearched)}` : "not yet researched"}
            </span>
          </div>
        </div>
      </div>

      {/* The price tape rides above the bottom line — half-height (Cam 2026-06-24). */}
      {closes.length > 1 && (
        <div className="mb-6">
          <PriceChart
            symbol={symbol}
            data={closes.map((c) => ({ t: c.date.getTime(), c: c.closeCents }))}
            currency={entry.currency}
            heightClass="h-28"
            defaultRange="1D"
          />
        </div>
      )}

      {(stance || rec) && (
        <Card className="mb-6 border-teal-400/30 p-5">
          <div className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">The bottom line</div>
          <div className="grid gap-6 lg:grid-cols-4">
            <div className="lg:col-span-1">
              {/* The verdict word, with the bull/bear bar (the same call) directly under
                  it. Technicals are an input below, not a competing verdict. */}
              <div className="mb-1 text-[10px] uppercase tracking-wider text-teal-200/50">
                <Term k="agent-call">GRQ&apos;s call</Term>
              </div>
              {stance ? (
                <>
                  <span className={`text-3xl font-black leading-tight ${STANCE_TONE_CLASSES[stance.tone].text}`}>{stance.label}</span>
                  <div className="mt-3 w-full max-w-xs">
                    <RatingBar label={stance.label} tone={stance.tone} pos={stance.pos} mascots hideLabel className="w-full" />
                  </div>
                  {/* Under the bar: GRQ's confidence in this call (with an explainer), and when
                      it was rated. No score on file → say so plainly rather than imply certainty. */}
                  <div className="mt-3">
                    {stanceConfidence != null ? (
                      <>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-black tabular-nums text-teal-100">{stanceConfidence}%</span>
                          <Term k="confidence" className="text-[10px] font-semibold uppercase tracking-wider text-teal-200/50">
                            confidence
                          </Term>
                        </div>
                        {stanceConfidenceAt && (
                          <p className="mt-0.5 text-[11px] text-teal-200/40">rated {fmtWhen(stanceConfidenceAt)}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-teal-200/50">
                        No <Term k="confidence" className="font-semibold">confidence</Term> score on this call yet.
                      </p>
                    )}
                  </div>
                </>
              ) : recMeta ? (
                <>
                  <span className={`text-3xl font-black leading-tight ${STANCE_TONE_CLASSES[recMeta.tone].text}`}>{recMeta.label}</span>
                  <div className="mt-3 w-full max-w-xs">
                    <RatingBar label={recMeta.label} tone={recMeta.tone} pos={recMeta.pos} mascots hideLabel className="w-full" />
                  </div>
                  <p className="mt-3 text-sm text-teal-200/50">No GRQ call yet — technical signal only (an input, not a verdict).</p>
                </>
              ) : (
                <p className="text-sm text-teal-200/50">Not yet rated — the agent hasn&apos;t filed a call on this name.</p>
              )}
              {/* GRQ's own near/12-mo target — back in the bottom line, under the confidence
                  date (Cam 2026-06-25). */}
              {(nearPct !== null || farPct !== null) && (
                <p className="mt-4 text-sm text-teal-200/70">
                  <Term k="price-target">Target</Term>:{" "}
                  {nearPct !== null && (
                    <>
                      near{" "}
                      <span className={nearPct > 0 ? "text-emerald-400" : "text-red-400"}>
                        {nearPct > 0 ? "+" : ""}
                        {pct(nearPct, 0)}
                      </span>
                      {farPct !== null ? " · " : ""}
                    </>
                  )}
                  {farPct !== null && (
                    <>
                      12-mo{" "}
                      <span className={farPct > 0 ? "text-emerald-400" : "text-red-400"}>
                        {farPct > 0 ? "+" : ""}
                        {pct(farPct, 0)}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="lg:col-span-3">
              {bottomLineEntry?.bottomLine ? (
                <>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-teal-200/50">Why</div>
                  <div className="text-sm text-teal-100/80">
                    <Md text={bottomLineEntry.bottomLine} />
                  </div>
                </>
              ) : (
                <p className="text-sm text-teal-100/80">
                  The agent&apos;s plain-English &ldquo;why&rdquo; appears here once it files a dossier on this name.
                  {signals ? ` For now, the technical read: ${signalsOneLine(signals)}.` : ""}
                </p>
              )}
              {/* The caveat back under the Why (Cam 2026-06-25). */}
              <p className="mt-3 text-[11px] text-teal-200/40">
                The rating above is <span className="text-teal-200/60">GRQ&apos;s call</span> — its judgment. The technical
                signals are an input, not the verdict; the trade it actually places lives in its journal below.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* The held-position stats ride one dense row on large screens — qty/cost/value/
          P&L + the deterministic bracket (enforceExits) + the dossier targets, the full
          "what happens next" at a glance. Equal columns flow in a single line (4–8 of
          them); 2-up on phones, 4-up on tablets (Cam 2026-06-18). */}
      {position && quote && (
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-none lg:auto-cols-fr lg:grid-flow-col">
          <StatCard compact label="Held" value={`${position.qty} sh`} note={`since ${fmtWhen(position.openedAt)}`} />
          <StatCard compact label="Avg cost (ACB)" value={money(position.avgCostCents)} />
          <StatCard compact label="Market value" value={money(position.qty * quote.midCents)} />
          <StatCard
            compact
            label="Unrealized P&L"
            value={signedMoney(position.qty * (quote.midCents - position.avgCostCents))}
            valueClassName={pnlClass(position.qty * (quote.midCents - position.avgCostCents))}
          />
          <StatCard
            compact
            label="Auto-stop"
            term="stop-loss"
            value={money(Math.round(position.avgCostCents * (1 - dial.stopPct / 100)))}
            note={
              <>
                <span className="text-red-300/70">−{dial.stopPct}% vs cost</span> · auto-sells
              </>
            }
          />
          <StatCard
            compact
            label="Take-profit"
            term="take-profit"
            value={money(Math.round(position.avgCostCents * (1 + dial.takeProfitPct / 100)))}
            note={
              <>
                <span className="text-emerald-300/70">+{dial.takeProfitPct}% vs cost</span> · auto-sells
              </>
            }
          />
          {targetEntry?.targetNearCents != null && (
            <StatCard
              compact
              label="Near target"
              term="price-target"
              value={money(targetEntry.targetNearCents)}
              note={
                <>
                  {nearPct !== null && (
                    <span className={nearPct > 0 ? "text-emerald-400" : "text-red-400"}>
                      {nearPct > 0 ? "+" : ""}
                      {pct(nearPct, 0)}
                    </span>
                  )}
                  {targetEntry.targetNearDays ? ` · ~${Math.max(1, Math.round(targetEntry.targetNearDays / 5))} wks` : ""}
                </>
              }
            />
          )}
          {targetEntry?.targetFarCents != null && (
            <StatCard
              compact
              label="12-mo target"
              term="price-target"
              value={money(targetEntry.targetFarCents)}
              note={
                <>
                  {farPct !== null && (
                    <span className={farPct > 0 ? "text-emerald-400" : "text-red-400"}>
                      {farPct > 0 ? "+" : ""}
                      {pct(farPct, 0)}
                    </span>
                  )}
                  {" · 12-mo"}
                </>
              }
            />
          )}
        </section>
      )}

      {watch?.note && (
        <Card className="mb-6 p-4">
          <div className="flex items-baseline gap-3">
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-teal-200/50">
              The agent&apos;s note
            </span>
            <p className="text-sm text-teal-100/80">{watch.note}</p>
          </div>
        </Card>
      )}

      {/* Key data panels — analyst ratings · price targets · institutional · signals ·
          earnings, equal height, 5-wide. Ratings + targets are split into their own panels
          and lead on the left; signals rides this row while the scoreboard sits beside the
          peer/valuation table below (Cam 2026-06-19). */}
      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">Analyst ratings</h2>
          {grades ? (
            <Card className="p-4 text-sm flex-1">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-bold text-teal-100/90">{grades.consensus}</span>
                <span className="text-xs text-teal-200/40">{grades.total} analysts</span>
              </div>
              {/* Bearish → bullish, left to right: sell · hold · buy (Cam 2026-06-18). */}
              <div className="flex h-2 overflow-hidden rounded-full bg-teal-400/10">
                {([["bg-red-500", grades.strongSell], ["bg-red-400", grades.sell], ["bg-teal-400/30", grades.hold], ["bg-emerald-400", grades.buy], ["bg-emerald-500", grades.strongBuy]] as const).map(
                  ([cls, n], i) => (n > 0 ? <span key={i} className={cls} style={{ width: `${(n / grades.total) * 100}%` }} /> : null),
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-teal-200/50">
                <span className="text-red-400/80">sell {grades.sell + grades.strongSell}</span>
                <span>hold {grades.hold}</span>
                <span className="text-emerald-400/80">buy {grades.strongBuy + grades.buy}</span>
              </div>
              {/* Direction: is the consensus drifting bull/bear vs ~3mo ago? (D-analyst). */}
              {gradesTrend && (gradesTrend.buyDelta !== 0 || gradesTrend.sellDelta !== 0) && (() => {
                const arrow = gradesTrend.direction === "more bullish" ? "▲" : gradesTrend.direction === "more bearish" ? "▼" : "→";
                const cls =
                  gradesTrend.direction === "more bullish"
                    ? "text-emerald-400/80"
                    : gradesTrend.direction === "more bearish"
                      ? "text-red-400/80"
                      : "text-teal-200/50";
                const parts = [
                  gradesTrend.buyDelta !== 0 ? `${gradesTrend.buyDelta > 0 ? "+" : "−"}${Math.abs(gradesTrend.buyDelta)} buy` : null,
                  gradesTrend.sellDelta !== 0 ? `${gradesTrend.sellDelta > 0 ? "+" : "−"}${Math.abs(gradesTrend.sellDelta)} sell` : null,
                ].filter(Boolean);
                return (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-teal-400/10 pt-2 text-[11px]">
                    <span className={cls}>{arrow} {gradesTrend.direction}</span>
                    <span className="text-teal-200/40">{parts.join(" · ")} vs {gradesTrend.months}mo ago</span>
                  </div>
                );
              })()}
              {/* Recent moves: the named actions behind the consensus — the receipts. */}
              {gradeActions.length > 0 && (
                <div className="mt-2 border-t border-teal-400/10 pt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-teal-200/40">Recent moves</div>
                  <ul className="space-y-1">
                    {gradeActions.map((a, i) => {
                      const tone = a.action === "upgrade" ? "text-emerald-400/80" : a.action === "downgrade" ? "text-red-400/80" : "text-teal-200/55";
                      const mark = a.action === "upgrade" ? "↑" : a.action === "downgrade" ? "↓" : a.action === "initiate" ? "✦" : "·";
                      return (
                        <li key={i} className="flex items-baseline justify-between gap-2 text-[11px]">
                          <span className="truncate text-teal-100/80" title={a.company}>{a.company}</span>
                          <span className="flex shrink-0 items-baseline gap-1.5">
                            <span className={tone} title={a.fromGrade && a.fromGrade !== a.toGrade ? `${a.fromGrade} → ${a.toGrade}` : a.action}>
                              {mark} {a.toGrade}
                            </span>
                            <span className="tabular-nums text-teal-200/35">{agoShort(a.date)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </Card>
          ) : (
            <PanelEmpty
              reason={
                cadListing
                  ? "No analyst-rating breakdown from FMP for this TSX listing yet."
                  : "No analyst ratings on record for this name yet."
              }
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">
            <Term k="analyst-target">Price targets</Term> <span className="normal-case text-teal-200/40">· Tier 2</span>
          </h2>
          {analyst ? (
            (() => {
              // The analyst feed keys off the BARE ticker, so for a CDR or cross-listing it
              // returns the US underlying's targets in USD (AAPL ~$240) — nonsense beside this
              // page's CAD price (the Apple CDR trades ~$30 CAD). The upside % is scale-invariant
              // (the predicted MOVE), so when the analyst currency differs from this listing's we
              // re-anchor every target to the page's own live price + currency. US-on-US pages are
              // unchanged (Cam 2026-06-19).
              const pageCur = entry.currency ?? (cadListing ? "CAD" : "USD");
              const reanchor = cur != null && analyst.currency.toUpperCase() !== pageCur.toUpperCase();
              const usNow = analyst.upsidePct !== -1 ? analyst.consensusCents / (1 + analyst.upsidePct) : analyst.consensusCents;
              const anchor = reanchor ? (cur as number) : usNow;
              const dispCur = reanchor ? pageCur : analyst.currency;
              const sc = (v: number) => (usNow > 0 ? Math.round((anchor * v) / usNow) : v);
              const con = sc(analyst.consensusCents);
              const lo = sc(analyst.lowCents);
              const hi = sc(analyst.highCents);
              const now = Math.round(anchor);
              return (
                <Card className="p-4 text-sm flex-1">
                  {/* Label on its own line; the upside + source ride beside the consensus PRICE,
                      not the title (Cam 2026-06-25). */}
                  <Term k="analyst-target" className="text-[11px] uppercase tracking-wider text-teal-200/50">
                    Analyst consensus
                  </Term>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-semibold tabular-nums text-teal-50">{money(con, dispCur)}</span>
                    <span className={`text-sm font-semibold ${analyst.upsidePct > 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {analyst.upsidePct > 0 ? "+" : ""}
                      {pct(analyst.upsidePct, 0)}
                    </span>
                    <span className="text-[11px] text-teal-200/40">
                      upside · {reanchor ? "US analysts" : analyst.currency !== "CAD" ? "US listing" : "Wall St."}
                    </span>
                  </div>
                  {lo > 0 && hi > lo ? (
                    (() => {
                      // The band spans low→high; the domain stretches to fit "now" if it sits
                      // outside the band (e.g. trading below every target). Small pad so the end
                      // markers aren't clipped at the edges.
                      const pad = Math.round((Math.max(hi, now) - Math.min(lo, now)) * 0.06) || 1;
                      const dMin = Math.min(lo, now) - pad;
                      const dMax = Math.max(hi, now) + pad;
                      const pos = (v: number) => ((v - dMin) / (dMax - dMin)) * 100;
                      return (
                        <>
                          <div className="relative mt-4 h-2 rounded-full bg-teal-400/[0.07]">
                            <div
                              className="absolute inset-y-0 rounded-full bg-teal-400/20"
                              style={{ left: `${pos(lo).toFixed(1)}%`, right: `${(100 - pos(hi)).toFixed(1)}%` }}
                            />
                            <div
                              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-teal-300"
                              style={{ left: `${pos(con).toFixed(1)}%` }}
                              title={`consensus ${money(con, dispCur)}`}
                            />
                            <div
                              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color:var(--card-bg)] bg-teal-50"
                              style={{ left: `${pos(now).toFixed(1)}%` }}
                              title={`now ${money(now, dispCur)}`}
                            />
                          </div>
                          {/* Endpoints under the band — low red, high green, sized up so the
                              dollar figures read at a glance (Cam 2026-06-21). */}
                          <div className="mt-2 flex justify-between tabular-nums">
                            <span className="flex flex-col">
                              <span className="text-[10px] uppercase tracking-wider text-teal-200/40">low</span>
                              <span className="text-sm font-semibold text-red-400">{money(lo, dispCur)}</span>
                            </span>
                            <span className="flex flex-col items-end">
                              <span className="text-[10px] uppercase tracking-wider text-teal-200/40">high</span>
                              <span className="text-sm font-semibold text-emerald-400">{money(hi, dispCur)}</span>
                            </span>
                          </div>
                          {/* The live price re-listed beside consensus; consensus is green when it
                              sits above the current price, red below — an instant read of the gap.
                              Label-over-value (like low/high) so the dollar figures don't bleed past
                              the narrow panel edge (Cam 2026-06-24). */}
                          <div className="mt-3 flex items-start justify-between gap-2 tabular-nums">
                            <span className="flex flex-col">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="inline-block h-2 w-2 rounded-full bg-teal-50" />
                                <span className="text-[10px] uppercase tracking-wider text-teal-200/40">now</span>
                              </span>
                              <span className="mt-0.5 text-sm font-semibold text-teal-50">{money(now, dispCur)}</span>
                            </span>
                            <span className="flex flex-col items-end">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="inline-block h-1.5 w-1.5 rotate-45 bg-teal-300" />
                                <span className="text-[10px] uppercase tracking-wider text-teal-200/40">consensus</span>
                              </span>
                              <span className={`mt-0.5 text-sm font-semibold ${con > now ? "text-emerald-400" : con < now ? "text-red-400" : "text-teal-50"}`}>
                                {money(con, dispCur)}
                              </span>
                            </span>
                          </div>
                        </>
                      );
                    })()
                  ) : lo > 0 || hi > 0 ? (
                    <div className="mt-2 flex items-center gap-2 tabular-nums">
                      <span className="text-[10px] uppercase tracking-wider text-teal-200/40">range</span>
                      <span className="text-sm font-semibold text-red-400">{money(lo, dispCur)}</span>
                      <span className="text-teal-200/40">–</span>
                      <span className="text-sm font-semibold text-emerald-400">{money(hi, dispCur)}</span>
                    </div>
                  ) : null}
                  {/* Momentum: are targets climbing? % is currency-invariant (last quarter
                      vs last year), so it's valid for this listing even when re-anchored. */}
                  {targetTrend && targetTrend.changePct !== 0 && (
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-teal-400/10 pt-2 text-[11px]">
                      <span className={targetTrend.changePct > 0 ? "text-emerald-400/80" : "text-red-400/80"}>
                        {targetTrend.changePct > 0 ? "▲ targets rising +" : "▼ targets falling "}
                        {pct(targetTrend.changePct, 0)}
                      </span>
                      <span className="text-teal-200/40">
                        {targetTrend.recentCount} analyst{targetTrend.recentCount === 1 ? "" : "s"} · 3mo
                      </span>
                    </div>
                  )}
                  {reanchor && (
                    <p className="mt-2 text-[11px] text-teal-200/40">
                      US analyst targets, rescaled from the US-listed shares to this {cadListing ? "Canadian " : ""}listing&apos;s price.
                    </p>
                  )}
                </Card>
              );
            })()
          ) : (
            <PanelEmpty
              reason={
                cadListing
                  ? "No analyst price targets from FMP for this TSX listing yet."
                  : "No analyst price targets on record for this name yet."
              }
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">
            Institutional <span className="normal-case text-teal-200/40">· Tier 5 (13F)</span>
          </h2>
          {institutional ? (
            <Card className="p-4 text-sm flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-teal-100/80">{institutional.investorsHolding.toLocaleString()} institutions hold</span>
                <span className={`text-xs font-semibold ${institutional.investorsHoldingChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {institutional.investorsHoldingChange >= 0 ? "+" : ""}
                  {institutional.investorsHoldingChange}{" "}
                  <Term k="qoq" align="right">QoQ</Term>
                </span>
              </div>
              {/* The names behind the count — top holders by position size, with the Q/Q
                  change in their stake + the % of the company they own (Cam 2026-06-21). */}
              {holders.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-teal-400/10 pt-2">
                  {holders.map((h, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-2 text-[11px]">
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="truncate text-teal-100/80" title={prettyHolder(h.name)}>{prettyHolder(h.name)}</span>
                        {h.isNew && <span className="shrink-0 rounded-sm bg-emerald-400/15 px-1 text-[9px] font-semibold uppercase text-emerald-300/90">new</span>}
                      </span>
                      <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                        <span className="text-teal-200/50">{h.ownershipPct.toFixed(1)}% own</span>
                        {Math.abs(h.sharesChangePct) >= 0.05 && (
                          <span className={h.sharesChangePct > 0 ? "text-emerald-400/80" : "text-red-400/80"}>
                            {h.sharesChangePct > 0 ? "▲" : "▼"} {Math.abs(h.sharesChangePct).toFixed(1)}%
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-teal-200/40">
                From 13F filings (as of {institutional.date}) — US-listed holdings; smart-money colour, ~45-day lag, not timing.
              </p>
            </Card>
          ) : (
            <PanelEmpty
              reason={
                cadListing
                  ? "No 13F data — 13F filings cover US-listed securities only, so a pure-TSX listing like this one doesn't appear."
                  : "No institutional (13F) holdings on record for this name yet."
              }
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">
            Signals <span className="normal-case text-teal-200/40">· v1</span>
          </h2>
          <Card className="p-4 text-sm flex-1">
            {!signals ? (
              <p className="text-teal-200/40">Insufficient bar history yet.</p>
            ) : (
              <ul className="space-y-2">
                {signals.families.map((f) => (
                  <li key={f.family} className="text-xs">
                    <div className="flex items-center gap-2">
                      <Term k={f.family} className="font-semibold uppercase text-teal-100/80">
                        {f.family}
                      </Term>
                      <Chip tone={SIG_TONE[f.signal]}>{f.signal}</Chip>
                      <span className="ml-auto text-[11px] tabular-nums text-teal-200/40">{f.confidence}%</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-teal-200/50">{f.rationale}</div>
                  </li>
                ))}
              </ul>
            )}
            {signals && (
              <p className="mt-3 border-t border-teal-400/10 pt-2 text-[11px] text-teal-200/40">
                An input the agent weighs — trend/momentum only.
              </p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">
            Earnings <span className="normal-case text-teal-200/40">· Tier 6</span>
          </h2>
          {earnings ? (
            <Card className="p-4 text-sm flex-1">
              {/* Next scheduled date (with the consensus estimate it'll be judged against). */}
              {earnings.next && (
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-teal-100/80">Next report</span>
                    <span className="font-semibold tabular-nums text-teal-50">{earnings.next.date}</span>
                  </div>
                  {(earnings.next.epsEstimated != null || earnings.next.revenueEstimated != null) && (
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] tabular-nums text-teal-200/45">
                      {earnings.next.epsEstimated != null && <span>est EPS {earnings.next.epsEstimated.toFixed(2)}</span>}
                      {earnings.next.revenueEstimated != null && <span>est Rev {fmtRev(earnings.next.revenueEstimated)}</span>}
                    </div>
                  )}
                </div>
              )}
              {/* Last reported quarter, as bullets: actual vs estimate → beat/miss. */}
              {earnings.last && (() => {
                const e = earnings.last;
                const tag = (act: number, est: number | null) => {
                  if (est == null) return null;
                  const beat = act > est, miss = act < est;
                  return <span className={beat ? "text-emerald-400/80" : miss ? "text-red-400/80" : "text-teal-200/50"}>{beat ? "▲ beat" : miss ? "▼ miss" : "in line"}</span>;
                };
                return (
                  <div className={earnings.next ? "mt-3 border-t border-teal-400/10 pt-2" : ""}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-teal-100/80">Last report</span>
                      <span className="text-xs tabular-nums text-teal-200/50">{e.date}</span>
                    </div>
                    <ul className="mt-1.5 space-y-1 text-[11px]">
                      {e.epsActual != null && (
                        <li className="flex items-baseline justify-between gap-2">
                          <span className="text-teal-200/55">
                            EPS <b className="font-semibold tabular-nums text-teal-100/85">{e.epsActual.toFixed(2)}</b>
                            {e.epsEstimated != null && <span className="text-teal-200/40"> vs {e.epsEstimated.toFixed(2)} est</span>}
                          </span>
                          {tag(e.epsActual, e.epsEstimated)}
                        </li>
                      )}
                      {e.revenueActual != null && (
                        <li className="flex items-baseline justify-between gap-2">
                          <span className="text-teal-200/55">
                            Rev <b className="font-semibold tabular-nums text-teal-100/85">{fmtRev(e.revenueActual)}</b>
                            {e.revenueEstimated != null && <span className="text-teal-200/40"> vs {fmtRev(e.revenueEstimated)} est</span>}
                          </span>
                          {tag(e.revenueActual, e.revenueEstimated)}
                        </li>
                      )}
                    </ul>
                  </div>
                );
              })()}
              <p className="mt-2 text-[11px] text-teal-200/40">Stocks often move more on guidance than the number itself.</p>
            </Card>
          ) : (
            <PanelEmpty
              reason={
                cadListing
                  ? "No earnings-calendar coverage from FMP for this TSX listing yet."
                  : "No earnings-calendar coverage from FMP for this name yet."
              }
            />
          )}
        </div>
      </section>

      <section className="mb-6 grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">Valuation vs peers</h2>
          <Card className="p-5">
          {peers.length > 1 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-teal-200/40">
                <th className="py-1">Company</th>
                <th className="py-1 text-right">
                  <Term k="pe" align="right">P/E</Term>
                </th>
                <th className="py-1 text-right">P/B</th>
                <th className="py-1 text-right">
                  <Term k="market-cap" align="right">Cap</Term>
                </th>
              </tr>
            </thead>
            <tbody>
              {peers.map((p) => {
                const capM = p.self && p.marketCapM == null ? entry.marketCapM : p.marketCapM;
                return (
                  <tr key={p.symbol} className={`border-t border-teal-400/10 ${p.self ? "bg-teal-400/[0.06]" : ""}`}>
                    <td className={`py-1.5 ${p.self ? "font-bold text-teal-200" : "text-teal-100/70"}`}>
                      {p.self ? `${symbol} · this stock` : p.symbol}
                      {!p.self && p.name && <span className="ml-2 text-xs text-teal-200/40">{p.name}</span>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-teal-100/80">{p.peTtm != null ? `${p.peTtm.toFixed(1)}×` : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-teal-200/60">{p.pbTtm != null ? `${p.pbTtm.toFixed(1)}×` : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-teal-200/60">
                      {capM ? (capM >= 1000 ? `$${Math.round(capM / 1000)}B` : `$${capM}M`) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          ) : (
            <p className="text-sm text-teal-200/40">
              No peer comparison available — FMP didn&apos;t return a peer set for this name
              {cadListing ? " (peer + ratio coverage is thin for pure-TSX listings)" : ""}.
            </p>
          )}
          <p className="mt-2 text-[11px] text-teal-200/40">
            {peers.length > 1 && selfPeer?.peTtm != null && avgPeerPe != null
              ? `At ${selfPeer.peTtm.toFixed(1)}× earnings, ${symbol} trades ${selfPeer.peTtm < avgPeerPe ? "cheaper than" : "richer than"} its peers' average of ${avgPeerPe.toFixed(1)}×. Cheap can mean value — or trouble.`
              : "P/E and P/B against the company's closest peers (FMP)."}
          </p>
          </Card>
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">Scoreboard</h2>
          <Scoreboard
            rows={symbolScores}
            title=""
            emptyText="No graded calls on this name yet — retros fill this in."
          />
        </div>
      </section>

      {/* Smart money on THIS name — tracked investors' positions/trades + faces. */}
      {smartMoney && <StockSmartMoney sm={smartMoney} />}

      <section className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">

      <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">
              The record ({journal.length})
            </h2>
            {isMember && <AddNote symbol={symbol} />}
          </div>
          {journal.length === 0 ? (
            <Card className="p-6 text-sm text-teal-200/40">
              Nothing on the record yet — the agent&rsquo;s research, decisions, and trades on {symbol} land here,
              alongside any notes you add.
            </Card>
          ) : (
            <RecordFilter
              items={journal.map((j) => ({
                id: j.id,
                kind: j.kind,
                node: (
                  <Card className={j.id === currentRead?.id ? "border-teal-400/30 p-4" : "p-4"}>
                    <div className="flex flex-wrap items-center gap-2">
                      {j.id === currentRead?.id && <Chip tone="teal">current read</Chip>}
                      <Chip tone={j.kind === "TRADE" ? "green" : j.kind === "NOTE" || j.kind === "LESSON" ? "teal" : "dim"}>{j.kind}</Chip>
                      <span className="text-sm font-medium text-teal-50">{j.title}</span>
                      <span className="ml-auto text-xs text-teal-200/40">
                        {fmtWhen(j.at)} · {j.agentVersion}
                      </span>
                    </div>
                    <div className="mt-2">
                      <CollapsibleMd text={j.body}>
                        <SourceChips sourcesJson={j.sourcesJson} />
                      </CollapsibleMd>
                    </div>
                  </Card>
                ),
              }))}
            />
          )}
        </div>
      </div>

        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">Trades</h2>
          <Card className="p-4">
            {trades.length === 0 ? (
              <p className="text-sm text-teal-200/40">No fills yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {trades.map((t) => (
                  <li key={t.id} className="flex items-baseline gap-2 border-t border-teal-400/10 pt-2 first:border-0 first:pt-0">
                    <span className={`font-bold ${t.side === "BUY" ? "text-teal-300" : "text-amber-300"}`}>{t.side}</span>
                    <span className="tabular-nums text-teal-100/80">
                      {t.qty} @ {money(t.priceCents)}
                    </span>
                    {t.realizedPnlCents !== null && <Pnl cents={t.realizedPnlCents} className="text-xs" />}
                    <span className="ml-auto text-xs text-teal-200/40">{fmtWhen(t.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">
            Recent news <span className="normal-case text-teal-200/40">· Tier 7</span>
          </h2>
          {news.length > 0 ? (
            <Card className="divide-y divide-[color:var(--card-border)]">
              {news.map((n, i) => (
                <a key={i} href={n.url} target="_blank" rel="noreferrer" className="block px-4 py-2.5 hover:bg-teal-400/[0.04]">
                  <div className="text-sm text-teal-100/80">{n.title}</div>
                  <div className="mt-0.5 text-[11px] text-teal-200/40">
                    {n.publisher} · {n.at}
                  </div>
                </a>
              ))}
            </Card>
          ) : (
            <Card className="p-4 text-sm">
              <p className="text-teal-200/40">
                No recent headlines from FMP for this name
                {cadListing ? " — news coverage is thinner for TSX-only listings" : ""}.
              </p>
            </Card>
          )}

          <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">Data coverage</h2>
          <Card className="p-4">
            <ul className="space-y-1.5 text-sm">
              {coverage.map((c) => (
                <li key={c.tier} className="flex items-baseline gap-2.5">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      c.status === "live" ? "bg-emerald-400" : c.status === "partial" ? "bg-amber-400" : "bg-teal-400/20"
                    }`}
                  />
                  <span className="w-24 shrink-0 text-teal-200/70">
                    T{c.tier} {c.name}
                  </span>
                  <span className="text-xs text-teal-200/40">{c.detail}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-teal-200/40">
              Green = wired &amp; live for this name · amber = partial · grey = not yet wired (why on the right). Insider &amp;
              institutional need Canadian sources (SEDI/SEDAR) — a separate build, not an FMP flip.
            </p>
          </Card>
        </div>
      </section>
    </main>
  );
}
