"use client";

import { useState } from "react";
import Link from "next/link";
import Term from "@/components/Term";
import SmartMoneyAvatar from "./SmartMoneyAvatar";
import type { CongressMemberTrades } from "@/lib/smart-money/queries";
import type { WatchOverlap } from "@/lib/smart-money/types";

// A tracked member of Congress (a "personal account" in the roster). 13F doesn't
// apply — we show their recent disclosed transactions instead. Collapsed by
// default and expands on click, matching the fund PortfolioCards in the same grid.
export default function CongressCard({ entry, overlap }: { entry: CongressMemberTrades; overlap: Record<string, WatchOverlap> }) {
  const { person, trades } = entry;
  const [open, setOpen] = useState(false);
  const ownsCount = trades.filter((t) => overlap[t.symbol]).length;

  return (
    <div className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)]">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 p-4 text-left">
        <SmartMoneyAvatar name={person.name} avatar={person.avatar} accent={person.accent} className="h-12 w-12 text-base" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-teal-50">{person.name}</div>
          <div className="text-xs text-teal-200/50">{person.role}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-teal-200/40">
            <span className="font-semibold text-teal-200/70">{trades.length} disclosed trade{trades.length === 1 ? "" : "s"}</span>
            {ownsCount > 0 && (
              <>
                <span>·</span>
                <span className="text-emerald-300/70">{ownsCount} overlap{ownsCount > 1 ? "s" : ""} our universe</span>
              </>
            )}
          </div>
        </div>
        <span className={`shrink-0 text-teal-200/40 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <p className="mb-2 text-xs italic text-teal-200/45">{person.blurb}</p>
          {trades.length === 0 ? (
            <p className="py-3 text-center text-xs text-teal-200/35">No disclosed trades in the window.</p>
          ) : (
            <div>
              {trades.slice(0, 10).map((t, i) => (
                <div key={i} className="flex items-center gap-2 border-t border-teal-400/10 py-1.5 text-sm">
                  <span className="w-16 shrink-0">
                    {overlap[t.symbol] ? (
                      <Link href={`/stocks/${t.symbol}`} className="font-semibold text-teal-300 hover:underline">
                        {t.symbol}
                      </Link>
                    ) : (
                      <span className="font-semibold text-teal-100/90">{t.symbol}</span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      t.side === "BUY" ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-300" : "border-red-400/30 bg-red-400/15 text-red-300"
                    }`}
                  >
                    {t.side}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-teal-200/45" title={t.assetName}>
                    {t.amountRange}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-teal-200/35">{t.txnDate.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] text-teal-200/35">
            <Term k="congress-trade">Disclosed transactions</Term> — ranges, not a holdings list.
          </p>
        </div>
      )}
    </div>
  );
}
