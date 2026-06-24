import Link from "next/link";
import { money, pct } from "@/lib/money";
import { heatColor } from "@/lib/heat";
import StockLogo from "@/components/StockLogo";
import WatchButton, { type WatchState } from "@/components/WatchButton";
import ShareStockButton from "@/components/ShareStockButton";
import DismissButton from "@/components/DismissButton";
import Sparkline from "@/components/Sparkline";
import Md from "@/components/Md";
import ConfidenceGauge from "@/components/hunt/ConfidenceGauge";
import HeatMeter from "@/components/hunt/HeatMeter";
import { OBSCURITY_LABEL, previewText, wordCount } from "@/components/hunt/shared";

// One Hunt find as a Direction-A "Heat Board" row (design handoff). Leads-not-verdicts:
// we surface heat + confidence + 30-day trend, never a Buy/Hold/Sell call (a hunt find
// isn't a position). Server component — the SVG gauge/meter/sparkline render server-side;
// only WatchButton/DismissButton are client islands.
export type HuntFind = {
  sym: string;
  name: string;
  logoUrl: string | null;
  currency: string | null;
  cur: number | null; // current price, cents
  change30d: number | null; // fraction over the sparkline window (sign drives color)
  tag: string | null; // "NYSE · Healthcare"
  spark: number[]; // daily closes (cents) — Sparkline normalizes
  heat: number;
  confidence: number | null;
  obscurity: number | null;
  rank: number;
  watch: WatchState;
  body: string;
};

export default function HuntRow({ find, isMember, toName }: { find: HuntFind; isMember: boolean; toName: string | null }) {
  const color = heatColor(find.heat);
  const isTop = find.rank === 1;
  const rank2 = String(find.rank).padStart(2, "0");
  const up = (find.change30d ?? 0) >= 0;
  const words = wordCount(find.body);
  const obs = find.obscurity ? OBSCURITY_LABEL[find.obscurity] : null;

  return (
    <div className="relative flex flex-wrap items-center gap-x-5 gap-y-4 overflow-hidden rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] py-5 pl-7 pr-6">
      {/* heat-colored left rail */}
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: color, boxShadow: `0 0 16px ${color}` }} aria-hidden />

      {/* rank */}
      <div className="w-12 shrink-0 text-center">
        <div className="font-mono text-3xl font-bold leading-none tabular-nums" style={{ color, textShadow: `0 0 18px ${color}55` }}>
          {rank2}
        </div>
        <div className="mt-1 text-[9px] uppercase tracking-[0.15em] text-teal-200/40">Rank</div>
      </div>

      {/* identity */}
      <div className="flex w-52 shrink-0 flex-col gap-0.5">
        {isTop && (
          <span className="mb-1 self-start rounded-md border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-amber-300">
            ▲ Hottest
          </span>
        )}
        <div className="flex items-center gap-2.5">
          <Link href={`/stocks/${find.sym}`} className="shrink-0 transition-opacity hover:opacity-80" title={`${find.sym} — open dossier`}>
            <StockLogo symbol={find.sym} logoUrl={find.logoUrl} className="h-8 w-8 text-[10px]" />
          </Link>
          <div className="min-w-0">
            <Link href={`/stocks/${find.sym}`} className="font-bold text-teal-100 hover:underline">
              {find.sym}
            </Link>
            {find.name && find.name !== find.sym && (
              <Link href={`/stocks/${find.sym}`} className="block truncate text-[11px] text-teal-200/50 hover:text-teal-200/80 hover:underline">
                {find.name}
              </Link>
            )}
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          {find.cur != null && <span className="font-mono text-[15px] font-semibold tabular-nums text-teal-50">{money(find.cur, find.currency)}</span>}
          {find.change30d != null && (
            <span className={`font-mono text-xs font-semibold tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>
              {up ? "+" : ""}
              {pct(find.change30d, 0)}
            </span>
          )}
          {find.tag && <span className="text-[10px] tracking-wide text-teal-200/40">{find.tag}</span>}
        </div>
      </div>

      {/* thesis */}
      <div className="min-w-[180px] flex-1 basis-64">
        <details className="group">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className="overflow-hidden text-[13.5px] leading-relaxed text-teal-100/70 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] group-open:hidden">
              {previewText(find.body)}
            </span>
            <span className="mt-1.5 inline-block text-xs font-semibold text-teal-300 hover:underline group-open:hidden">
              ▸ read all ({words.toLocaleString()} words)
            </span>
            <span className="hidden text-xs font-semibold text-teal-300 hover:underline group-open:inline">▾ collapse</span>
          </summary>
          <div className="mt-2 text-sm">
            <Md text={find.body} />
          </div>
        </details>
        {obs && (
          <span
            className="mt-2 inline-block rounded-full border border-amber-400/20 bg-amber-400/5 px-2 py-0.5 text-[10px] font-semibold text-amber-200/70"
            title="How under-the-radar this is — GRQ's read (5 = almost nobody covers it)"
          >
            {obs}
          </span>
        )}
      </div>

      {/* 30-day sparkline */}
      <div className="hidden w-36 shrink-0 text-center lg:block">
        {find.spark.length >= 2 ? (
          <Sparkline values={find.spark} width={146} height={44} className="h-11 w-full" />
        ) : (
          <div className="flex h-11 items-center justify-center text-[10px] text-teal-200/30">no history yet</div>
        )}
        <div className="mt-0.5 text-[9px] uppercase tracking-[0.1em] text-teal-200/40">30-day trend</div>
      </div>

      {/* heat meter */}
      <div className="hidden w-28 shrink-0 sm:block">
        <HeatMeter heat={find.heat} color={color} />
      </div>

      {/* confidence gauge */}
      <div className="hidden w-[62px] shrink-0 justify-center lg:flex">
        <ConfidenceGauge value={find.confidence} size={58} />
      </div>

      {/* actions */}
      <div className="flex w-28 shrink-0 flex-col gap-2">
        <Link
          href={`/stocks/${find.sym}`}
          className="rounded-lg bg-teal-400/15 px-2.5 py-2 text-center text-xs font-semibold text-teal-200 transition-colors hover:bg-teal-400/25"
        >
          full dossier →
        </Link>
        {isMember && find.watch === "universe" ? (
          <span className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-center text-[11px] font-semibold text-emerald-300/80">✓ universe</span>
        ) : isMember ? (
          <WatchButton symbol={find.sym} state={find.watch} />
        ) : null}
        {isMember && toName && <ShareStockButton symbol={find.sym} toName={toName} compact />}
      </div>

      {/* dismiss */}
      {isMember && (
        <div className="absolute right-4 top-3">
          <DismissButton symbol={find.sym} name={find.name} />
        </div>
      )}
    </div>
  );
}
