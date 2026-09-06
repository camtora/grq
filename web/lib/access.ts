// The GRQ USER tier's map of the site (D122, Cam 2026-09-06 — Jose & Dave). A user
// (lib/users.ts GRQ_USER_EMAILS) is an outside learner: non-trading, and never shown the
// fund's book. This list is DENY-BY-DEFAULT — middleware admits a user ONLY to what's
// here, so a page or route added later sits behind the door until someone puts it on
// this list on purpose. That is the whole point: the class of leak "new page forgot to
// gate the book" can't happen, because a user can't reach a page nobody listed.
//
// Match is by path SEGMENT (`/options` admits `/options/x` but not `/options-desk`), so
// siblings are listed explicitly.
//
// In: the research + education surface — Today (minus the fund's day and holdings), the
// Hunt, Browse, Smart Money, Watchlist, Universe (minus positions), the stock pages (minus
// the position, fills, and decision trail), Learn (minus receipts), the labs and bake-offs
// (minus the real-fund reference line), Chess Moves, the Report Card.
// Out, on purpose: Portfolio, Reports, the journal, Accounts, Settings / Traffic / Tokens /
// How-it-works / admin, Alfred's chat (his tools read the book), Second Opinions (the
// champion's calls are the fund's actual orders), and every API that serves the book or
// takes a write. The pages that ARE in gate their book fragments with session.seesBook() —
// that's the per-page half; this file is the door half.
//
// And one thing the door can't do, which every admitted page does itself: Alfred writes ALL
// his prose with the book in hand — dossiers say "we own it (~C$56 avg, 1.5% underwater)",
// universe notes say "fills the axis the book lacks", agent notes carry order numbers and
// NAV shares (measured 2026-09-06: 14 of 18 held names' dossiers narrate the position). So
// for a user his free text about names is the book too: pages show his NUMBERS (call,
// confidence, targets, heat, signals) and never his WRITE-UPS (bottom lines, theses, notes,
// the record, the smart-money read, chess takes).
export const USER_PAGES: readonly string[] = [
  "/",
  "/learn",
  "/market", // the Hunt + /market/browse, /market/smart-money, /market/watchlist
  "/universe",
  "/stocks",
  "/options",
  "/options-desk",
  "/short-lab",
  "/day-lab",
  "/bulls",
  // NOT /race: Second Opinions scores the champion's calls, and "the champion's call is the
  // order it actually places" — the day pages list the fund's real BUY/SELL rows.
  "/chess",
  "/report-card",
  // Legacy redirect stubs that land on pages above (ideas→market, research→watchlist, …).
  "/ideas",
  "/research",
  "/today",
  "/chat",
];

// Only what the pages above actually fetch from the browser. Nothing here serves the
// book, and nothing here writes (every write route guards with memberFromRequest anyway).
export const USER_APIS: readonly string[] = [
  "/api/quotes",
  "/api/intraday",
  "/api/stock-extras",
  "/api/stock-index",
  "/api/indices",
  "/api/explain", // term-only prompt, no fund context (agent/chat-server.ts handleExplain)
  "/api/track",
  "/api/options/chain",
  "/api/hunt/status",
  "/api/chess/status",
  "/api/learn/svg",
];

// Files served out of /public (logos, the bull watermark, faces) — a file, not a page. Never
// applied to /api/*, so a dotted API path (/api/dossier/BB.TO) can't slip through as an asset.
const ASSET_EXT = /\.(png|svg|jpe?g|webp|gif|ico|txt|xml|json|webmanifest|woff2?)$/i;

function underAny(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => path === p || (p !== "/" && path.startsWith(p + "/")));
}

/** May a USER-tier session reach this pathname? (Members and viewers never consult this.) */
export function userTierAllows(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return underAny(pathname, USER_APIS);
  if (ASSET_EXT.test(pathname)) return true;
  return underAny(pathname, USER_PAGES);
}
