"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  { href: "/market", label: "The Hunt", exact: true },
  { href: "/market/browse", label: "Browse" },
];
const SECONDARY: NavLink[] = [
  { href: "/reports", label: "Reports" },
  { href: "/race", label: "The Race" },
  { href: "/settings", label: "Settings" },
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
            {/* "How GRQ works" lives top-right on the Settings page (Cam 2026-06-25),
                not in the header. */}
            {/* Owner-only — usage/admin dashboard (Cam). Hidden for everyone else;
                the page itself enforces the owner gate, this is just the link. */}
            {isOwner && renderLink({ href: "/admin", label: "Admin" })}
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
          {/* Notification bell + messages sit between the broker badge and the
              avatar — members only (the drawer + feed routes are members-only). */}
          {isMember && (
            <div className="flex items-center gap-0.5">
              <NotificationBell />
              <MessageButton />
            </div>
          )}
          <Avatar src={photo} name={name} size="h-7 w-7" />
        </div>
      </div>
    </nav>
  );
}
