import Link from "next/link";
import { money, pct } from "@/lib/money";
import { heatColor } from "@/lib/heat";
import StockLogo from "@/components/StockLogo";
import WatchButton from "@/components/WatchButton";
import DismissButton from "@/components/DismissButton";
import Sparkline from "@/components/Sparkline";
import Md from "@/components/Md";
import ConfidenceGauge from "@/components/hunt/ConfidenceGauge";
import { wordCount } from "@/components/hunt/shared";
import type { HuntFind } from "@/components/hunt/HuntRow";

// Direction B — the "hottest pick" hero: the #1 find blown up with a big 30-day chart,
// the 92px confidence gauge, a large heat score + meter, and the full (unclamped) thesis.
export default function HuntHero({ find, isMember }: { find: HuntFind; isMember: boolean }) {
  const color = heatColor(find.heat);
  const up = (find.change30d ?? 0) >= 0;

  return (
    <div className="relative mb-6 overflow-hidden rounded-[22px] border border-amber-400/25 bg-[var(--card-bg)] p-6 shadow-[0_0_70px_-30px] shadow-amber-400/20 lg:p-8">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, var(--spark-up), ${color})` }} aria-hidden />
      <div className="flex flex-col gap-8 lg:flex-row">
        {/* left */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-3.5 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/45 bg-amber-400/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-amber-300">
              ▲ Hottest pick
            </span>
            <span className="font-mono text-xs text-teal-200/50">RANK 01 · HEAT {find.heat}</span>
          </div>
          <div className="flex items-center gap-3.5">
            <Link href={`/stocks/${find.sym}`} className="shrink-0 transition-opacity hover:opacity-80">
              <StockLogo symbol={find.sym} logoUrl={find.logoUrl} className="h-[50px] w-[50px] text-sm" />
            </Link>
            <div className="min-w-0">
              <Link href={`/stocks/${find.sym}`} className="block text-4xl font-extrabold leading-none tracking-tight text-teal-50 hover:underline">
                {find.sym}
              </Link>
              <div className="mt-1 truncate text-[13px] text-teal-200/50">
                {[find.name !== find.sym ? find.name : null, find.tag].filter(Boolean).join(" · ") || find.sym}
              </div>
            </div>
          </div>
          <div className="my-4 flex items-baseline gap-3.5">
            {find.cur != null && <span className="font-mono text-3xl font-bold tabular-nums text-teal-50">{money(find.cur, find.currency)}</span>}
            {find.change30d != null && (
              <span className={`font-mono text-base font-semibold tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>
                {up ? "+" : ""}
                {pct(find.change30d, 0)} <span className="text-[11px] font-normal text-teal-200/40">30d</span>
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 text-sm leading-relaxed text-teal-100/80">
            <Md text={find.body} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={`/stocks/${find.sym}`}
              className="rounded-xl bg-gradient-to-b from-teal-300 to-teal-500 px-5 py-2.5 text-sm font-bold text-[#04110d] shadow-lg shadow-teal-400/25 transition-opacity hover:opacity-90"
            >
              full dossier →
            </Link>
            {isMember && (find.watch === "universe" ? <WatchButton symbol={find.sym} state="universe" /> : <WatchButton symbol={find.sym} state={find.watch} />)}
            {isMember && <DismissButton symbol={find.sym} name={find.name} />}
          </div>
        </div>

        {/* right — chart + gauge/heat */}
        <div className="flex w-full shrink-0 flex-col lg:w-[460px]">
          <div className="rounded-2xl border border-[color:var(--card-border)] bg-black/15 px-4 pb-3 pt-3.5">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-teal-200/50">
              <span className="uppercase tracking-wide">30-day price</span>
              {find.cur != null && (
                <span className={`font-mono ${up ? "text-emerald-400" : "text-red-400"}`}>
                  now {money(find.cur, find.currency)}
                  {find.change30d != null ? ` ${up ? "+" : ""}${pct(find.change30d, 0)}` : ""}
                </span>
              )}
            </div>
            {find.spark.length >= 2 ? (
              <Sparkline values={find.spark} width={460} height={150} area className="h-[150px] w-full" />
            ) : (
              <div className="flex h-[150px] items-center justify-center text-xs text-teal-200/30">no price history yet</div>
            )}
          </div>
          <div className="mt-4 flex items-center gap-5">
            <ConfidenceGauge value={find.confidence} size={92} label="CONFIDENCE" />
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[11px] uppercase tracking-[0.12em] text-teal-200/50">Heat score</span>
                <span className="font-mono text-2xl font-bold tabular-nums" style={{ color }}>
                  {find.heat}
                </span>
              </div>
              <div className="overflow-hidden rounded-md" style={{ height: 10, background: "color-mix(in oklab, var(--body-fg) 8%, transparent)" }}>
                <div className="h-full rounded-md" style={{ width: `${find.heat}%`, background: `linear-gradient(90deg, var(--spark-up), ${color})` }} />
              </div>
              <div className="mt-2 text-[11px] text-teal-200/40">{wordCount(find.body).toLocaleString()} words of thesis · heat is GRQ&apos;s derived read</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
