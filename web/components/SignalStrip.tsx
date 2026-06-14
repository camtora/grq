import type { Signals } from "@/agent/signals";

// Compact per-stock signal readout for table rows: one square per family
// (T trend · R rsi · M macd · V volatility), colored by BUY/SELL/HOLD, with the
// full call + rationale on hover. Mirrors the one-pager's Signals panel.
const ORDER = ["trend", "rsi", "macd", "volatility"] as const;
const LETTER: Record<string, string> = { trend: "T", rsi: "R", macd: "M", volatility: "V" };
const SIG_CLASS: Record<string, string> = {
  BUY: "bg-emerald-400/20 text-emerald-300 border-emerald-400/30",
  SELL: "bg-red-400/20 text-red-300 border-red-400/30",
  HOLD: "bg-teal-400/[0.06] text-teal-200/40 border-teal-400/10",
};

export default function SignalStrip({ signals }: { signals: Signals | null }) {
  if (!signals || signals.families.length === 0) {
    return <span className="text-xs text-teal-200/30" title="Insufficient bar history">—</span>;
  }
  const byFam = new Map(signals.families.map((f) => [f.family, f]));
  return (
    <span className="inline-flex gap-1">
      {ORDER.map((fam) => {
        const f = byFam.get(fam);
        if (!f) return null;
        return (
          <span
            key={fam}
            title={`${fam}: ${f.signal} (${f.confidence}%) — ${f.rationale}`}
            className={`inline-flex h-5 w-5 items-center justify-center rounded border text-[10px] font-bold ${SIG_CLASS[f.signal] ?? SIG_CLASS.HOLD}`}
          >
            {LETTER[fam] ?? fam[0].toUpperCase()}
          </span>
        );
      })}
    </span>
  );
}
