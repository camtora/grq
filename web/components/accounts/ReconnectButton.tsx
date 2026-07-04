"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// One-tap fix for a broken SnapTrade link — and it CAPTURES the outcome (Cam 2026-07-03:
// the old full-page redirect was fire-and-forget; the portal's "reconnecting… up to 60s"
// screen can hang without ever resolving, so nothing visibly happened). Now:
//   1. Open the Connection Portal in a POPUP (reconnect=<authorizationId> → straight into
//      that broker's re-auth). Popup blocked → fall back to full-page navigation.
//   2. Listen for the portal's postMessage result (SUCCESS / ERROR events).
//   3. AND poll /api/external/status (the LIVE authorization flag) every 15s — SnapTrade's
//      TD re-auth job often outlives the portal UI, so the flip is the honest signal.
// First signal wins: sync + refresh on success, plain-English state on failure/timeout.
// TD caveat (SnapTrade's own portal copy): TD links go inactive within 24–48h by design,
// so this button is a recurring chore, not a one-off repair.

type Phase = "idle" | "opening" | "waiting" | "done" | "stuck" | "error";

const POLL_MS = 15_000;
const GIVE_UP_MS = 4 * 60_000; // past this the job is stuck — send them to the dashboard

export default function ReconnectButton({ authorizationId }: { authorizationId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const timersRef = useRef<{ poll?: ReturnType<typeof setInterval>; giveUp?: ReturnType<typeof setTimeout> }>({});
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  const clearTimers = () => {
    if (timersRef.current.poll) clearInterval(timersRef.current.poll);
    if (timersRef.current.giveUp) clearTimeout(timersRef.current.giveUp);
    timersRef.current = {};
  };

  const succeed = async () => {
    if (phaseRef.current === "done") return;
    clearTimers();
    setPhase("done");
    setMsg(null);
    try { popupRef.current?.close(); } catch { /* cross-origin close can throw */ }
    // Pull fresh holdings now that the link is live (also flips our disabled flag
    // + fires the "reconnected" note), then re-render the page.
    await fetch("/api/external/sync", { method: "POST" }).catch(() => {});
    router.refresh();
  };

  const fail = (m: string, terminal: Phase = "error") => {
    if (phaseRef.current === "done") return;
    clearTimers();
    setPhase(terminal);
    setMsg(m);
  };

  // The portal posts its result to the opener (SUCCESS / ERROR / CLOSED). Accept
  // only SnapTrade origins; shapes vary (bare string or {status}), so match loosely.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (phaseRef.current !== "waiting") return;
      let host = "";
      try { host = new URL(e.origin).hostname; } catch { return; }
      if (!/(^|\.)snaptrade\.com$/.test(host)) return;
      const raw = typeof e.data === "string" ? e.data : JSON.stringify(e.data ?? "");
      if (/success/i.test(raw)) void succeed();
      else if (/error|abandon/i.test(raw)) fail("SnapTrade reported the reconnect failed — try again, or fix it in their dashboard.");
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkFlip = async () => {
    try {
      const r = await fetch("/api/external/status");
      if (!r.ok) return;
      const data = (await r.json()) as { connections?: { id: string; disabled: boolean }[] };
      const mine = data.connections?.find((c) => c.id === authorizationId);
      if (mine && !mine.disabled) void succeed();
    } catch {
      /* transient — next poll */
    }
  };

  async function reconnect() {
    setMsg(null);
    setPhase("opening");
    try {
      const r = await fetch("/api/external/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reconnect: authorizationId }),
      });
      const data = await r.json();
      if (!r.ok || !data.url) throw new Error(data.error ?? "Couldn't start the reconnect.");

      const popup = window.open(data.url, "grq-snaptrade-reconnect", "popup,width=480,height=760");
      if (!popup) {
        // Popup blocked — the old full-page flow still works; the nightly/mount sync catches the flip.
        window.location.href = data.url;
        return;
      }
      popupRef.current = popup;
      setPhase("waiting");
      timersRef.current.poll = setInterval(checkFlip, POLL_MS);
      timersRef.current.giveUp = setTimeout(
        () =>
          fail(
            "SnapTrade's TD re-login is stuck (their job, not this page). Fix it from their dashboard — we'll spot the fix automatically.",
            "stuck",
          ),
        GIVE_UP_MS,
      );
    } catch (e) {
      fail(e instanceof Error ? e.message : "Couldn't start the reconnect.");
    }
  }

  if (phase === "done") {
    return <span className="text-xs font-semibold text-emerald-400">Reconnected ✓ syncing…</span>;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={reconnect}
        disabled={phase === "opening" || phase === "waiting"}
        className="rounded-lg border border-red-400/40 bg-red-400/10 px-2.5 py-1 text-xs font-semibold text-red-200 transition hover:bg-red-400/20 disabled:opacity-40"
      >
        {phase === "opening" ? "Opening…" : phase === "waiting" ? "Waiting on SnapTrade…" : "⚡ Reconnect"}
      </button>
      {phase === "waiting" && (
        <span className="text-[11px] text-teal-200/50">
          finish in the popup — TD can take a minute; this flips green by itself
        </span>
      )}
      {msg && (
        <span className="text-[11px] text-red-300/80">
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
