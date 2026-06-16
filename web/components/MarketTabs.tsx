"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navigation for the Market tab: Ideas (the agent's curated finds) ·
// Browse (the whole-market screener) · Research (the human + agent desk).
const TABS = [
  { href: "/market", label: "Ideas" },
  { href: "/market/browse", label: "Browse" },
  { href: "/market/watchlist", label: "Watchlist" },
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
