"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navigation for the stock section (Cam 2026-06-16): Watchlist (names you
// track — primary) · Universe (the tradeable set) · Discover (the agent's hunt +
// smart money) · Browse (whole-market screener). Research desk removed — notes now
// live per-stock on the stock page.
const TABS = [
  { href: "/market/watchlist", label: "Watchlist" },
  { href: "/universe", label: "Universe" },
  { href: "/market", label: "Discover" },
  { href: "/market/browse", label: "Browse" },
];

export default function MarketTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex flex-wrap gap-1 border-b border-teal-400/10 pb-3">
      {TABS.map((t) => {
        const active = t.href === "/market" ? pathname === "/market" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              active ? "bg-teal-400/15 text-teal-200" : "text-teal-200/60 hover:bg-teal-400/10 hover:text-teal-100"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
