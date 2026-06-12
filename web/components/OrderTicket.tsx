"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Result = { kind: "ok" | "err"; text: string } | null;

export default function OrderTicket({ symbols }: { symbols: string[] }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState(symbols[0] ?? "XIC");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [type, setType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [qty, setQty] = useState("10");
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function submit() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/sim/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol,
          side,
          type,
          qty: Number(qty),
          limitPriceCents: type === "LIMIT" ? Math.round(Number(limit) * 100) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        setResult({ kind: "err", text: data.rejectReason ?? data.error ?? `HTTP ${res.status}` });
      } else {
        setResult({
          kind: "ok",
          text:
            data.status === "FILLED"
              ? `Filled @ $${(data.fillPriceCents / 100).toFixed(2)} · commission $${(data.commissionCents / 100).toFixed(2)}`
              : `Resting limit order #${data.orderId} (fills when the price crosses)`,
        });
        router.refresh();
      }
    } catch (e) {
      setResult({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const sel =
    "rounded-lg border border-teal-400/20 bg-(--field-bg) px-2.5 py-2 text-sm text-teal-50 outline-none";

  return (
    <div className="rounded-2xl border border-dashed border-teal-400/20 bg-teal-400/[0.02] p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">
          Manual sim order
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-teal-200/30">
          dev tool — retires when the agent takes over
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <select value={side} onChange={(e) => setSide(e.target.value as "BUY" | "SELL")} className={sel}>
          <option>BUY</option>
          <option>SELL</option>
        </select>
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          inputMode="numeric"
          className={`${sel} w-20`}
          placeholder="qty"
        />
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className={sel}>
          {symbols.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as "MARKET" | "LIMIT")} className={sel}>
          <option>MARKET</option>
          <option>LIMIT</option>
        </select>
        {type === "LIMIT" && (
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            inputMode="decimal"
            className={`${sel} w-28`}
            placeholder="limit $"
          />
        )}
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-xl border border-teal-400/40 bg-teal-400/15 px-4 py-2 text-sm font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25 disabled:opacity-50"
        >
          {busy ? "…" : "Place"}
        </button>
      </div>
      {result && (
        <div className={`mt-3 text-sm ${result.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
          {result.text}
        </div>
      )}
    </div>
  );
}
