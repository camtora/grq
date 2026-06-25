"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import Term from "@/components/Term";
import PriceChart from "@/components/PriceChart";
import { money, signedMoney } from "@/lib/money";

// "The Tape" — the day's NAV on a FIXED 9:30→16:00 axis, so the line + "now" dot sit at
// their real clock-time and creep rightward into empty space as the session goes on
// (Cam 2026-06-25). Seeded from the Today page's SSR, then — for the live "today" view —
// polls /api/nav-tape every 15s while the market's open so it advances without a reload.
// Archived days pass live={false}: same fixed axis, no polling.

type Pt = { t: number; c: number };

type Props = {
  initialPoints: Pt[];
  navCents: number;
  dayOpenNavCents: number;
  benchmarkCents: number | null;
  windowStart: number; // 9:30 ET, epoch ms
  windowEnd: number; // 16:00 ET, epoch ms
  marketOpen: boolean; // is the market open right now (gates polling)
  hasPositions: boolean;
  live: boolean; // the live "today" view (poll forward) vs an archived day (static)
};

function dayClass(cents: number): string {
  return cents > 0 ? "text-emerald-400" : cents < 0 ? "text-red-400" : "text-teal-200/50";
}

export default function LiveTape({
  initialPoints,
  navCents,
  dayOpenNavCents,
  benchmarkCents,
  windowStart,
  windowEnd,
  marketOpen,
  hasPositions,
  live,
}: Props) {
  const [points, setPoints] = useState<Pt[]>(initialPoints);
  const [nav, setNav] = useState(navCents);
  const [bench, setBench] = useState<number | null>(benchmarkCents);
  const [hasPos, setHasPos] = useState(hasPositions);

  useEffect(() => {
    if (!live || !marketOpen) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
    const tick = async () => {
      try {
        const r = await fetch("/api/nav-tape", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (!alive) return;
        if (Array.isArray(d.points)) setPoints(d.points);
        if (typeof d.navCents === "number") setNav(d.navCents);
        setBench(typeof d.benchmarkCents === "number" ? d.benchmarkCents : null);
        if (typeof d.hasPositions === "boolean") setHasPos(d.hasPositions);
        if (d.marketOpen === false) stop(); // market closed mid-session — stop polling
      } catch {
        /* transient — keep the last good tape */
      }
    };
    tick(); // refresh once on mount so the dot is current without waiting a full interval
    timer = setInterval(tick, 15_000);
    return stop;
  }, [live, marketOpen]);

  const dayPnl = nav - dayOpenNavCents;

  return (
    <Card className="mb-6 p-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-teal-200/50">
          <Term k="the-tape">The Tape</Term> · the day&apos;s NAV
        </span>
        <span className="text-xs text-teal-200/40">
          opened {money(dayOpenNavCents)} → {live ? "now" : "close"} {money(nav)}{" "}
          <span className={dayClass(dayPnl)}>({signedMoney(dayPnl)})</span>
          {bench !== null && (
            <>
              {" · "}
              <Term k="vs-xic" align="right">
                vs XIC
              </Term>{" "}
              <span className={dayClass(nav - bench)}>{signedMoney(nav - bench)}</span>
            </>
          )}
        </span>
      </div>
      {points.length >= 2 ? (
        <PriceChart
          mode="intraday"
          label="NAV"
          data={points}
          currency="CAD"
          windowStart={windowStart}
          windowEnd={windowEnd}
          bare
        />
      ) : hasPos ? (
        <p className="py-4 text-sm text-teal-200/40">
          Quiet tape — not enough NAV snapshots yet today; it fills in as the agent ticks through the session.
        </p>
      ) : (
        <p className="py-4 text-sm text-teal-200/40">
          Flat line — the fund&apos;s parked in cash. The tape comes alive the day the agent takes a position.
        </p>
      )}
    </Card>
  );
}
