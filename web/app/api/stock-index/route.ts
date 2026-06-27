import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { allUniverse } from "@/lib/universe";

export const dynamic = "force-dynamic";

// The deterministic jump-to-stock index for the header search bar. Unlike
// /api/symbol-search (which spends FMP quota to scan the whole market for the
// Browse add-flow), this returns ONLY names we already cover — anything we hold
// information on: the universe (ACTIVE + CANDIDATE/watching), retired history,
// and researched-but-untracked hunt finds — so the client can filter locally for
// an instant autocomplete. DB-only, no quota. Open to any allowlisted user
// (members + viewers); the door already authenticated, and every stock page
// these point at is viewer-readable anyway.
//
// `seenAt` is the most-recent page view of that stock BY ANYONE (epoch ms, 0 if
// never), derived from the existing PageView usage log — it drives the
// recently-accessed ordering in the dropdown.

export type StockIndexItem = {
  symbol: string; // the canonical universe key → /stocks/<symbol>
  name: string;
  kind: "active" | "watching" | "retired" | "researched" | "screened";
  seenAt: number;
};

const bareKey = (s: string) => s.trim().toUpperCase().replace(/\.(TO|V|NE|CN|US)$/i, "");

export async function GET() {
  const universe = await allUniverse();
  const byKey = new Map<string, Omit<StockIndexItem, "seenAt">>();

  for (const r of universe) {
    byKey.set(r.symbol.toUpperCase(), {
      symbol: r.symbol,
      name: r.name || r.symbol,
      kind: r.status === "ACTIVE" ? "active" : r.status === "RETIRED" ? "retired" : "watching",
    });
  }

  // Researched-but-untracked finds (e.g. a discovery-hunt name never promoted to
  // a universe row). The stock page synthesises these from the journal, so
  // they're navigable. Latest entry per symbol wins for the name.
  const researched = await prisma.journalEntry.findMany({
    where: { kind: "RESEARCH", symbol: { not: null } },
    select: { symbol: true, companyName: true },
    distinct: ["symbol"],
    orderBy: { at: "desc" },
  });
  for (const j of researched) {
    const key = (j.symbol ?? "").toUpperCase();
    if (!key || byKey.has(key)) continue; // a universe row already covers it
    byKey.set(key, { symbol: key, name: j.companyName || key, kind: "researched" });
  }

  // The Market Base Layer — every screened (non-ETF) company we hold a first-pass
  // read on (docs/MARKET-BASE-LAYER.md). Deduped by BARE ticker so a screened row
  // never doubles a universe/researched name (which use their own symbol form).
  // Routed via the FMP-native symbol (CARR · RY.TO) so CA listings resolve right.
  const haveBare = new Set([...byKey.keys()].map(bareKey));
  const screened = await prisma.marketScreen.findMany({ select: { symbol: true, ticker: true, name: true } });
  for (const m of screened) {
    if (haveBare.has(m.ticker)) continue; // already covered, or a cross-exchange dup
    haveBare.add(m.ticker);
    byKey.set(m.symbol.toUpperCase(), { symbol: m.symbol, name: m.name || m.symbol, kind: "screened" });
  }

  // Most-recent view per stock, by anyone — from the existing usage beacon.
  const views = await prisma.pageView.groupBy({
    by: ["path"],
    where: { path: { startsWith: "/stocks/" } },
    _max: { at: true },
  });
  const seen = new Map<string, number>();
  for (const v of views) {
    let sym = v.path.slice("/stocks/".length).split("/")[0];
    try {
      sym = decodeURIComponent(sym);
    } catch {
      /* leave the raw segment if it isn't valid percent-encoding */
    }
    sym = sym.toUpperCase();
    const ms = v._max.at?.getTime() ?? 0;
    if (sym && ms > (seen.get(sym) ?? 0)) seen.set(sym, ms);
  }

  const stocks: StockIndexItem[] = [...byKey.values()]
    .map((it) => ({ ...it, seenAt: seen.get(it.symbol.toUpperCase()) ?? 0 }))
    .sort((a, b) => b.seenAt - a.seenAt || a.symbol.localeCompare(b.symbol));

  return NextResponse.json({ stocks });
}
