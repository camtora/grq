import { NextRequest, NextResponse } from "next/server";
import { roleForEmail } from "./lib/users";
import { userTierAllows } from "./lib/access";

// nginx + oauth2-proxy authenticate the Google account upstream and pass the
// identity in X-Forwarded-Email. oauth2-proxy already rejects anyone not in the
// infra allowlist at login, so a valid header == an allowlisted user. GRQ then
// keeps a CLOSED list of its own (lib/users.ts roleForEmail): members act, viewers
// read, USERS (D122) read the research/education surface only — deny-by-default
// through lib/access.ts — and everyone else (even SSO-authed) is refused here. A
// header-less hit (direct LAN, no SSO) has no identity → 403.
const DENIED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GRQ</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#060d0c;color:#e7f5f2;font-family:system-ui,sans-serif">
<div style="text-align:center;max-width:28rem;padding:2rem">
<div style="font-size:2.75rem;font-weight:900;background:linear-gradient(90deg,#5eead4,#14b8a6);-webkit-background-clip:text;background-clip:text;color:transparent">GRQ</div>
<p style="margin-top:1.5rem;font-size:1.1rem">Sign in to view this fund.</p>
<p style="margin-top:.5rem;color:#8fbfb6;font-size:.9rem">No identity on this request — reach GRQ through the front door.</p>
</div></body></html>`;

// A GRQ user (D122) asking for a members-only page — the book. Same voice as the door
// above; says what's off-limits and why, and points back at what's theirs.
const MEMBERS_ONLY_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GRQ</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#060d0c;color:#e7f5f2;font-family:system-ui,sans-serif">
<div style="text-align:center;max-width:28rem;padding:2rem">
<div style="font-size:2.75rem;font-weight:900;background:linear-gradient(90deg,#5eead4,#14b8a6);-webkit-background-clip:text;background-clip:text;color:transparent">GRQ</div>
<p style="margin-top:1.5rem;font-size:1.1rem">This part of GRQ is for fund members.</p>
<p style="margin-top:.5rem;color:#8fbfb6;font-size:.9rem">The book — positions, reports, the desk — stays with the people whose money it is. The research, the market, and Learn are all yours.</p>
<p style="margin-top:1.25rem"><a href="/" style="color:#5eead4;text-decoration:none;font-weight:600">← back to Today</a></p>
</div></body></html>`;

// Mobile-app API surface (docs/IOS-PLAN.md + IOS-REBUILD-PLAN.md). The native app
// authenticates with a GRQ-JWT Bearer token, not the oauth2-proxy cookie, so these
// routes can't pass the cookie door — they self-guard in the Node runtime via
// lib/session.ts (which verifies the token) + memberFromRequest for any writes. We
// only let the edge admit them; no token is checked here (no Edge-runtime JWT).
// Listed explicitly so anything NOT here (explain, quotes) stays cookie-only.
const MOBILE_API = [
  // Reads (self-guard via sessionFromRequest — viewers may read).
  "/api/portfolio",
  "/api/market",
  "/api/ideas",
  "/api/today",
  "/api/dossier",
  "/api/fund-settings",
  "/api/hunt",            // GET feed (A1) + POST /api/hunt/refresh (member, A9)
  "/api/wire",            // GET The Wire — the discovery feed (prototype)
  "/api/smart-money",     // A3
  "/api/chess",           // Chess Moves boards: GET list + GET [id] + POST brief/research/status (guards in-route)
  "/api/race",            // Second Opinions — shadow-model scorecard (read)
  "/api/bulls",           // Bull Race — each model's paper book (read)
  "/api/desk",            // Options Desk sandbox (read)
  "/api/short-lab",       // The Short Lab: GET book + member ops (open/cover/mark/reset in-route)
  "/api/short-desk",      // The Short Lab agent A/B: GET + member start/pause/reset (in-route)
  "/api/day-lab",         // The Day-Trading Lab: GET + member ops (start/buy/sell/flatten/mark/reset in-route)
  "/api/report-card",     // Report Card — how the calls did (read)
  "/api/accounts",        // personal/external accounts (SnapTrade — TD TFSA etc.); members-only in-route
  "/api/reports",         // A10 (list + /day/[date])
  "/api/stock-extras",    // A7 (lazy earnings/grades)
  "/api/symbol-search",   // A7 (Browse; member-guarded in-route)
  "/api/watchlist",       // GRQ Go — the watch-driven list (D78 semantics)
  "/api/stock-index",     // GRQ Go — the jump-to-stock index (Search tab; self-guards)
  "/api/briefings",       // GRQ Go — Alfred's desk printouts (Portfolio; self-guards)
  "/api/browse",          // GRQ Go — the Market Base Layer screen (More ▸ Browse; self-guards)
  "/api/intraday",        // GRQ Go — the 1D chart line (self-guards; 60s server cache)
  "/api/quotes",          // live FMP ticker for the app's price overlay (self-guards via sessionFromRequest)
  "/api/logo-meta",       // white-logo chip verdicts for the app (RN has no canvas; self-guards)
  "/api/how-it-works",    // About GRQ — the operating manual + decision log (owner-guarded in-route)
  "/api/traffic",         // Traffic dashboard for the app (owner-guarded in-route)
  "/api/tokens",          // Token-usage dashboard for the app (owner-guarded in-route)
  "/api/track",           // the usage beacon — the app logs screen views like the web does (self-guards)
  "/api/learn",           // the Learn portal's live-fund receipts blocks (self-guards)
  // Member writes (self-guard via memberFromRequest; the order gate still disposes).
  "/api/chat",            // A8 (GET history + POST SSE; members-only in-route)
  "/api/messages",        // D61 member-to-member DMs/shares (GET thread/unread, POST send/read)
  "/api/killswitch",
  "/api/settings",         // risk dial set (POST, members-only in-route)
  "/api/fx",               // D62 FX-approval: GET state + POST convert/approve/reject (members-only in-route)
  "/api/universe",
  "/api/external/connect", // SnapTrade reconnect from the phone (member-guarded in-route; D107 parity)
  "/api/external/status",  // the reconnect poller's LIVE connection-health read
  "/api/external/sync",    // pull fresh holdings once the re-auth lands
  "/api/external/keys",    // self-serve SnapTrade connect from the phone (member-guarded, self-only)
  "/api/external/disconnect", // unlink from the phone (member-guarded, self-only)
  "/api/stocks/directive",
  "/api/stocks/share",    // member shares a stock with the other member (push)
  "/api/note",
  "/api/notes",
  "/api/notifications",   // device-token register + per-user push prefs (D53)
];

function isMobileApi(path: string): boolean {
  return MOBILE_API.some((p) => path === p || path.startsWith(p + "/"));
}

export function middleware(req: NextRequest) {
  const email =
    req.headers.get("x-forwarded-email") ??
    (process.env.NODE_ENV !== "production" ? (process.env.GRQ_DEV_EMAIL ?? null) : null);

  const role = roleForEmail(email);
  if (!role) {
    const path = req.nextUrl.pathname;
    // Auth routes (login + me) are public at the edge and self-guard. Other mobile
    // read routes need a Bearer present (the route verifies it); without one, the
    // request is a browser hitting the door → the 403 page.
    const hasBearer = req.headers.get("authorization")?.toLowerCase().startsWith("bearer ");
    if (path.startsWith("/api/auth/") || (hasBearer && isMobileApi(path))) {
      return NextResponse.next();
    }
    return new NextResponse(DENIED_HTML, {
      status: 403,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // The USER tier (D122) is deny-by-default: a user reaches only the paths lib/access.ts
  // lists — the research/education surface — never the book. This edge check IS the lock
  // for browser traffic (not cosmetic): the pages it admits gate their own book fragments,
  // and a user can't hold a GRQ-JWT (auth/google + auth/dev are members-only), so there is
  // no Bearer path around it.
  if (role === "user" && !userTierAllows(req.nextUrl.pathname)) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Members only." }, { status: 403 });
    }
    return new NextResponse(MEMBERS_ONLY_HTML, {
      status: 403,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return NextResponse.next();
}

export const config = {
  // /api/health stays open: the port is LAN-only and house monitoring probes it.
  matcher: ["/((?!api/health|_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
