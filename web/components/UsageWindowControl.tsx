"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Owner control for the manual 5-hour usage-window reset time. The Max plan's rolling window
// slides with usage and the agent's token can't read it, so the owner sets when the current
// window resets (ET clock time) and this shows a live countdown to it. Lives on /admin/usage.

function etClock(iso: string): string {
  // "15:00" for the <input type=time> default (24h, ET).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function etLabel(iso: string): string {
  // "3:00 PM ET" for display.
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Toronto",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso)) + " ET"
  );
}

function fmtLeft(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function UsageWindowControl({ resetAt }: { resetAt: string | null }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [time, setTime] = useState(() => (resetAt ? etClock(resetAt) : ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const resetMs = resetAt ? new Date(resetAt).getTime() : null;
  const leftMs = resetMs !== null ? resetMs - now : null;
  const expired = leftMs !== null && leftMs <= 0;

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
    <div className="mt-4 rounded-lg border border-[color:var(--card-border)] bg-teal-400/5 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-teal-200/50">Window reset</span>
        {resetAt ? (
          <span className="text-xs tabular-nums text-teal-200/60">
            {expired ? (
              <span className="text-amber-300/80">reset time passed — set the next one</span>
            ) : (
              <>
                <span className="font-semibold text-teal-100">{fmtLeft(leftMs as number)} left</span>
                <span className="text-teal-200/40"> · resets {etLabel(resetAt)}</span>
              </>
            )}
          </span>
        ) : (
          <span className="text-xs text-teal-200/40">not set</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-xs text-teal-200/50">
          Resets at (ET)
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
        {resetAt ? (
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
        The Max 5-hour window slides with usage and isn&apos;t readable from the agent&apos;s token — set it from what
        Claude Code shows (e.g. &ldquo;resets 3:00 PM&rdquo;). Takes the next occurrence of that ET time.
      </p>
    </div>
  );
}
