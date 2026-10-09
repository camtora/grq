import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { allUniverse, classDash, pickCanonical, sameCompanyName } from "@/lib/universe";
import { allWatches } from "@/lib/watch";
import { sessionFromRequest } from "@/lib/session";
import { memberEmails } from "@/lib/users";

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
// `seenAt` is the most-recent page view of that stock (epoch ms, 0 if never), derived
// from the existing PageView usage log — it drives the recently-accessed ordering in the
// dropdown. Scoped by tier: members share theirs, everyone else gets only their own.

export type StockIndexItem = {
  symbol: string; // the canonical universe key → /stocks/<symbol>
  name: string;
  kind: "active" | "watching" | "retired" | "researched" | "screened";
  seenAt: number;
  watchers?: string[]; // member keys watching this name (GRQ Go's search rows)
};

const bareKey = (s: string) => classDash(s).replace(/\.(TO|V|NE|CN|US)$/i, "");

export async function GET(req: Request) {
  // Self-guard for the mobile Bearer path (GRQ Go's Search tab); the web door
  // already authenticated browser traffic, so this only 403s a no-identity hit.
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  const universe = await allUniverse();
  const byKey = new Map<string, Omit<StockIndexItem, "seenAt">>();

  // Live members by bare ticker — the only rows another spelling could resolve to.
  const liveByBare = new Map<string, typeof universe>();
  for (const r of universe) {
    if (r.status === "RETIRED") continue;
    const b = bareKey(r.symbol);
    liveByBare.set(b, [...(liveByBare.get(b) ?? []), r]);
  }

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
    // …or covers it under another spelling: old research filed as HPS.A / RY.TO belongs to
    // the member HPS-A / RY (the stock page redirects there), so listing it again just
    // offers the same company twice, once with no name.
    if (pickCanonical(liveByBare.get(bareKey(key)) ?? [], key)) continue;
    byKey.set(key, { symbol: key, name: j.companyName || key, kind: "researched" });
  }

  // The Market Base Layer — every screened (non-ETF) company we hold a first-pass
  // read on (docs/MARKET-BASE-LAYER.md), routed via the FMP-native symbol (CARR · RY.TO)
  // so CA listings resolve right.
  // A screened row is skipped only when it's the SAME COMPANY as something already listed —
  // the same listing, or a cross-listing of it (RY on the NYSE beside our RY.TO). Sharing a
  // bare ticker is not enough: NEO.TO and NASDAQ NEO are different companies, and de-duping
  // on the ticker hid whichever came second.
  const namesByBare = new Map<string, string[]>();
  for (const it of byKey.values()) {
    const b = bareKey(it.symbol);
    namesByBare.set(b, [...(namesByBare.get(b) ?? []), it.name]);
  }
  const screened = await prisma.marketScreen.findMany({ select: { symbol: true, ticker: true, name: true } });
  for (const m of screened) {
    const key = m.symbol.toUpperCase();
    if (byKey.has(key)) continue;
    const b = bareKey(m.symbol);
    const member = pickCanonical(liveByBare.get(b) ?? [], key);
    if (member) continue;
    const seen = namesByBare.get(b) ?? [];
    if (seen.some((n) => n === m.name || sameCompanyName(n, m.name))) continue;
    namesByBare.set(b, [...seen, m.name]);
    byKey.set(key, { symbol: m.symbol, name: m.name || m.symbol, kind: "screened" });
  }

  // Most-recent view per stock, by anyone — from the existing usage beacon.
  // WHOSE views: the members share one history (Cam and Graham see what either looked at).
  // Anyone else — a viewer, a user — sees only their own, and never feeds the members'
  // (Cam, 2026-10-08: users may use search, they may not shape ours or read it).
  const historyOf = session.role === "member" ? memberEmails() : [session.email];
  const views = await prisma.pageView.groupBy({
    by: ["path"],
    where: { path: { startsWith: "/stocks/" }, email: { in: historyOf } },
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

  // Who's watching, per symbol (D78) — powers the search rows' avatars + toggle.
  const watchMap = await allWatches();

  const stocks: StockIndexItem[] = [...byKey.values()]
    .map((it) => ({
      ...it,
      seenAt: seen.get(it.symbol.toUpperCase()) ?? 0,
      watchers: (watchMap.get(it.symbol) ?? []).map((w) => w.key),
    }))
    .sort((a, b) => b.seenAt - a.seenAt || a.symbol.localeCompare(b.symbol));

  return NextResponse.json({ stocks });
}
