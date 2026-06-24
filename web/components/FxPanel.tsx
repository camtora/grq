"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type FxRequestRow = {
  id: number;
  createdAt: string;
  amountUsdCents: number;
  estCadCents: number;
  reason: string;
  symbol: string | null;
  status: string;
  requestedBy: string;
  decidedBy: string | null;
  note: string | null;
  executedRate: number | null;
  executedCadCents: number | null;
  executedUsdCents: number | null;
  failReason: string | null;
};

type Dials = { fxMaxPerRequestCents: number; fxMaxPerWeekCents: number; usdAllocationCapPct: number };

type Props = {
  cadCashCents: number;
  usdCashCents: number;
  usdPct: number;
  fxUsdCad: number | null;
  dials: Dials;
  pending: FxRequestRow[];
  recent: FxRequestRow[];
  readOnly: boolean;
};

const cad = (c: number) => `$${(c / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd = (c: number) => `US$${(c / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const capLabel = (c: number) => (c > 0 ? cad(c) : "no limit");

export default function FxPanel({ cadCashCents, usdCashCents, usdPct, fxUsdCad, dials, pending, recent, readOnly }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [convertUsd, setConvertUsd] = useState("");
  const [perReq, setPerReq] = useState(String(dials.fxMaxPerRequestCents / 100));
  const [perWeek, setPerWeek] = useState(String(dials.fxMaxPerWeekCents / 100));
  const [capPct, setCapPct] = useState(String(dials.usdAllocationCapPct));

  async function post(tag: string, payload: Record<string, unknown>) {
    setBusy(tag);
    setMsg(null);
    try {
      const res = await fetch("/api/fx", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        setMsg({ kind: "err", text: data.error ?? `HTTP ${res.status}` });
      } else {
        setMsg({ kind: "ok", text: "Done." });
        router.refresh();
      }
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const field = "rounded-lg border border-teal-400/20 bg-(--field-bg) px-2.5 py-2 text-sm text-teal-50 outline-none";
  const btn = "rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">Currency &amp; FX</span>
        <span className="text-[11px] text-teal-200/40">
          {fxUsdCad ? `1 USD = $${fxUsdCad.toFixed(4)} CAD (BoC)` : "rate unavailable"}
        </span>
      </div>
      <p className="mb-4 text-sm text-teal-200/50">
        US stocks settle in USD, so the fund holds both currencies. The agent can ask to convert CAD→USD to fund a US name; you approve each one. No auto-FX, no margin.
      </p>

      {/* Balances */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-teal-400/15 bg-teal-400/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-teal-200/40">CAD cash</div>
          <div className="mt-1 text-lg font-bold text-teal-50">{cad(cadCashCents)}</div>
        </div>
        <div className="rounded-xl border border-teal-400/15 bg-teal-400/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-teal-200/40">USD cash</div>
          <div className="mt-1 text-lg font-bold text-teal-50">{usd(usdCashCents)}</div>
        </div>
        <div className="rounded-xl border border-teal-400/15 bg-teal-400/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-teal-200/40">USD allocation</div>
          <div className="mt-1 text-lg font-bold text-teal-50">
            {usdPct.toFixed(0)}%
            <span className="ml-1 text-xs font-normal text-teal-200/40">/ {dials.usdAllocationCapPct}% cap</span>
          </div>
        </div>
      </div>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-300/70">Awaiting approval ({pending.length})</div>
          <ul className="space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="rounded-xl border border-amber-400/25 bg-amber-400/[0.04] p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-teal-50">
                    {cad(r.estCadCents)} → {usd(r.amountUsdCents)}
                    {r.symbol && <span className="ml-2 rounded bg-teal-400/10 px-1.5 py-0.5 text-xs text-teal-200">{r.symbol}</span>}
                  </div>
                  <span className="text-[11px] text-teal-200/40">{r.requestedBy === "agent" ? "the agent" : r.requestedBy} · #{r.id}</span>
                </div>
                <p className="mt-1 text-sm text-teal-200/60">{r.reason}</p>
                {!readOnly && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      value={notes[r.id] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                      placeholder="note (optional)"
                      className={`${field} flex-1 min-w-[140px]`}
                    />
                    <button
                      onClick={() => post(`approve-${r.id}`, { action: "approve", id: r.id, note: notes[r.id] })}
                      disabled={busy !== null}
                      className={`${btn} border-emerald-400/40 bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25`}
                    >
                      {busy === `approve-${r.id}` ? "…" : "Approve & convert"}
                    </button>
                    <button
                      onClick={() => post(`reject-${r.id}`, { action: "reject", id: r.id, note: notes[r.id] })}
                      disabled={busy !== null}
                      className={`${btn} border-red-400/40 bg-red-400/10 text-red-300 hover:bg-red-400/20`}
                    >
                      {busy === `reject-${r.id}` ? "…" : "Reject"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Member controls: manual convert + dials */}
      {!readOnly && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-dashed border-teal-400/20 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-teal-200/50">Convert manually</div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-teal-200/50">US$</span>
              <input value={convertUsd} onChange={(e) => setConvertUsd(e.target.value)} inputMode="decimal" placeholder="amount" className={`${field} w-28`} />
              <button
                onClick={() => post("convert", { action: "convert", amountCents: Math.round(Number(convertUsd) * 100) })}
                disabled={busy !== null || !(Number(convertUsd) > 0)}
                className={`${btn} border-teal-400/40 bg-teal-400/15 text-teal-200 hover:bg-teal-400/25`}
              >
                {busy === "convert" ? "…" : "Convert CAD→USD"}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-teal-200/40">Buys USD with CAD now, at the BoC rate. Same caps + kill switch as an approval.</p>
          </div>

          <div className="rounded-xl border border-dashed border-teal-400/20 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-teal-200/50">Limits (0 = no limit)</div>
            <div className="space-y-2 text-sm">
              <label className="flex items-center justify-between gap-2">
                <span className="text-teal-200/50">Max / request (CAD $)</span>
                <input value={perReq} onChange={(e) => setPerReq(e.target.value)} inputMode="numeric" className={`${field} w-24`} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-teal-200/50">Max / week (CAD $)</span>
                <input value={perWeek} onChange={(e) => setPerWeek(e.target.value)} inputMode="numeric" className={`${field} w-24`} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-teal-200/50">Max USD allocation (%)</span>
                <input value={capPct} onChange={(e) => setCapPct(e.target.value)} inputMode="numeric" className={`${field} w-24`} />
              </label>
            </div>
            <button
              onClick={() =>
                post("dials", {
                  action: "dials",
                  fxMaxPerRequestCents: Math.round(Number(perReq) * 100),
                  fxMaxPerWeekCents: Math.round(Number(perWeek) * 100),
                  usdAllocationCapPct: Math.round(Number(capPct)),
                })
              }
              disabled={busy !== null}
              className={`${btn} mt-2 border-teal-400/40 bg-teal-400/15 text-teal-200 hover:bg-teal-400/25`}
            >
              {busy === "dials" ? "…" : "Save limits"}
            </button>
          </div>
        </div>
      )}

      {readOnly && (
        <div className="mt-4 text-xs text-teal-200/40">
          Limits — per request: {capLabel(dials.fxMaxPerRequestCents)} · per week: {capLabel(dials.fxMaxPerWeekCents)} · USD cap: {dials.usdAllocationCapPct}%. Members approve conversions.
        </div>
      )}

      {/* Recent history */}
      {recent.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-teal-200/40">Recent</div>
          <ul className="space-y-1 text-xs text-teal-200/50">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-2">
                <span
                  className={
                    r.status === "EXECUTED" ? "text-emerald-400" : r.status === "REJECTED" ? "text-teal-200/40" : "text-red-400"
                  }
                >
                  {r.status}
                </span>
                <span>
                  {r.status === "EXECUTED" && r.executedCadCents != null
                    ? `${cad(r.executedCadCents)} → ${usd(r.executedUsdCents ?? 0)}`
                    : `${cad(r.estCadCents)} → ${usd(r.amountUsdCents)}`}
                </span>
                {r.symbol && <span className="text-teal-200/40">{r.symbol}</span>}
                {r.decidedBy && <span className="text-teal-200/30">· {r.decidedBy}</span>}
                {r.failReason && <span className="text-red-400/70">· {r.failReason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {msg && <div className={`mt-3 text-sm ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</div>}
    </div>
  );
}
