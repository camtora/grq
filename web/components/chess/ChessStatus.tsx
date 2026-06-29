"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Pending-board manager for Chess Moves (mirrors components/hunt/HuntStatus). A briefed
// board is mapped asynchronously on the agent (a minute or two). We anchor on the newest
// READY board's timestamp at submit time and poll /api/chess/status until a newer one
// lands — then refresh the server-rendered list. Triggers: a `grq-chess-submitted` window
// event (from ChessBar) OR the server saying a board is already in flight (`pending`).
const POLL_MS = 15_000;
const GIVE_UP_MS = 8 * 60_000;
const KEY = "grq-chess-anchor";

type Anchor = { submittedAt: number; anchorLatest: number | null };

function readAnchor(): Anchor | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Anchor) : null;
  } catch {
    return null;
  }
}
function writeAnchor(a: Anchor | null) {
  try {
    if (a) sessionStorage.setItem(KEY, JSON.stringify(a));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export default function ChessStatus({
  pending,
  latestReadyAt,
  children,
}: {
  pending: boolean; // server: a board is PENDING/RUNNING
  latestReadyAt: string | null; // ISO of the newest READY board currently shown
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [flash, setFlash] = useState<"fresh" | "gaveup" | null>(null);
  const latestMs = latestReadyAt ? Date.parse(latestReadyAt) : null;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setWorking(false);
  }, []);

  const startWatching = useCallback((anchorLatest: number | null) => {
    const existing = readAnchor();
    const anchor: Anchor = existing ?? { submittedAt: Date.now(), anchorLatest };
    writeAnchor(anchor);
    setWorking(true);
  }, []);

  useEffect(() => {
    const onSubmit = () => startWatching(latestMs);
    window.addEventListener("grq-chess-submitted", onSubmit);
    return () => window.removeEventListener("grq-chess-submitted", onSubmit);
  }, [startWatching, latestMs]);

  useEffect(() => {
    if (readAnchor()) setWorking(true);
    else if (pending) startWatching(latestMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!working) return;
    const tick = async () => {
      const anchor = readAnchor();
      if (!anchor) return stop();
      if (Date.now() - anchor.submittedAt > GIVE_UP_MS) {
        writeAnchor(null);
        stop();
        setFlash("gaveup");
        return;
      }
      try {
        const r = await fetch("/api/chess/status", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { pending: boolean; latestReadyAt: string | null };
        const newest = d.latestReadyAt ? Date.parse(d.latestReadyAt) : null;
        const landed = !d.pending && newest != null && (anchor.anchorLatest == null || newest > anchor.anchorLatest);
        if (landed) {
          writeAnchor(null);
          stop();
          setFlash("fresh");
          router.refresh();
        }
      } catch {
        /* transient — keep polling */
      }
    };
    void tick();
    timer.current = setInterval(tick, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [working, router, stop]);

  useEffect(() => {
    if (flash !== "fresh") return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <div>
      {working && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-teal-400/25 bg-teal-400/[0.06] px-4 py-3">
          <span className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-teal-300/30 border-t-teal-300 motion-reduce:animate-none" aria-hidden />
          <div className="text-sm text-teal-100/80">
            ♟ Mapping the board — Alfred is tracing the chain and the ripple plays. It lands here automatically in a minute or two; no need to refresh.
          </div>
        </div>
      )}
      {flash === "fresh" && (
        <div className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] px-4 py-2.5 text-sm font-semibold text-emerald-300/90">
          ✓ The board is in.
        </div>
      )}
      {flash === "gaveup" && (
        <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-2.5 text-sm text-amber-200/80">
          Still working, or the board didn&apos;t come together — check back shortly.
        </div>
      )}
      {children}
    </div>
  );
}
