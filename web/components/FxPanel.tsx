"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type FxRequestRow = {
  id: number;
  createdAt: string;
  fromCurrency?: string;
  toCurrency?: string;
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
const money = (ccy: "CAD" | "USD", c: number) => (ccy === "USD" ? usd(c) : cad(c));
const capLabel = (c: number) => (c > 0 ? cad(c) : "no limit");

// "$X CAD → US$Y" or "US$X → $Y CAD" — direction-aware (uses executed legs once filled).
function fxLabel(r: FxRequestRow): string {
  const done = r.status === "EXECUTED" && r.executedCadCents != null;
  const cadCents = done ? (r.executedCadCents as number) : r.estCadCents;
  const usdCents = done ? (r.executedUsdCents ?? 0) : r.amountUsdCents;
  return r.toCurrency === "CAD" ? `${usd(usdCents)} → ${cad(cadCents)}` : `${cad(cadCents)} → ${usd(usdCents)}`;
}

export default function FxPanel({ cadCashCents, usdCashCents, usdPct, fxUsdCad, dials, pending, recent, readOnly }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [amount, setAmount] = useState("");
  const [dir, setDir] = useState<"CAD→USD" | "USD→CAD">("CAD→USD");
  const [amountCcy, setAmountCcy] = useState<"CAD" | "USD">("CAD"); // which currency the typed amount is in
  const [confirming, setConfirming] = useState(false);
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
                    {fxLabel(r)}
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
        <div className="mt-5 space-y-4">
          {(() => {
            const fromCcy = dir === "USD→CAD" ? "USD" : "CAD";
            const toCcy = dir === "USD→CAD" ? "CAD" : "USD";
            const typedCents = Math.round(Number(amount) * 100);
            const valid = typedCents > 0 && Number.isFinite(typedCents);
            // Mirror lib/fx-requests legsFor: type the amount in either currency, derive both legs.
            const usdCents = amountCcy === "USD" ? typedCents : fxUsdCad ? Math.round(typedCents / fxUsdCad) : 0;
            const cadCents = amountCcy === "CAD" ? typedCents : fxUsdCad ? Math.round(typedCents * fxUsdCad) : 0;
            const fromCents = fromCcy === "USD" ? usdCents : cadCents;
            const toCents = toCcy === "USD" ? usdCents : cadCents;
            // The broker acquires exactly the destination (to) leg; the FX fee always comes out
            // of the source (from) leg — so the source is the approximate side, always.
            const canPreview = valid && fxUsdCad != null;
            const reset = () => setConfirming(false);
            return (
              <div className="rounded-xl border border-dashed border-teal-400/20 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-teal-200/50">Convert manually</div>

                {/* Direction */}
                <div className="mb-2 inline-flex rounded-lg border border-teal-400/15 p-0.5 text-xs font-semibold">
                  {(["CAD→USD", "USD→CAD"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => { setDir(d); reset(); }}
                      className={`rounded-md px-2.5 py-1 transition-colors ${dir === d ? "bg-teal-400/20 text-teal-100" : "text-teal-200/50 hover:bg-teal-400/10"}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>

                {/* Amount + which currency it's in */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg border border-teal-400/15 p-0.5 text-xs font-semibold">
                    {(["CAD", "USD"] as const).map((c) => (
                      <button
                        key={c}
                        onClick={() => { setAmountCcy(c); reset(); }}
                        className={`rounded-md px-2 py-1.5 transition-colors ${amountCcy === c ? "bg-teal-400/20 text-teal-100" : "text-teal-200/50 hover:bg-teal-400/10"}`}
                      >
                        {c === "USD" ? "US$" : "$ CAD"}
                      </button>
                    ))}
                  </div>
                  <input
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); reset(); }}
                    inputMode="decimal"
                    placeholder="amount"
                    className={`${field} w-28`}
                  />
                  {canPreview && (
                    <span className="text-xs text-teal-200/50">
                      ≈ {amountCcy === "USD" ? cad(cadCents) : usd(usdCents)} {amountCcy === "USD" ? "CAD" : "USD"}
                    </span>
                  )}
                </div>

                {/* Convert → are-you-sure → confirm */}
                {!confirming ? (
                  <button
                    onClick={() => setConfirming(true)}
                    disabled={busy !== null || !canPreview}
                    className={`${btn} mt-3 border-teal-400/40 bg-teal-400/15 text-teal-200 hover:bg-teal-400/25`}
                  >
                    Convert {dir}
                  </button>
                ) : (
                  <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/[0.05] p-2.5">
                    <p className="text-sm text-teal-50">
                      Convert ~{money(fromCcy, fromCents)} → {money(toCcy, toCents)}?
                    </p>
                    <p className="mt-0.5 text-[11px] text-teal-200/40">
                      At 1 USD = ${fxUsdCad?.toFixed(4)} CAD (BoC). You receive {money(toCcy, toCents)}; the {fromCcy} you spend is sized at the rate plus a small FX fee. This moves real cash.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() =>
                          post("convert", {
                            action: "convert",
                            amountCents: typedCents,
                            inputCurrency: amountCcy,
                            fromCurrency: fromCcy,
                            toCurrency: toCcy,
                          }).then(() => { setConfirming(false); setAmount(""); })
                        }
                        disabled={busy !== null}
                        className={`${btn} border-emerald-400/40 bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25`}
                      >
                        {busy === "convert" ? "…" : "Yes, convert"}
                      </button>
                      <button
                        onClick={() => setConfirming(false)}
                        disabled={busy !== null}
                        className={`${btn} border-teal-400/20 text-teal-200/60 hover:bg-teal-400/10`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <p className="mt-2 text-[11px] text-teal-200/40">
                  Enter the amount in CAD or US$ — whichever you type, you receive an exact {toCcy} amount and the {fromCcy} you spend sizes at the BoC rate (plus a small FX fee). Won&apos;t overdraw — no margin. Same kill switch{dir === "CAD→USD" ? " + caps" : ""} as an approval.
                </p>
              </div>
            );
          })()}

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
                <span>{fxLabel(r)}</span>
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
