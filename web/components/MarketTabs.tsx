"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navigation for the stock section, in Graham's priority order (2026-06-16):
// Watchlist (names you track — primary) · Discoveries (the agent's curated finds,
// was "Ideas") · Research (your OWN notes desk) · Browse (whole-market screener) ·
// Universe (the tradeable set the agent invests in — kept behind the scenes, last).
const TABS = [
  { href: "/market/watchlist", label: "Watchlist" },
  { href: "/market", label: "Discoveries" },
  { href: "/market/research", label: "Research" },
  { href: "/market/browse", label: "Browse" },
  { href: "/universe", label: "Universe" },
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
