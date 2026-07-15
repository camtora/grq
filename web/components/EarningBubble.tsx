import Link from "next/link";
import StockLogo from "@/components/StockLogo";

// A reported-earnings BUBBLE (Today page) — who reported, beat/miss, the day reaction and a
// one-line read, with the report numbers ALWAYS showing: EPS + revenue actual-vs-estimate
// with surprise %, when it was reported, the day's reaction and Alfred's call. (Was
// click-to-expand; Cam 2026-07-03: "just always leave them expanded — it's good info."
// No state left, so this is a plain server component again.)

export type EarnView = {
  symbol: string;
  name: string;
  logoUrl: string | null;
  date: string; // YYYY-MM-DD
  epsEstimated: number | null;
  epsActual: number | null;
  revenueEstimated: number | null;
  revenueActual: number | null;
  dayBps: number | null; // TODAY's live move — the reaction only if it reported today
  printBps: number | null; // the move on the REPORT date, from the daily bars (null if we have no bar)
};

const fmtEps = (v: number | null) => (v == null ? "—" : `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`);

function fmtRev(v: number | null): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${Math.round(a / 1e6)}M`;
  return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
}

function surprisePct(actual: number | null, est: number | null): number | null {
  if (actual == null || est == null || est === 0) return null;
  return ((actual - est) / Math.abs(est)) * 100;
}

function fmtEarnDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function relDay(d: string, today: string): string {
  const n = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n < 0 ? `${-n}d ago` : `in ${n}d`;
}

function signedPct(bps: number): string {
  const p = bps / 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
}

function dayClass(bps: number): string {
  return bps > 0 ? "text-emerald-400" : bps < 0 ? "text-red-400" : "text-teal-200/50";
}

function surpriseClass(s: number | null): string {
  return s == null ? "text-teal-200/40" : s >= 0 ? "text-emerald-400" : "text-red-400";
}

// Beat / in line / miss. Matching the estimate is NOT beating it (Cam 2026-07-15: PGR printed
// EPS $4.64 against a $4.64 estimate and the old `actual >= est` called it a beat). The band is
// tied to the surprise we actually PRINT — if it rounds to "0.0%", the badge reads "in line", so
// the words and the number can never disagree.
type Verdict = "beat" | "in line" | "miss";

function verdictOf(actual: number | null, est: number | null): Verdict | null {
  if (actual == null || est == null) return null;
  if (est === 0) return actual > 0 ? "beat" : actual < 0 ? "miss" : "in line"; // no % to speak of
  const s = ((actual - est) / Math.abs(est)) * 100;
  if (Math.abs(s) < 0.05) return "in line";
  return s > 0 ? "beat" : "miss";
}

const VERDICT_STYLE: Record<Verdict, { badge: string; cls: string }> = {
  beat: { badge: "beat ✓", cls: "text-emerald-400" },
  "in line": { badge: "in line", cls: "text-teal-200/60" },
  miss: { badge: "miss ✗", cls: "text-red-400" },
};

/** Short report-date label for the move — "today" when it printed today, else "Jul 14". */
function moveLabel(date: string, today: string): string {
  if (date === today) return "today";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** One expanded-detail line: label · actual vs estimate · surprise. */
function DetailLine({ label, actual, est, surprise }: { label: string; actual: string; est: string; surprise: number | null }) {
  return (
    <div className="flex items-baseline gap-2 tabular-nums">
      <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-teal-200/40">{label}</span>
      <span className="font-semibold text-teal-50">{actual}</span>
      <span className="text-teal-200/50">vs {est} est</span>
      {surprise != null && (
        <span className={`ml-auto text-xs font-semibold ${surpriseClass(surprise)}`}>
          {surprise >= 0 ? "+" : "−"}
          {Math.abs(surprise).toFixed(1)}%
        </span>
      )}
    </div>
  );
}

export default function EarningBubble({ e, stance, today }: { e: EarnView; stance: string | null; today: string }) {
  const verdict = verdictOf(e.epsActual, e.epsEstimated) ?? verdictOf(e.revenueActual, e.revenueEstimated);

  // The move to show beside the result is the one on the REPORT date — not today's drift. If it
  // printed today they're the same number (and it's live); otherwise it comes from that day's bar.
  // FMP's calendar carries no before-open/after-close flag, so we can't know whether the reaction
  // actually landed on the report day or the session after — hence "on Jul 14", never "on the print".
  const reportedToday = e.date === today;
  const moveBps = reportedToday ? e.dayBps : e.printBps;
  const moveOn = moveLabel(e.date, today);

  const epsPart = e.epsActual != null && e.epsEstimated != null ? ` (EPS ${fmtEps(e.epsActual)} vs ${fmtEps(e.epsEstimated)} est)` : "";
  const movePart =
    moveBps == null
      ? ""
      : reportedToday
        ? `; the stock is ${signedPct(moveBps)} today`
        : `; the stock moved ${signedPct(moveBps)} on ${moveOn}, the day it reported`;
  const read =
    verdict == null
      ? "Just reported — the numbers and the market's reaction are on the stock page."
      : `${verdict === "beat" ? "Beat" : verdict === "miss" ? "Missed" : "In line with"} estimates${epsPart}${movePart}.`;

  return (
    <div className="group flex flex-col rounded-xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-3 transition-colors hover:border-teal-400/30">
      <div className="flex items-center gap-2">
        <StockLogo symbol={e.symbol} logoUrl={e.logoUrl} className="h-7 w-7 text-[10px]" />
        <div className="min-w-0">
          <Link href={`/stocks/${e.symbol}`} className="font-semibold text-teal-100 hover:underline">
            {e.symbol}
          </Link>
          <div className="truncate text-[10px] text-teal-200/40">{e.name}</div>
        </div>
        <div className="ml-auto shrink-0 text-right tabular-nums">
          {verdict && <div className={`text-[10px] font-black ${VERDICT_STYLE[verdict].cls}`}>{VERDICT_STYLE[verdict].badge}</div>}
          {/* The move carries its own label — bare, it read as part of the earnings result
              rather than the share price (Cam 2026-07-15: "beat ✓ / −10.9% — what's the −%?"). */}
          {moveBps != null && (
            <div className={`text-xs ${dayClass(moveBps)}`} title={`Share price ${signedPct(moveBps)} on ${moveOn} — the stock's move, not an earnings figure`}>
              {signedPct(moveBps)} <span className="text-[10px] font-normal text-teal-200/40">{moveOn}</span>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-teal-200/60">{read}</p>

      {(e.epsActual != null || e.revenueActual != null) && (
        <div className="mt-2 space-y-1.5 border-t border-teal-400/10 pt-2 text-sm">
          <DetailLine label="EPS" actual={fmtEps(e.epsActual)} est={fmtEps(e.epsEstimated)} surprise={surprisePct(e.epsActual, e.epsEstimated)} />
          <DetailLine label="Revenue" actual={fmtRev(e.revenueActual)} est={fmtRev(e.revenueEstimated)} surprise={surprisePct(e.revenueActual, e.revenueEstimated)} />
          <div className="flex items-baseline gap-2">
            <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-teal-200/40">Reported</span>
            <span className="text-teal-100/80">{fmtEarnDate(e.date)}</span>
            <span className="text-xs text-teal-200/40">{relDay(e.date, today)}</span>
            {/* No move here on purpose: this column is the SURPRISE column (EPS/revenue vs
                estimate), and a share-price % sitting in it read as a third surprise. It's
                labelled up top and spelled out in the read. */}
          </div>
          <p className="text-[10px] leading-snug text-teal-200/40">
            surprise = actual vs the analyst estimate · the % up top is the share price, not the result · the full report, transcript notes and
            Alfred&apos;s take live on the stock page
          </p>
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-teal-200/35">
        <span>{fmtEarnDate(e.date)}</span>
        {stance && <span className="rounded bg-teal-400/10 px-1.5 py-0.5 font-semibold text-teal-200/70">Alfred: {stance}</span>}
        <Link href={`/stocks/${e.symbol}`} className="ml-auto text-teal-300/60 hover:underline">
          full report →
        </Link>
      </div>
    </div>
  );
}
