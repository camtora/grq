"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// "Refresh from broker" — the FREE way to force fresh holdings on the SnapTrade free tier.
// SnapTrade's paid manual-refresh (refreshBrokerageAuthorization) 402s on our Personal keys,
// but re-running the Connection Portal (a fresh broker LOGIN) makes SnapTrade re-pull
// everything from the broker on (re)connection — no charge. So this button opens the SAME
// reconnect portal the ⚡ Reconnect button uses, then watches SnapTrade's holdings-pull
// timestamp (`syncMs`) advance to confirm the pull actually LANDED — the healthy-link
// analogue of ⚡ Reconnect's disabled→enabled flip. Cost to the member: one broker re-login
// (~1 min). (Cam 2026-07-06 — his idea: point the resync button at the reconnect endpoint.)

type Phase = "idle" | "opening" | "waiting" | "done" | "stuck" | "error";

const POLL_MS = 12_000;
const GIVE_UP_MS = 4 * 60_000; // past this, the re-login didn't yield a fresh pull

export default function RefreshFromBrokerButton({
  authorizationId,
  baselineSyncedAt,
}: {
  authorizationId: string;
  baselineSyncedAt: string; // our mirror's last sync — fallback baseline if the live read fails
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const baselineRef = useRef<number>(0); // SnapTrade pull time BEFORE the re-login — success = past this
  const timersRef = useRef<{ poll?: ReturnType<typeof setInterval>; giveUp?: ReturnType<typeof setTimeout> }>({});
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  const clearTimers = () => {
    if (timersRef.current.poll) clearInterval(timersRef.current.poll);
    if (timersRef.current.giveUp) clearTimeout(timersRef.current.giveUp);
    timersRef.current = {};
  };
  useEffect(() => () => clearTimers(), []);

  const succeed = async () => {
    if (phaseRef.current === "done") return;
    clearTimers();
    setPhase("done");
    setMsg(null);
    try { popupRef.current?.close(); } catch { /* cross-origin close can throw */ }
    // The fresh pull is in SnapTrade's cache now — mirror it into our DB and re-render.
    await fetch("/api/external/sync", { method: "POST" }).catch(() => {});
    router.refresh();
  };

  const fail = (m: string, terminal: Phase = "error") => {
    if (phaseRef.current === "done") return;
    clearTimers();
    setPhase(terminal);
    setMsg(m);
  };

  // Live holdings-pull time for THIS authorization (0 if unknown, null if the read failed).
  async function liveSyncMs(): Promise<number | null> {
    try {
      const r = await fetch("/api/external/status");
      if (!r.ok) return null;
      const data = (await r.json()) as { connections?: { id: string; syncMs?: number }[] };
      const mine = data.connections?.find((c) => c.id === authorizationId);
      return mine ? (mine.syncMs ?? 0) : null;
    } catch {
      return null;
    }
  }

  const checkFresh = async () => {
    const now = await liveSyncMs();
    if (now != null && now > baselineRef.current) void succeed();
  };

  // The portal posts SUCCESS/ERROR. A SUCCESS only means the re-auth completed — the PULL is
  // async — so we confirm via `syncMs`, treating only ERROR/abandon as terminal.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (phaseRef.current !== "waiting") return;
      let host = "";
      try { host = new URL(e.origin).hostname; } catch { return; }
      if (!/(^|\.)snaptrade\.com$/.test(host)) return;
      const raw = typeof e.data === "string" ? e.data : JSON.stringify(e.data ?? "");
      if (/error|abandon/i.test(raw)) fail("SnapTrade reported the login failed — try again, or fix it in their dashboard.");
      else if (/success/i.test(raw)) void checkFresh(); // nudge a poll; a fresh syncMs is the real signal
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setMsg(null);
    setPhase("opening");
    // Baseline = the CURRENT live pull time so only a genuinely NEW pull counts as success
    // (falls back to our mirror's last sync if the live read fails).
    const live = await liveSyncMs();
    baselineRef.current = live ?? (Date.parse(baselineSyncedAt) || 0);
    try {
      const r = await fetch("/api/external/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reconnect: authorizationId }),
      });
      const data = await r.json();
      if (!r.ok || !data.url) throw new Error(data.error ?? "Couldn't start the refresh.");

      const popup = window.open(data.url, "grq-snaptrade-refresh", "popup,width=480,height=760");
      if (!popup) {
        window.location.href = data.url; // popup blocked — full-page; the mount sync catches the pull
        return;
      }
      popupRef.current = popup;
      setPhase("waiting");
      timersRef.current.poll = setInterval(checkFresh, POLL_MS);
      timersRef.current.giveUp = setTimeout(
        () =>
          fail(
            "Re-logged in, but no fresh pull landed yet — SnapTrade's free plan may not re-pull a healthy link on demand. It'll still refresh on the daily sync.",
            "stuck",
          ),
        GIVE_UP_MS,
      );
    } catch (e) {
      fail(e instanceof Error ? e.message : "Couldn't start the refresh.");
    }
  }

  if (phase === "done") {
    return <span className="text-xs font-semibold text-emerald-400">Fresh pull ✓ syncing…</span>;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={refresh}
        disabled={phase === "opening" || phase === "waiting"}
        className="rounded-lg border border-teal-400/50 bg-teal-400/15 px-2.5 py-1 text-xs font-semibold text-teal-100 transition hover:bg-teal-400/25 disabled:opacity-40"
        title="Re-login to your broker to pull right-now holdings (free). Use after you trade — takes about a minute."
      >
        {phase === "opening" ? "Opening…" : phase === "waiting" ? "Waiting on broker…" : "⟳ Refresh from broker"}
      </button>
      {phase === "waiting" && (
        <span className="text-[11px] text-teal-200/50">
          finish the login in the popup — this confirms itself when fresh holdings land
        </span>
      )}
      {msg && (
        <span className={`text-[11px] ${phase === "error" ? "text-red-300/80" : "text-amber-300/80"}`}>
          {msg}{" "}
          <a
            href="https://dashboard.snaptrade.com/home?personal"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-300 underline"
          >
            SnapTrade dashboard ↗
          </a>
        </span>
      )}
    </span>
  );
}
