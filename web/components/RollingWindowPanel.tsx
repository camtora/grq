"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Live view of the agent's rolling 5-hour Max window. The Max plan resets on a 5h window that the
// agent's token can't read, so the owner anchors ONE reset time and this rolls it forward in 5h
// steps forever. Two bars side by side — tokens burned vs the time elapsed in the window — so you
// can see at a glance whether the agent is burning ahead of the clock. The small "drift" control
// only matters if Claude Code's real reset slides away from ours. Lives on /admin/usage.

const FIVE_H_MS = 5 * 60 * 60 * 1000;

function etLabel(ms: number): string {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Toronto",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(ms)) + " ET"
  );
}

function etClock(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

// Roll the anchor forward in 5h steps to the current window's reset (first step strictly after now).
function rollWindow(anchorMs: number, nowMs: number): { start: number; reset: number } {
  const steps = Math.ceil((nowMs - anchorMs) / FIVE_H_MS);
  let reset = anchorMs + steps * FIVE_H_MS;
  if (reset <= nowMs) reset += FIVE_H_MS;
  return { start: reset - FIVE_H_MS, reset };
}

function tokenBarColor(pct: number): string {
  return pct >= 90 ? "bg-red-400/70" : pct >= 70 ? "bg-amber-400/70" : "bg-teal-400/60";
}

export default function RollingWindowPanel({
  anchorAt,
  serverWindowStart,
  tokensBurned,
  maxFiveH,
}: {
  anchorAt: string | null;
  serverWindowStart: string | null;
  tokensBurned: number;
  maxFiveH: number | null;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The burn number is polled live (see below) so it tracks the current window instead of freezing
  // at the page's one-shot render value. Seed from the server prop, then the poll is authoritative.
  const [burn, setBurn] = useState(tokensBurned);
  const [liveServerStart, setLiveServerStart] = useState<string | null>(serverWindowStart);

  const anchorMs = anchorAt ? new Date(anchorAt).getTime() : null;
  const [time, setTime] = useState(() =>
    anchorMs !== null ? etClock(rollWindow(anchorMs, Date.now()).reset) : "",
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Poll the current window's burn so the token bar stays in lockstep with the live clock. The
  // endpoint computes the window from the same anchor, so the number and the bounds always agree.
  const fetchBurn = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/usage-window", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.tokensBurned === "number") setBurn(data.tokensBurned);
      if (typeof data.windowStart === "string" || data.windowStart === null) setLiveServerStart(data.windowStart);
    } catch {
      /* keep last good value */
    }
  }, []);

  useEffect(() => {
    const id = setInterval(fetchBurn, 20_000);
    return () => clearInterval(id);
  }, [fetchBurn]);

  const win = anchorMs !== null ? rollWindow(anchorMs, now) : null;
  const serverStartMs = liveServerStart ? new Date(liveServerStart).getTime() : null;

  // When the live clock rolls past the window the poll last reported, refetch the burn immediately
  // (so the new, near-empty window's number lands at once) and refresh the page so the rest of the
  // server-rendered stats re-sync too. Comparing against the live start avoids a refresh loop.
  useEffect(() => {
    if (win && serverStartMs !== null && win.start > serverStartMs) {
      fetchBurn();
      router.refresh();
    }
  }, [win?.start, serverStartMs, router, fetchBurn]);

  const timePct = win ? Math.min(100, Math.max(0, ((now - win.start) / FIVE_H_MS) * 100)) : null;
  const tokenPct = maxFiveH ? Math.min(100, Math.max(0, (burn / maxFiveH) * 100)) : null;
  const leftMs = win ? win.reset - now : null;

  // Pacing read: tokens ahead of the clock = burning faster than the window refills.
  const ahead = timePct !== null && tokenPct !== null ? tokenPct - timePct : null;

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/usage-window", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        setErr(data.error || `Failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-[color:var(--card-border)] bg-teal-400/5 p-4">
      {/* Two bars: token burn vs time elapsed, on the same 0–100 scale so you can read the gap. */}
      <div className="space-y-3">
        {/* Tokens */}
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider text-teal-200/50">Tokens</span>
            <span className="tabular-nums text-teal-200/60">
              {fmtTokens(burn)}
              {maxFiveH ? ` / ~${fmtTokens(maxFiveH)} est.` : ""}
              {tokenPct !== null ? ` · ${Math.round(tokenPct)}%` : ""}
            </span>
          </div>
          {tokenPct !== null ? (
            <div className="h-3 w-full overflow-hidden rounded-full bg-teal-400/10">
              <div
                className={`h-full rounded-full ${tokenBarColor(tokenPct)}`}
                style={{ width: `${tokenPct}%` }}
              />
            </div>
          ) : (
            <div className="text-[11px] text-teal-200/40">
              Set <code className="text-teal-200/50">GRQ_MAX_5H_TOKENS</code> to show a headroom bar.
            </div>
          )}
        </div>

        {/* Time elapsed in the window */}
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider text-teal-200/50">Time in window</span>
            <span className="tabular-nums text-teal-200/60">
              {win ? `${fmtLeft(leftMs as number)} left · ${Math.round(timePct as number)}%` : "anchor not set"}
            </span>
          </div>
          {win ? (
            <div className="h-3 w-full overflow-hidden rounded-full bg-sky-400/10">
              <div className="h-full rounded-full bg-sky-400/50" style={{ width: `${timePct}%` }} />
            </div>
          ) : (
            <div className="text-[11px] text-amber-300/60">
              Anchor the reset below to start the 5h clock.
            </div>
          )}
        </div>
      </div>

      {/* Pacing read-out: is burn ahead of, on, or behind the clock? */}
      {ahead !== null ? (
        <p className="mt-3 text-xs">
          {ahead > 10 ? (
            <span className="text-amber-300/80">
              Burning <span className="font-semibold tabular-nums">{Math.round(ahead)} pts</span> ahead of the clock
              — at this pace the budget runs out before the window resets.
            </span>
          ) : ahead < -10 ? (
            <span className="text-teal-200/70">
              Pacing <span className="font-semibold tabular-nums">{Math.round(-ahead)} pts</span> under the clock —
              comfortable headroom.
            </span>
          ) : (
            <span className="text-teal-200/50">Roughly on pace with the clock.</span>
          )}
        </p>
      ) : null}

      {/* Drift-correction control — only touch it if Claude Code's real reset slides from ours. */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[color:var(--card-border)] pt-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-teal-200/40">Window reset</span>
        {win ? (
          <span className="text-xs tabular-nums text-teal-200/60">
            auto-rolls · next <span className="font-semibold text-teal-100">{etLabel(win.reset)}</span>
          </span>
        ) : (
          <span className="text-xs text-amber-300/70">not set</span>
        )}
        <span className="grow" />
        <label className="text-xs text-teal-200/50">
          Drifted? Re-anchor (ET)
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="ml-2 rounded-md border border-[color:var(--card-border)] bg-[var(--card-bg)] px-2 py-1 text-xs text-teal-50 tabular-nums [color-scheme:dark]"
          />
        </label>
        <button
          onClick={() => time && post({ time })}
          disabled={busy || !time}
          className="rounded-md bg-teal-400/15 px-3 py-1 text-xs font-semibold text-teal-100 transition-colors hover:bg-teal-400/25 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Set"}
        </button>
        {anchorAt ? (
          <button
            onClick={() => post({ clear: true })}
            disabled={busy}
            className="rounded-md px-2 py-1 text-xs text-teal-200/50 transition-colors hover:bg-teal-400/10 hover:text-teal-100 disabled:opacity-40"
          >
            Clear
          </button>
        ) : null}
        {err ? <span className="text-xs text-red-300/80">{err}</span> : null}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-teal-200/35">
        The window rolls itself every 5 hours from this anchor — you only touch it if Claude Code&apos;s real reset
        drifts from ours. Enter the ET time Claude shows (e.g. &ldquo;resets 3:00 PM&rdquo;) and it re-anchors to the
        nearest occurrence.
      </p>
    </div>
  );
}
