"use client";

import { useEffect, useState } from "react";
import type { Recommendation, Signals } from "@/agent/signals";
import RatingDial from "./RatingDial";

// The graded rating on /stocks — click it for the full "why": the dial, every
// signal family's read, and how they combine into the verdict. More than a tooltip.
function tone(ratio: number): string {
  if (ratio >= 0.25) return "bg-emerald-400/20 text-emerald-300 border-emerald-400/30";
  if (ratio <= -0.25) return "bg-red-400/20 text-red-300 border-red-400/30";
  return "bg-amber-400/15 text-amber-300 border-amber-400/25";
}
const SIG_COLOR: Record<string, string> = { BUY: "text-emerald-400", SELL: "text-red-400", HOLD: "text-amber-300" };

export default function SignalRec({ rec, signals }: { rec: Recommendation | null; signals?: Signals | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!rec) return <span className="text-xs text-teal-200/30">—</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Why this rating? (click to explain)"
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide hover:brightness-110 ${tone(rec.ratio)}`}
      >
        {rec.label}
        <span className="font-semibold tabular-nums opacity-60">{rec.score}/10</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-teal-400/25 bg-[#0b1614] p-5 text-left shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-teal-300/70">Why {rec.label}?</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-xl leading-none text-teal-200/50 hover:text-teal-100"
              >
                ×
              </button>
            </div>

            <div className="mt-4">
              <RatingDial rec={rec} />
            </div>

            {signals && signals.families.length > 0 && (
              <div className="mt-5 space-y-2">
                {signals.families.map((f) => (
                  <div key={f.family} className="border-t border-teal-400/10 pt-2 first:border-0 first:pt-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-24 font-semibold uppercase text-teal-100/80">{f.family}</span>
                      <span className={`font-bold ${SIG_COLOR[f.signal] ?? "text-amber-300"}`}>{f.signal}</span>
                      <span className="ml-auto text-xs tabular-nums text-teal-200/40">
                        {f.confidence}%{f.family === "volatility" ? " · regime, excluded" : ""}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-teal-200/50">{f.rationale}</div>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-5 rounded-lg bg-teal-400/[0.06] p-3 text-xs leading-relaxed text-teal-200/60">
              A confidence-weighted vote of the three directional families (trend, rsi, macd; volatility is a regime
              gauge, excluded). The score is the share of signal-confidence behind the verdict —{" "}
              <b className="text-teal-100/80">{rec.confidence}%</b>, which lands on{" "}
              <b className="text-teal-100/80">{rec.label}</b> ({rec.score}/10). {rec.rationale}.
            </p>
            <p className="mt-3 text-[11px] text-teal-200/40">
              Advisory technical signals on scoreboard probation — the call the agent actually makes lives in its
              journal and behind the §6 gate.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
