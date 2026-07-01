"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pnl } from "@/components/ui";
import { money } from "@/lib/money";
import Sparkline from "@/components/Sparkline";
import PayoffChart from "@/components/options/PayoffChart";
import type { Leg } from "@/lib/options/payoff";
import type { ShortHolding } from "@/lib/short/lab";

// One open modeled short (docs/SHORT-LAB.md): the metrics, the borrow accruing, the UNBOUNDED-loss
// payoff line, and a Cover button. Members only (the page hides it for viewers).
const ret = (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;

export default function ShortPositionCard({ h, isMember }: { h: ShortHolding; isMember: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const legs: Leg[] = [{ kind: "STOCK", action: "SELL", qty: h.qty, entryCents: h.avgShortCents }];

  async function cover() {
    if (!window.confirm(`Cover (buy back) ${h.qty} ${h.symbol} at the live price?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/short-lab", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "cover", positionId: h.id }) });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-red-400/15 bg-red-400/[0.03] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-teal-50">
            SHORT {h.qty} {h.symbol} <span className="text-teal-200/40">@ {money(h.avgShortCents)}</span>
          </div>
          <div className="text-[10px] tabular-nums text-teal-200/40">
            mark {money(h.markCents)} · owe {money(h.liabilityCents)} · {h.daysHeld}d held · borrow ~{(h.borrowBps / 100).toFixed(1)}%/yr ({money(h.accruedBorrowCents)} so far)
          </div>
        </div>
        <div className="text-right">
          <Pnl cents={h.unrealCents} className="text-sm font-bold" />
          <div className={`text-[10px] tabular-nums ${h.returnPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>{ret(h.returnPct)}</div>
        </div>
      </div>

      <details className="mt-2 group">
        <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-teal-200/40 hover:text-teal-200/70">Payoff — the loss that never stops</summary>
        <div className="mt-1">
          <PayoffChart legs={legs} spotCents={h.markCents} dteNow={0} breakevens={[h.avgShortCents]} expiryLabel="P/L at any price" />
          <p className="text-[10px] text-teal-200/40">Profit is capped (the stock can only fall to $0); the loss climbs forever as the price rises — that&apos;s the whole danger of a short.</p>
        </div>
      </details>

      {h.decay.length >= 2 ? (
        <div className="mt-2">
          <div className="text-teal-200/15"><Sparkline values={h.decay} height={36} area className="h-9 w-full max-w-xs" /></div>
          <div className="text-[9px] text-teal-200/35">unrealized P&amp;L over time (rising = the short working, falling = it running against you)</div>
        </div>
      ) : null}

      {isMember ? (
        <button type="button" onClick={cover} disabled={busy} className="mt-2 rounded-lg border border-teal-400/25 bg-teal-400/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/20 disabled:opacity-50">
          {busy ? "…" : "Cover"}
        </button>
      ) : null}
    </div>
  );
}
