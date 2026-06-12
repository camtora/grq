"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/stocks", label: "Stocks" },
  { href: "/activity", label: "Activity" },
  { href: "/journal", label: "Journal" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export default function NavBar({
  name,
  killSwitch,
  broker,
  theme,
}: {
  name: string;
  killSwitch: boolean;
  broker: string;
  theme: "light" | "dark";
}) {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-10 border-b border-teal-400/10 bg-(--nav-bg) backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="bg-gradient-to-r from-teal-300 to-teal-500 bg-clip-text text-xl font-black tracking-tight text-transparent">
            GRQ
          </span>
        </Link>
        <div className="flex flex-wrap items-center gap-1">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
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
          })}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <Link
            href="/chat"
            className={`rounded-lg px-2.5 py-1 text-sm font-semibold transition-colors ${
              pathname.startsWith("/chat")
                ? "bg-teal-400/15 text-teal-200"
                : "text-teal-300 hover:bg-teal-400/10"
            }`}
          >
            💬 Chat
          </Link>
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
