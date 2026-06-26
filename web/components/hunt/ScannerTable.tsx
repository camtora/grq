import Link from "next/link";
import { pct } from "@/lib/money";
import { heatColor } from "@/lib/heat";
import { LiveHuntPrice } from "@/components/LiveTableCells";
import StockLogo from "@/components/StockLogo";
import WatchButton from "@/components/WatchButton";
import ShareStockButton from "@/components/ShareStockButton";
import Sparkline from "@/components/Sparkline";
import ConfidenceGauge from "@/components/hunt/ConfidenceGauge";
import AvatarStack from "@/components/AvatarStack";
import { previewText } from "@/components/hunt/shared";
import type { HuntFind } from "@/components/hunt/HuntRow";

// Direction C — the Scanner/terminal: a dense one-row-per-name table for power users.
// Columns: HEAT · TICKER · LAST · CHG · 30-DAY · CONF · THESIS · actions.
const COLS = "92px minmax(150px,1.4fr) 92px 64px 108px 56px minmax(160px,2.2fr) 96px";

export default function ScannerTable({ finds, isMember, toName }: { finds: HuntFind[]; isMember: boolean; toName: string | null }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)]">
      <div className="min-w-[940px]">
        <div
          className="grid items-center gap-3.5 border-b border-[color:var(--card-border)] bg-black/15 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.1em] text-teal-200/50"
          style={{ gridTemplateColumns: COLS }}
        >
          <span>Heat ▾</span>
          <span>Ticker</span>
          <span className="text-right">Last</span>
          <span className="text-right">Chg</span>
          <span className="text-center">30-day</span>
          <span className="text-center">Conf</span>
          <span>Thesis</span>
          <span />
        </div>
        {finds.map((find) => (
          <ScannerRow key={find.sym} find={find} isMember={isMember} toName={toName} />
        ))}
      </div>
    </div>
  );
}

function ScannerRow({ find, isMember, toName }: { find: HuntFind; isMember: boolean; toName: string | null }) {
  const color = heatColor(find.heat);
  const up = (find.change30d ?? 0) >= 0;
  const rank2 = String(find.rank).padStart(2, "0");
  const isTop = find.rank === 1;

  return (
    <div
      className="grid items-center gap-3.5 border-b border-[color:var(--card-border)]/60 px-5 py-3.5 transition-colors hover:bg-teal-400/[0.04]"
      style={{ gridTemplateColumns: COLS }}
    >
      {/* heat */}
      <div>
        <div className="mb-1.5 flex items-baseline gap-1.5">
          <span className="font-mono text-[11px] font-bold text-teal-200/40">{rank2}</span>
          <span className="font-mono text-base font-bold tabular-nums" style={{ color }}>
            {find.heat}
          </span>
        </div>
        <div className="overflow-hidden rounded" style={{ height: 5, background: "color-mix(in oklab, var(--body-fg) 8%, transparent)" }}>
          <div className="h-full rounded" style={{ width: `${find.heat}%`, background: `linear-gradient(90deg, var(--spark-up), ${color})` }} />
        </div>
      </div>
      {/* ticker */}
      <div className="flex min-w-0 items-center gap-2.5">
        <Link href={`/stocks/${find.sym}`} className="shrink-0 transition-opacity hover:opacity-80">
          <StockLogo symbol={find.sym} logoUrl={find.logoUrl} className="h-[30px] w-[30px] text-[9px]" />
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Link href={`/stocks/${find.sym}`} className="font-bold text-teal-100 hover:underline">
              {find.sym}
            </Link>
            {isTop && (
              <span className="rounded border border-amber-400/40 bg-amber-400/15 px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-amber-300">hot</span>
            )}
          </div>
          {find.name !== find.sym && <div className="truncate text-[10px] text-teal-200/50">{find.name}</div>}
        </div>
      </div>
      {/* last */}
      <LiveHuntPrice
        as="div"
        symbol={find.sym}
        initialCents={find.cur}
        currency={find.currency}
        fallback="—"
        className="text-right font-mono text-sm font-semibold tabular-nums text-teal-50"
      />
      {/* chg */}
      <div className={`text-right font-mono text-[13px] font-semibold tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>
        {find.change30d != null ? `${up ? "+" : ""}${pct(find.change30d, 0)}` : "—"}
      </div>
      {/* 30-day spark */}
      <div className="h-8">
        {find.spark.length >= 2 ? (
          <Sparkline values={find.spark} width={108} height={32} className="h-8 w-full" />
        ) : (
          <div className="flex h-8 items-center justify-center text-[9px] text-teal-200/25">—</div>
        )}
      </div>
      {/* conf */}
      <div className="flex justify-center">
        <ConfidenceGauge value={find.confidence} size={46} label="" />
      </div>
      {/* thesis */}
      <p className="overflow-hidden text-[12px] leading-snug text-teal-100/65 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
        {previewText(find.body)}
      </p>
      {/* actions */}
      <div className="flex items-center justify-end gap-2">
        <Link
          href={`/stocks/${find.sym}`}
          className="rounded-lg bg-teal-400/15 px-2.5 py-1.5 text-[11.5px] font-semibold text-teal-200 transition-colors hover:bg-teal-400/25"
        >
          dossier
        </Link>
        {/* in the universe → no watch indicator (it's promoted, not "being watched"). */}
        {isMember && find.watchers.length > 0 && <AvatarStack people={find.watchers} size="h-5 w-5" />}
        {isMember && find.watch === "none" && <WatchButton symbol={find.sym} iconOnly />}
        {isMember && toName && <ShareStockButton symbol={find.sym} toName={toName} iconOnly />}
      </div>
    </div>
  );
}
