"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// The header bell — the web notification center (D63). Polls /api/notifications
// for the caller's feed + unread count; opening the dropdown marks everything read.
// Rows with a symbol deep-link to the dossier. Members-only (mounted by NavBar).

type Notif = {
  id: number;
  at: string;
  category: string;
  severity: "info" | "warning" | "critical" | string;
  title: string;
  body: string;
  symbol: string | null;
  panel: string | null;
  read: boolean;
};

const POLL_MS = 30_000;

// A short glyph + label per category — enough to scan the feed at a glance.
const CATEGORY: Record<string, { icon: string; label: string }> = {
  trades: { icon: "💵", label: "Trade" },
  risk: { icon: "🛑", label: "Risk" },
  fx: { icon: "💱", label: "FX" },
  dossiers: { icon: "📄", label: "Dossier" },
  hunt: { icon: "🎯", label: "The Hunt" },
  agentMoves: { icon: "🤖", label: "Agent" },
  reports: { icon: "📰", label: "Report" },
  members: { icon: "👥", label: "Member" },
  system: { icon: "⚙️", label: "System" },
  priceTargets: { icon: "🔔", label: "Price alert" },
};

function meta(category: string) {
  return CATEGORY[category] ?? { icon: "•", label: category };
}

// Severity → the left accent dot colour. info = teal (house default).
function dotColor(severity: string): string {
  if (severity === "critical") return "bg-red-400";
  if (severity === "warning") return "bg-amber-400";
  return "bg-teal-400";
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      if (Array.isArray(d.notifications)) setItems(d.notifications);
      if (typeof d.unread === "number") setUnread(d.unread);
      setLoaded(true);
    } catch {
      /* offline / transient — keep the last good state */
    }
  }, []);

  // Poll the badge while closed; pause polling while the panel is open.
  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (!open) load();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load, open]);

  // Close on outside-click and Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      await load();
      if (unread > 0) {
        setUnread(0);
        setItems((xs) => xs.map((n) => ({ ...n, read: true })));
        fetch("/api/notifications/read", { method: "POST" }).catch(() => {});
      }
    }
  }

  return (
    <div ref={wrapRef} className="relative flex items-center">
      <button
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        className="relative rounded-lg p-1.5 text-teal-200/70 transition-colors hover:bg-teal-400/10 hover:text-teal-100"
      >
        {/* Bell */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-400 px-1 text-[10px] font-bold leading-none text-slate-900">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-teal-400/20 shadow-2xl"
          style={{ background: "var(--body-bg)" }}
        >
          <div className="flex items-center justify-between border-b border-teal-400/15 px-4 py-2.5">
            <span className="text-sm font-semibold text-teal-50">Notifications</span>
            <span className="text-[10px] uppercase tracking-wider text-teal-200/40">fund &amp; agent activity</span>
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {!loaded ? (
              <p className="px-4 py-8 text-center text-sm text-teal-200/40">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-teal-200/40">
                Nothing yet. Trades, reports, hunt finds, and risk alerts land here.
              </p>
            ) : (
              <ul className="divide-y divide-teal-400/10">
                {items.map((n) => {
                  const m = meta(n.category);
                  const row = (
                    <div className="flex gap-3 px-4 py-3 transition-colors hover:bg-teal-400/[0.06]">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor(n.severity)} ${n.read ? "opacity-30" : ""}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs" aria-hidden>{m.icon}</span>
                          <span className="truncate text-sm font-semibold text-teal-50">{n.title}</span>
                          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-teal-200/40">{timeAgo(n.at)}</span>
                        </div>
                        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-teal-200/55">{n.body}</p>}
                        <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-teal-200/35">
                          <span>{m.label}</span>
                          {n.symbol && <span className="text-teal-300/60">{n.symbol}</span>}
                        </div>
                      </div>
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.symbol ? (
                        <Link href={`/stocks/${n.symbol}`} onClick={() => setOpen(false)} className="block">
                          {row}
                        </Link>
                      ) : (
                        row
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Link
            href="/settings#notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-teal-400/15 px-4 py-2.5 text-center text-xs font-semibold text-teal-300 transition-colors hover:bg-teal-400/10"
          >
            Notification settings →
          </Link>
        </div>
      )}
    </div>
  );
}
