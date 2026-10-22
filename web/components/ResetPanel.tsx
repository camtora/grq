"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ResetStatus } from "@/lib/reset-run";

// Settings → Reset rehearsal (D138, 2026-10-22). The runbook as buttons, in order, with the live
// state beside each step: 1 pause Alfred · 2 sell the book flat (tagged) · 3 engage the kill
// switch · then Cam's portal reset over the weekend and Monday's re-fund. The order is enforced server-side
// (lib/reset.ts flattenRefusal); the buttons only show what is next. Members only; a viewer reads.

const fmtEt = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const money = (cents: number, ccy: "CAD" | "USD") => `${ccy === "USD" ? "US$" : "C$"}${(cents / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Step({ n, done, active, title, children }: { n: number; done: boolean; active: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className={`flex gap-3 rounded-xl border p-3 ${active ? "border-amber-400/40 bg-amber-400/[0.06]" : done ? "border-teal-400/10 bg-teal-400/[0.02]" : "border-teal-400/10"}`}>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-teal-400 text-teal-950" : active ? "border border-amber-400 text-amber-300" : "border border-teal-400/30 text-teal-200/60"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <div className={`font-semibold ${done ? "text-teal-200/50 line-through" : "text-teal-50"}`}>{title}</div>
        <div className="mt-1 text-xs text-teal-100/75">{children}</div>
      </div>
    </li>
  );
}

export default function ResetPanel({ initial, readOnly }: { initial: ResetStatus; readOnly: boolean }) {
  const router = useRouter();
  const [st, setSt] = useState<ResetStatus>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");

  const running = !!st.job && st.job.finishedAt === null;
  const flat = st.positions.length === 0;
  const soldToday = st.resetFillsToday.length;

  async function refresh() {
    try {
      const r = await fetch("/api/reset/status", { cache: "no-store" });
      if (r.ok) setSt(await r.json());
    } catch {
      /* keep the last state */
    }
  }
  useEffect(() => {
    if (!running) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [running]);

  async function post(url: string, body: unknown, label: string) {
    setBusy(label);
    setErr(null);
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      await refresh();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const step1Done = st.pause.paused;
  const step2Done = flat && (soldToday > 0 || st.pause.paused);
  const step3Done = st.killSwitch && flat;
  const active = !step1Done ? 1 : !step2Done ? 2 : !step3Done ? 3 : 4;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-bold uppercase tracking-wider text-amber-300">Reset rehearsal — Fri Oct 23 → Mon Oct 26</div>
        <span className="text-[11px] text-teal-200/40">D138 · sell flat Friday, the paper account is reset to US$50,000 over the weekend, Monday Oct 26 is day 1</span>
      </div>
      <p className="mb-3 text-xs text-teal-100/75">
        The runbook, in order. Each button does one step and the next lights up. Nothing here touches the guardrails: the sells are
        ordinary market orders through the gate, placed by you and tagged so Alfred never reads them as his own exits.
      </p>
      <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
        <span className={`rounded-lg border px-2 py-0.5 ${st.pause.paused ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-teal-400/20 text-teal-200/60"}`}>
          Alfred {st.pause.paused ? `paused${st.pause.until ? ` until ${fmtEt(st.pause.until)}` : ""}` : "on duty"}
        </span>
        <span className={`rounded-lg border px-2 py-0.5 ${st.killSwitch ? "border-red-400/40 bg-red-400/10 text-red-300" : "border-teal-400/20 text-teal-200/60"}`}>
          Kill switch {st.killSwitch ? `ON${st.killSwitchBy ? ` (${st.killSwitchBy})` : ""}` : "off"}
        </span>
        <span className="rounded-lg border border-teal-400/20 px-2 py-0.5 text-teal-200/60">
          {st.positions.length} position{st.positions.length === 1 ? "" : "s"} held · cash {money(st.cash.cadCents, "CAD")} + {money(st.cash.usdCents, "USD")}
        </span>
        <span className="rounded-lg border border-teal-400/20 px-2 py-0.5 text-teal-200/60">market {st.marketOpen ? "open" : "closed"}</span>
      </div>
      <ol className="space-y-2">
        <Step n={1} done={step1Done} active={active === 1} title="Pause Alfred">
          No Claude session until Monday morning or until lifted: no check-in can trade into the sells. Press it any time on Friday before the sells; the earlier steps are not needed on Thursday. The tick keeps running (quotes,
          reconcile, fills, the safety stops). Chat will say he is out of quota while paused; that wording is fixed in the next agent build.
          {!readOnly && (
            <div className="mt-2">
              {st.pause.paused ? (
                st.pause.isReset ? (
                  <button type="button" disabled={!!busy} onClick={() => post("/api/reset/pause", { paused: false }, "lift")} className="rounded-lg border border-teal-400/30 px-2.5 py-1 text-xs text-teal-100 hover:bg-teal-400/10 disabled:opacity-50">
                    {busy === "lift" ? "…" : "Lift the pause"}
                  </button>
                ) : (
                  <span className="text-amber-300">Paused for a Claude-limit reason, not the reset — that counts as paused for the flatten.</span>
                )
              ) : (
                <button type="button" disabled={!!busy} onClick={() => post("/api/reset/pause", { paused: true }, "pause")} className="rounded-lg border border-amber-400/40 bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-400/25 disabled:opacity-50">
                  {busy === "pause" ? "…" : "Pause Alfred"}
                </button>
              )}
            </div>
          )}
        </Step>
        <Step n={2} done={step2Done} active={active === 2} title={`Sell the book flat — ${st.positions.length} market sell${st.positions.length === 1 ? "" : "s"}, tagged`}>
          Any time Friday between 9:30 and 16:00 ET, one click; you can walk away. One name at a time, about 20 seconds each, this panel follows along and Discord gets one message at the end. Every sell is placed by you, tagged &quot;reset&quot;, and gets a
          system note so no session grades it. The kill switch must be OFF for this step (it blocks your orders too) and the market open.
          {st.positions.length > 0 && (
            <div className="mt-1 text-[11px] text-teal-200/50">{st.positions.map((p) => `${p.symbol} ${p.qty}`).join(" · ")}</div>
          )}
          {st.job && (
            <div className="mt-2 rounded-lg border border-teal-400/10 bg-black/20 p-2 text-[11px]">
              <div className="text-teal-200/60">
                Started {fmtEt(st.job.startedAt)} by {st.job.by} · {st.job.steps.filter((s) => s.ok).length} of {st.job.total} sold
                {st.job.finishedAt ? ` · finished ${fmtEt(st.job.finishedAt)}` : " · running…"}
                {st.job.error ? ` · error: ${st.job.error}` : ""}
              </div>
              <ul className="mt-1 space-y-0.5">
                {st.job.steps.map((s, i) => (
                  <li key={i} className={s.ok ? "text-teal-100" : "text-red-300"}>
                    {s.ok ? `SOLD ${s.qty} ${s.symbol}${s.fillPriceCents ? ` @ ${(s.fillPriceCents / 100).toFixed(2)}` : " (fill pending)"}` : `✗ ${s.symbol}: ${s.reason}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!readOnly && !flat && !running && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder='type SELL EVERYTHING'
                className="w-48 rounded-lg border border-teal-400/15 bg-black/20 px-2 py-1 text-xs text-teal-50 placeholder:text-teal-200/30 focus:border-teal-400/50 focus:outline-none"
              />
              <button
                type="button"
                disabled={!!busy || confirm !== "SELL EVERYTHING" || !!st.canFlatten}
                title={st.canFlatten ?? "Sell every position at market, tagged reset"}
                onClick={() => post("/api/reset/flatten", { confirm }, "flatten")}
                className="rounded-lg border border-red-400/40 bg-red-400/15 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-400/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "flatten" ? "…" : "Sell the book flat"}
              </button>
              {st.canFlatten && <span className="text-amber-300">{st.canFlatten}</span>}
            </div>
          )}
        </Step>
        <Step n={3} done={step3Done} active={active === 3} title="Engage the kill switch">
          After the last sell: nothing trades, nothing converts, until Monday&apos;s re-fund. The kill switch button at the top of this page
          does it; this one is the same switch.
          {!readOnly && !st.killSwitch && flat && (
            <div className="mt-2">
              <button type="button" disabled={!!busy} onClick={() => post("/api/killswitch", { engaged: true }, "kill")} className="rounded-lg border border-red-400/40 bg-red-400/15 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-400/25 disabled:opacity-50">
                {busy === "kill" ? "…" : "Engage the kill switch"}
              </button>
            </div>
          )}
        </Step>
        <Step n={4} done={false} active={active === 4} title="Friday after the close, or over the weekend: Cam resets the balance in the IBKR portal">
          Typed in CAD at Friday&apos;s rate so it equals US$50,000. Cash changes at once; the overnight cycle completes it with a flat book, so
          nothing is wiped and nothing trips the drawdown guard.
        </Step>
        <Step n={5} done={false} active={false} title="Monday before the open: re-fund, rebaseline, day 1">
          Kill switch off for the member-approved FX (CAD → US$50,000), the rebaseline script, the new inception date, stale agenda and
          focus cleared, the boot-scan marker; verify (all cash, contributions = NAV, no exits on the track record); lift the pause. The
          9:00 plan on Monday Oct 26 is day 1.
        </Step>
      </ol>
      {err && <div className="mt-2 text-xs text-red-300">{err}</div>}
    </div>
  );
}
