import { Card } from "@/components/ui";
import Term from "@/components/Term";
import PanelHeader from "@/components/PanelHeader";
import type { OptionsDaily } from "@prisma/client";

// Tier 3 — options positioning on the stock page. Horizontal/compact (minimise vertical space):
// the dealer-gamma regime sits on the LEFT, the four metrics in one evenly-spaced row on its RIGHT.
// Built to be legible to a non-options reader (plain-English + glossary). A SIGNAL only — the fund
// never trades options. null = no listed-options coverage (CA/illiquid name).
const fmtStrike = (c: number | null) => (c != null ? `$${(c / 100).toFixed(c < 10_000 ? 2 : 0)}` : "—");
const fmtGex = (n: number) => {
  const m = n / 1e6;
  return `${m >= 0 ? "+" : "−"}$${Math.abs(m).toFixed(0)}M`;
};

function Metric({ label, k, value, note }: { label: string; k: string; value: string; note?: string }) {
  return (
    <div className="px-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-teal-200/40">
        <Term k={k}>{label}</Term>
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-teal-100/90">{value}</div>
      {note ? <div className="text-[10px] text-teal-200/40">{note}</div> : null}
    </div>
  );
}

export default function OptionsPanel({ o }: { o: OptionsDaily | null }) {
  return (
    <div className="flex h-full flex-col gap-2">
      <PanelHeader fresh="~hourly" freshTitle="CBOE options data — delayed, re-fetched ~hourly intraday. A signal only; the fund never trades options.">
        <Term k="options-positioning">Options positioning</Term>{" "}
        <span className="normal-case text-teal-200/40">· Tier 3 · signal only</span>
      </PanelHeader>
      <Card className="flex-1 p-4">
      {!o ? (
        <p className="text-sm text-teal-200/40">
          No listed-options data — this name has a thin or no US options market. (US-listed optionable names only; the
          fund never trades options regardless — read purely as a signal.)
        </p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          {/* Regime — the headline read, on the left */}
          <div
            className={`shrink-0 rounded-lg border p-3 sm:w-72 ${
              o.regime === "negative" ? "border-amber-400/30 bg-amber-400/[0.05]" : "border-teal-400/25 bg-teal-400/[0.04]"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className={`text-sm font-bold ${o.regime === "negative" ? "text-amber-300" : "text-teal-200"}`}>
                <Term k="gamma-exposure">Dealer gamma</Term>: {o.regime === "negative" ? "NEGATIVE" : "POSITIVE"}
              </span>
              <span className="shrink-0 tabular-nums text-[11px] text-teal-200/60">{fmtGex(o.netGex)}/1%</span>
            </div>
            <p className="mt-1 text-xs text-teal-100/70">
              {o.regime === "negative"
                ? "Dealers AMPLIFY moves — expect bigger, trendier swings."
                : "Dealers DAMPEN moves — tends to trade range-bound / “pinned.”"}
            </p>
          </div>

          {/* The four metrics — one evenly-spaced row on the right */}
          <div className="grid flex-1 grid-cols-2 items-center divide-teal-400/10 sm:grid-cols-4 sm:divide-x">
            <Metric
              label="Put / Call"
              k="put-call-ratio"
              value={`${o.pcOI?.toFixed(2) ?? "—"} OI`}
              note={`${o.pcVol?.toFixed(2) ?? "—"} vol · ${(o.pcOI ?? 0) > 1 ? "defensive" : "call-heavy"}`}
            />
            <Metric label="Impl vol ~30d" k="implied-volatility" value={o.atmIvBps != null ? `${(o.atmIvBps / 100).toFixed(0)}%` : "—"} note="expected swing" />
            <Metric label="Call / put wall" k="call-wall" value={`${fmtStrike(o.callWallCents)} / ${fmtStrike(o.putWallCents)}`} note="resist / support" />
            <Metric
              label="Skew 25Δ"
              k="volatility-skew"
              value={o.skewBps != null ? `${o.skewBps >= 0 ? "+" : ""}${o.skewBps}bp` : "—"}
              note={o.skewBps != null && o.skewBps > 150 ? "crash-fear bid" : "put vs call IV"}
            />
          </div>
        </div>
      )}
      </Card>
    </div>
  );
}
