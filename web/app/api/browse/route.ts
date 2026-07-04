import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionFromRequest } from "@/lib/session";
import { fmpEnabled, fmpScreener, fmpSearch, fmpProfile, stripSuffix, type ScreenerRow } from "@/lib/fmp";
import { topScreened } from "@/lib/market-screen/screen";
import { allUniverse, bareTicker } from "@/lib/universe";
import { watchedByMember, watchersFor } from "@/lib/watch";
import { fmpLogo } from "@/lib/logos";

// GET /api/browse — GRQ Go's Browse, now the web page's FULL feature set
// (web/app/market/browse/page.tsx): ?q= name/ticker search (fmpSearch+fmpProfile),
// ?exchange/?sector/?country/?cap filters over the Market Base Layer screen
// (topScreened, live-FMP fallback), and per-row enrichment — Alfred's real call
// for tracked names vs the Haiku triage tag, the technical signal, who's watching
// (members + the fund), the caller's own watch flag, and the research state.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CAPS: Record<string, { more?: number; less?: number }> = {
  mega: { more: 200e9 },
  large: { more: 10e9, less: 200e9 },
  mid: { more: 2e9, less: 10e9 },
  small: { more: 300e6, less: 2e9 },
  micro: { less: 300e6 },
};

type BrowseRow = ScreenerRow & { screenScore?: number | null; tag?: string | null; take?: string | null; signal?: string | null };

async function searchRows(q: string): Promise<ScreenerRow[]> {
  const matches = (await fmpSearch(q)).slice(0, 10);
  const profiles = await Promise.all(matches.map((m) => fmpProfile(m.symbol).catch(() => null)));
  return matches.map((m, i) => {
    const p = profiles[i];
    return {
      symbol: m.symbol,
      name: m.name,
      priceCents: p?.priceCents ?? null,
      marketCapM: p?.marketCap ? Math.round(p.marketCap / 1_000_000) : null,
      sector: p?.sector ?? null,
      exchange: m.exchange || p?.exchange || null,
      country: p?.country ?? null,
      currency: m.currency || p?.currency || null,
      isEtf: false,
    };
  });
}

function matchesFilters(
  r: ScreenerRow,
  exchange: string,
  sector: string,
  country: string,
  cap?: { more?: number; less?: number },
): boolean {
  if (exchange && r.exchange !== exchange) return false;
  if (sector && r.sector !== sector) return false;
  if (country && r.country !== country) return false;
  if (cap) {
    const c = r.marketCapM ? r.marketCapM * 1_000_000 : null;
    if (c == null) return false;
    if (cap.more && c < cap.more) return false;
    if (cap.less && c >= cap.less) return false;
  }
  return true;
}

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  const isMember = session.role === "member";

  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim();
  const exchange = sp.get("exchange") ?? "";
  const sector = sp.get("sector") ?? "";
  const country = sp.get("country") ?? "";
  const capDef = CAPS[sp.get("cap") ?? ""];

  let rows: BrowseRow[] = [];
  if (!fmpEnabled()) {
    return NextResponse.json({ rows: [], total: 0, note: "Market browsing needs the FMP key." });
  } else if (q) {
    rows = (await searchRows(q)).filter((r) => matchesFilters(r, exchange, sector, country, capDef));
  } else {
    const screened = await topScreened({
      exchange: exchange || undefined,
      sector: sector || undefined,
      country: country || undefined,
      capMinM: capDef?.more != null ? capDef.more / 1e6 : undefined,
      capMaxM: capDef?.less != null ? capDef.less / 1e6 : undefined,
      limit: 60,
    });
    rows = screened.length
      ? screened.map((s) => ({
          symbol: s.symbol, name: s.name, priceCents: s.priceCents, marketCapM: s.marketCapM,
          sector: s.sector, exchange: s.exchange, country: s.country, currency: s.currency,
          isEtf: false, screenScore: s.screenScore, tag: s.tag, take: s.take, signal: s.signal,
        }))
      : await fmpScreener({
          exchange: exchange || undefined,
          sector: sector || undefined,
          country: country || undefined,
          marketCapMoreThan: capDef?.more,
          marketCapLowerThan: capDef?.less,
          limit: 60,
        });
  }

  // ---- Row enrichment (the web page's joins, wire-shaped) ----
  const universe = await allUniverse();
  const entryBy = new Map(universe.map((u) => [u.symbol.toUpperCase(), u]));
  const uOf = (sym: string) => entryBy.get(stripSuffix(sym).toUpperCase());
  const [watchersMap, myWatched] = await Promise.all([
    watchersFor(universe.map((u) => u.symbol)),
    isMember ? watchedByMember(session.email) : Promise.resolve(new Set<string>()),
  ]);

  const keys = [...new Set(rows.map((r) => bareTicker(r.symbol).toUpperCase()))];
  const [dossierRows, inflightRows, stanceRows] = keys.length
    ? await Promise.all([
        prisma.journalEntry.findMany({
          where: {
            kind: "RESEARCH",
            symbol: { in: keys },
            OR: [{ title: { startsWith: "Dossier" } }, { title: { startsWith: "Hunt dossier" } }],
          },
          select: { symbol: true },
        }),
        prisma.researchRequest.findMany({
          where: { symbol: { in: keys }, status: { in: ["QUEUED", "RUNNING"] } },
          select: { symbol: true },
        }),
        prisma.journalEntry.findMany({
          where: { stance: { not: null }, symbol: { in: keys } },
          orderBy: { at: "desc" },
          select: { symbol: true, stance: true },
        }),
      ])
    : [[], [], []];
  const hasDossier = new Set(dossierRows.map((d) => d.symbol));
  const inFlight = new Set(inflightRows.map((r) => r.symbol));
  const stanceByKey = new Map<string, string>();
  for (const s of stanceRows) {
    const k = (s.symbol ?? "").toUpperCase();
    if (k && s.stance && !stanceByKey.has(k)) stanceByKey.set(k, s.stance);
  }

  return NextResponse.json({
    rows: rows.map((r) => {
      const u = uOf(r.symbol);
      const tracked = !!u && u.status !== "RETIRED";
      const bare = bareTicker(r.symbol).toUpperCase();
      return {
        symbol: r.symbol,
        bare, // the dossier/research/stock-page key
        name: r.name,
        exchange: r.exchange,
        sector: r.sector,
        country: r.country ?? null,
        marketCapM: r.marketCapM,
        priceCents: r.priceCents,
        currency: r.currency,
        screenScore: r.screenScore ?? null,
        tag: r.tag ?? null,
        take: r.take ?? null,
        signal: r.signal ?? null,
        // Tracked name → Alfred's REAL dossier call; untracked keeps the Haiku tag.
        call: tracked ? (stanceByKey.get(bare) ?? null) : null,
        logoUrl: (tracked ? u!.logoUrl : null) || fmpLogo(r.symbol),
        agentTracks: tracked, // the fund follows it (universe/watchlist)
        watchers: tracked ? (watchersMap.get(u!.symbol) ?? []).map((w) => w.key) : [],
        myWatch: tracked ? myWatched.has(u!.symbol.toUpperCase()) : false,
        research: hasDossier.has(bare) ? "done" : inFlight.has(bare) ? "inflight" : "none",
      };
    }),
    total: await prisma.marketScreen.count(),
  });
}
