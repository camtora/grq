"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Pending / stale-results manager for The Hunt. A briefed (or refreshed) hunt runs
// asynchronously on the agent and takes a minute or two; the runner clears its queued
// flag at the START of the run, so we can't trust that flag to know results are ready.
// Instead we ANCHOR on the newest "Hunt dossier" timestamp at submit time and poll
// /api/hunt/status until a newer one lands — then refresh the server-rendered feed.
//
// Triggers: a `grq-hunt-submitted` window event (fired by HuntBar/RefreshHuntButton on a
// successful queue), OR the server telling us a hunt is already queued (`pending`) when
// the page loads. The anchor lives in sessionStorage so a reload keeps watching. We give
// up after GIVE_UP_MS so a hunt that returns nothing doesn't poll forever.

const POLL_MS = 20_000;
const GIVE_UP_MS = 5 * 60_000;
const KEY = "grq-hunt-anchor";

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

function relTime(ms: number): string {
  const d = Math.round((Date.now() - ms) / 1000);
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function HuntStatus({
  pending,
  brief,
  latestFindAt,
  hasResults,
  children,
}: {
  pending: boolean; // server: a hunt is queued (huntRequestedAt set)
  brief: string | null;
  latestFindAt: string | null; // ISO of the newest find currently shown
  hasResults: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [flash, setFlash] = useState<"fresh" | "gaveup" | null>(null);
  const latestMs = latestFindAt ? Date.parse(latestFindAt) : null;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setWorking(false);
  }, []);

  const startWatching = useCallback(
    (anchorLatest: number | null) => {
      const existing = readAnchor();
      const anchor: Anchor = existing ?? { submittedAt: Date.now(), anchorLatest };
      writeAnchor(anchor);
      setWorking(true);
    },
    [],
  );

  // React to a fresh submit from the hunt bar / refresh button (same tab).
  useEffect(() => {
    const onSubmit = () => startWatching(latestMs);
    window.addEventListener("grq-hunt-submitted", onSubmit);
    return () => window.removeEventListener("grq-hunt-submitted", onSubmit);
  }, [startWatching, latestMs]);

  // On mount: resume a watch from a prior submit (reload), or start one if the server
  // says a hunt is already queued.
  useEffect(() => {
    if (readAnchor()) setWorking(true);
    else if (pending) startWatching(latestMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The poll loop, active only while watching.
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
        const r = await fetch("/api/hunt/status", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { latestFindAt: string | null };
        const newest = d.latestFindAt ? Date.parse(d.latestFindAt) : null;
        const landed = newest != null && (anchor.anchorLatest == null || newest > anchor.anchorLatest);
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

  // Auto-dismiss the success flash.
  useEffect(() => {
    if (flash !== "fresh") return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  const briefLine = brief ? (
    <>
      Hunting for <b className="text-teal-50">{brief}</b>
    </>
  ) : (
    <>Refreshing the hunt</>
  );

  return (
    <div>
      {working && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-teal-400/25 bg-teal-400/[0.06] px-4 py-3">
          <span
            className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-teal-300/30 border-t-teal-300 motion-reduce:animate-none"
            aria-hidden
          />
          <div className="text-sm text-teal-100/80">
            🔭 {briefLine} — new names land in a minute or two.{" "}
            {hasResults ? (
              <>
                The results below are from your{" "}
                {latestMs ? <span className="text-teal-200/60">previous run ({relTime(latestMs)})</span> : "previous run"}; this page is checking automatically.
              </>
            ) : (
              <>The first names will appear here automatically — no need to refresh.</>
            )}
          </div>
        </div>
      )}

      {flash === "fresh" && (
        <div className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] px-4 py-2.5 text-sm font-semibold text-emerald-300/90">
          ✓ Fresh finds in.
        </div>
      )}
      {flash === "gaveup" && (
        <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-2.5 text-sm text-amber-200/80">
          The hunt didn&apos;t return new names — try a broader brief, or hit ↻ refresh to go broad again.
        </div>
      )}

      {children}
    </div>
  );
}
