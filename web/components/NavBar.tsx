"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import KillSwitch from "./KillSwitch";
import Avatar from "./Avatar";
import NotificationBell from "./NotificationBell";
import MessageButton from "./MessageButton";

// The market destinations sit directly in the header — no sub-navigation
// (Cam 2026-06-16). `exact` pins The Hunt to exactly /market so it doesn't light
// up on /market/watchlist or /market/browse.
// Reports + Settings sit on the right of the nav with the status cluster.
type NavLink = { href: string; label: string; match?: string[]; exact?: boolean };
const PRIMARY: NavLink[] = [
  { href: "/", label: "Today" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/market/watchlist", label: "Watchlist" },
  { href: "/market/smart-money", label: "Smart Money" },
  { href: "/universe", label: "Universe" },
  { href: "/market/browse", label: "Browse" },
  { href: "/options", label: "Options" },
];
const SECONDARY: NavLink[] = [{ href: "/reports", label: "Reports" }];
// The model bake-offs / sandboxes live under one "Experiments" dropdown (Cam & Graham, 2026-06-27).
// The Hunt moved in here too (Cam 2026-06-29) — it's an exploratory feed, not core nav.
const EXPERIMENTS: NavLink[] = [
  { href: "/market", label: "The Hunt", exact: true },
  { href: "/race", label: "Second Opinions" },
  { href: "/bulls", label: "Bull Race" },
  { href: "/options-desk", label: "Options Desk" },
  { href: "/short-lab", label: "Short Lab" },
  { href: "/chess", label: "Chess Moves" },
  { href: "/report-card", label: "Report Card" },
];

export default function NavBar({
  name,
  photo = null,
  killSwitch,
  killSwitchBy = null,
  broker,
  theme,
  isMember = true,
  isOwner = false,
}: {
  name: string;
  photo?: string | null;
  killSwitch: boolean;
  killSwitchBy?: string | null;
  broker: string;
  theme: "light" | "dark";
  isMember?: boolean;
  isOwner?: boolean;
}) {
  const pathname = usePathname();
  const [expOpen, setExpOpen] = useState(false);
  const expActive = EXPERIMENTS.some((l) => (l.exact ? pathname === l.href : pathname.startsWith(l.href)));
  const renderLink = (l: NavLink) => {
    const active = l.exact
      ? pathname === l.href
      : l.href === "/"
        ? pathname === "/"
        : (l.match ?? [l.href]).some((p) => pathname.startsWith(p));
    return (
      <Link
        key={l.href}
        href={l.href}
        className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
          active
            ? "bg-teal-400/15 font-semibold text-teal-200"
            : "text-teal-200/60 hover:bg-teal-400/10 hover:text-teal-100"
        }`}
      >
        {l.label}
      </Link>
    );
  };
  return (
    <nav className="sticky top-0 z-10 border-b border-teal-400/10 bg-(--nav-bg) backdrop-blur">
      <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3">
        <Link href="/" className="flex items-center" aria-label="GRQ — Get Rich Quick">
          {/* Light mode: the original dark-text logo (reads on light); dark mode: the recolored one. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme === "light" ? "/grq-logo-light.png" : "/grq-logo.png"} alt="GRQ — Get Rich Quick" className="h-7 w-auto" />
        </Link>
        <div className="flex flex-wrap items-center gap-1">{PRIMARY.map(renderLink)}</div>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            {SECONDARY.map(renderLink)}
            {/* Experiments dropdown — the model bake-offs / sandboxes (Race · Bulls · Options Desk). */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setExpOpen((v) => !v)}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  expActive || expOpen ? "bg-teal-400/15 font-semibold text-teal-200" : "text-teal-200/60 hover:bg-teal-400/10 hover:text-teal-100"
                }`}
                aria-haspopup="menu"
                aria-expanded={expOpen}
              >
                Experiments
                <span className={`text-[9px] transition-transform ${expOpen ? "rotate-180" : ""}`}>▼</span>
              </button>
              {expOpen && (
                <>
                  <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setExpOpen(false)} tabIndex={-1} />
                  <div className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-lg border border-teal-400/15 bg-(--nav-bg) p-1 shadow-lg backdrop-blur" role="menu">
                    {EXPERIMENTS.map((l) => {
                      const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
                      return (
                        <Link
                          key={l.href}
                          href={l.href}
                          role="menuitem"
                          onClick={() => setExpOpen(false)}
                          className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${active ? "bg-teal-400/15 font-semibold text-teal-200" : "text-teal-200/70 hover:bg-teal-400/10 hover:text-teal-100"}`}
                        >
                          {l.label}
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
          {!isMember && (
            <span
              className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 font-bold uppercase tracking-wider text-amber-300/80"
              title="You have read-only access to this fund"
            >
              read-only
            </span>
          )}
          {/* Halt-trading control sits before the broker badge (Cam 2026-06-18). */}
          <KillSwitch compact engaged={killSwitch} engagedBy={killSwitchBy} canToggle={isMember} />
          <span className="rounded-full border border-teal-400/20 bg-teal-400/10 px-2 py-0.5 font-bold uppercase tracking-wider text-teal-300">
            {broker}
          </span>
          {/* Notification bell + messages + the owner Settings gear sit between the
              broker badge and the avatar, in one evenly-spaced icon cluster. Bell +
              messages are members-only; the gear is owner-only. */}
          {(isMember || isOwner) && (
            <div className="flex items-center gap-0.5">
              {isMember && <NotificationBell />}
              {isMember && <MessageButton />}
              {isOwner && (
                <Link
                  href="/settings"
                  title="Settings"
                  aria-label="Settings"
                  className={`rounded-lg p-1.5 transition-colors ${
                    pathname.startsWith("/settings")
                      ? "bg-teal-400/15 text-teal-200"
                      : "text-teal-200/70 hover:bg-teal-400/10 hover:text-teal-100"
                  }`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </Link>
              )}
            </div>
          )}
          {/* The avatar is the door to the member's personal Accounts page
              (read-only external holdings). Members only. */}
          {isMember ? (
            <Link
              href="/accounts"
              title="Your accounts"
              aria-label="Your accounts"
              className={`rounded-full transition ${
                pathname.startsWith("/accounts")
                  ? "ring-2 ring-teal-400/60"
                  : "ring-1 ring-transparent hover:ring-teal-400/40"
              }`}
            >
              <Avatar src={photo} name={name} size="h-7 w-7" />
            </Link>
          ) : (
            <Avatar src={photo} name={name} size="h-7 w-7" />
          )}
        </div>
      </div>
    </nav>
  );
}
