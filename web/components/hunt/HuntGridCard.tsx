import Link from "next/link";
import { money, pct } from "@/lib/money";
import { heatColor } from "@/lib/heat";
import StockLogo from "@/components/StockLogo";
import WatchButton from "@/components/WatchButton";
import ShareStockButton from "@/components/ShareStockButton";
import Sparkline from "@/components/Sparkline";
import ConfidenceGauge from "@/components/hunt/ConfidenceGauge";
import HeatMeter from "@/components/hunt/HeatMeter";
import { previewText } from "@/components/hunt/shared";
import type { HuntFind } from "@/components/hunt/HuntRow";

// Direction B grid tile — the non-#1 finds below the hero. Logo+ticker+name, price/change,
// a full-width sparkline, gauge + heat meter, a 2-line thesis, then dossier + icon-watch.
export default function HuntGridCard({ find, isMember, toName }: { find: HuntFind; isMember: boolean; toName: string | null }) {
  const color = heatColor(find.heat);
  const up = (find.change30d ?? 0) >= 0;

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-5">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, var(--spark-up), ${color})` }} aria-hidden />
      <div className="mb-3 flex items-center gap-2.5">
        <Link href={`/stocks/${find.sym}`} className="shrink-0 transition-opacity hover:opacity-80">
          <StockLogo symbol={find.sym} logoUrl={find.logoUrl} className="h-8 w-8 text-[10px]" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/stocks/${find.sym}`} className="block font-bold leading-tight text-teal-100 hover:underline">
            {find.sym}
          </Link>
          {find.name !== find.sym && <div className="truncate text-[10.5px] text-teal-200/50">{find.name}</div>}
        </div>
        <div className="shrink-0 text-right">
          {find.cur != null && <div className="font-mono text-[13px] font-semibold tabular-nums text-teal-50">{money(find.cur, find.currency)}</div>}
          {find.change30d != null && (
            <div className={`font-mono text-[11px] font-semibold tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>
              {up ? "+" : ""}
              {pct(find.change30d, 0)}
            </div>
          )}
        </div>
      </div>

      <div className="mb-3.5 h-[38px]">
        {find.spark.length >= 2 ? (
          <Sparkline values={find.spark} width={260} height={38} area className="h-[38px] w-full" />
        ) : (
          <div className="flex h-[38px] items-center justify-center text-[10px] text-teal-200/30">no history yet</div>
        )}
      </div>

      <div className="mb-3 flex items-center gap-3.5">
        <ConfidenceGauge value={find.confidence} size={50} />
        <div className="min-w-0 flex-1">
          <HeatMeter heat={find.heat} color={color} />
        </div>
      </div>

      <p className="mb-3.5 flex-1 overflow-hidden text-[12.5px] leading-relaxed text-teal-100/70 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
        {previewText(find.body)}
      </p>

      <div className="flex items-center gap-2">
        <Link
          href={`/stocks/${find.sym}`}
          className="flex-1 rounded-lg bg-teal-400/15 px-2.5 py-2 text-center text-xs font-semibold text-teal-200 transition-colors hover:bg-teal-400/25"
        >
          full dossier →
        </Link>
        {isMember && <WatchButton symbol={find.sym} state={find.watch} iconOnly />}
        {isMember && toName && <ShareStockButton symbol={find.sym} toName={toName} iconOnly />}
      </div>
    </div>
  );
}
