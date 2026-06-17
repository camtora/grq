"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

// The market destinations sit directly in the header — no sub-navigation
// (Cam 2026-06-16). `exact` pins The Hunt to exactly /market so it doesn't light
// up on /market/watchlist or /market/browse.
// Reports + Settings sit on the right of the nav with the status cluster.
type NavLink = { href: string; label: string; match?: string[]; exact?: boolean };
const PRIMARY: NavLink[] = [
  { href: "/", label: "Overview" },
  { href: "/today", label: "Today" },
  { href: "/market/watchlist", label: "Watchlist" },
  { href: "/universe", label: "Universe" },
  { href: "/market", label: "The Hunt", exact: true },
  { href: "/market/browse", label: "Browse" },
  { href: "/market/smart-money", label: "Smart Money" },
];
const SECONDARY: NavLink[] = [
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export default function NavBar({
  name,
  killSwitch,
  broker,
  theme,
  isMember = true,
}: {
  name: string;
  killSwitch: boolean;
  broker: string;
  theme: "light" | "dark";
  isMember?: boolean;
}) {
  const pathname = usePathname();
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
        <Link href="/" className="flex items-baseline gap-2">
          <span className="bg-gradient-to-r from-teal-300 to-teal-500 bg-clip-text text-xl font-black tracking-tight text-transparent">
            GRQ
          </span>
        </Link>
        <div className="flex flex-wrap items-center gap-1">{PRIMARY.map(renderLink)}</div>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">{SECONDARY.map(renderLink)}</div>
          {isMember && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("grq:chat"))}
              className="rounded-lg px-2.5 py-1 text-sm font-semibold text-teal-300 transition-colors hover:bg-teal-400/10"
            >
              Chat
            </button>
          )}
          {!isMember && (
            <span
              className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 font-bold uppercase tracking-wider text-amber-300/80"
              title="You have read-only access to this fund"
            >
              read-only
            </span>
          )}
          <span className="rounded-full border border-teal-400/20 bg-teal-400/10 px-2 py-0.5 font-bold uppercase tracking-wider text-teal-300">
            {broker}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 font-semibold ${
              killSwitch ? "text-red-400" : "text-teal-200/50"
            }`}
            title={killSwitch ? "Kill switch engaged — trading halted" : "Trading permitted"}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                killSwitch ? "animate-pulse bg-red-400" : "bg-teal-400/60"
              }`}
            />
            {killSwitch ? "HALTED" : "OK"}
          </span>
          <span className="text-teal-200/40">{name}</span>
          <ThemeToggle current={theme} />
        </div>
      </div>
    </nav>
  );
}
