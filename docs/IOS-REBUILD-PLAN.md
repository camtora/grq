# GRQ iOS — Rebuild Plan (the app catches up to the web)

**Author:** Claude · **Date:** 2026-06-18 · **Scope:** `ios/` only (a second agent owns `web/`).
**Companion docs:** `IOS-PLAN.md` (auth/architecture framework — still valid), `IOS-CONTENT.md`
(per-screen words — needs an update for the new IA), `IOS-BUILD-LOG.md`.

> **Status (2026-06-19):** client P0–P5 built; **Appendix A backend shipped + deployed**; the
> **nginx Bearer-skips-SSO edge fix is live** (D42) — so hunt/smart-money/reports/chat/writes
> all reach the app for a real JWT, verified by the 302→403 fake-Bearer flip. The teal-bull
> **app icon** + the **top-right chat button** are in. **Remaining: a Mac build** to compile +
> archive (Linux can't), and **Apple PLA + distribution cert** for TestFlight. The Hunt feed
> works on the *existing* installed build (server-side fix); the icon + chat button need the rebuild.

## Why

The iOS app was built ~2026-06-16 against **IA-v2** (tabs: Today · Watchlist · Portfolio · Ideas ·
Settings; the retired 7-*word* `AgentCall`; mock member actions). Since then the web app changed
*dramatically* (IA-v5):

- **The Hunt** is now the heart of the product — a feed of under-the-radar leads (obscurity-scored,
  conviction %, 12-mo upside), two-way *directed* via a plain-English brief.
- **Smart Money** — tracked 13F portfolios, Congress/fund/insider leaderboards, cluster buys.
- **Chat** — a read-only agent you can ask anything (streaming, per-member threads, symbol-scoped).
- **The 7-point rating scale** (`Strong Buy → Strong Sell`, `lib/stance.ts`) replaced the old call words.
- **Rich stock dossiers** — logo, live quote, RatingBar with bull/bear mascots, signals, targets,
  analyst consensus, bottom line, source scoreboard, fundamentals, smart-money, earnings, news, peers.
- **New branding** — real logo (`grq-logo*.png`), bull/bear mascots (`*-splash.png`), member photos.
- **Universe and Watchlist split** into separate destinations; **Browse** screener; **Reports**.

The mandate: a **full rebuild within reason**. Keep the solid engine (Keychain JWT auth, `APIClient`,
the Theme/`Term`/glossary/Content layers, integer-cents money formatting). Rebuild the *surface* and
*extend the data layer* so the app is a faithful, clean, mobile-native expression of today's GRQ —
**centered on The Hunt** ("a scrollable Instagram of stocks"), the rest behaving like the web app.

---

## The gap (current iOS ↔ current web)

| Area | iOS today | Web today | Action |
|---|---|---|---|
| Tabs / IA | Today · Watchlist · Portfolio · Ideas · Settings | Today · Portfolio · Watchlist · Smart Money · Universe · The Hunt · Browse · Reports · Settings · Chat | **Re-IA** around 5 tabs + hub + global chat |
| The Hunt | ❌ none (old "Ideas" list) | the centerpiece feed | **Build** (P1) |
| Rating | old `AgentCall` (buy/accumulate/…) | 7-point `Stance` + RatingBar + mascots | **Replace** (P0) |
| Smart Money | ❌ | full destination + per-stock | **Build** (P3) |
| Chat | ❌ | streaming, per-member, symbol-scoped | **Build** (P4) |
| Stock dossier | basic (body + targets + fundamentals nulled) | logo, live quote, RatingBar, scoreboard, smart-money, earnings, news, peers | **Rebuild** (P3) |
| Branding | text "GRQ" gradient | logo asset + mascots + photos | **Rebrand** (P0) |
| Markdown | raw `Text(bodyMarkdown)` | rendered + collapsible | **Add** `MarkdownText`/`CollapsibleMd` (P0) |
| Member actions | mock (local only) | real, guarded | **Wire** behind Face ID (P5) |
| Universe/Watchlist | combined screen | split + directives/promote/demote | **Split + wire** (P3/P5) |
| Reports | ❌ | list + per-day report | **Build** (P6) |
| Today indices strip | ❌ | live `/api/indices` | **Add** (P2) |

**What we keep as-is (the engine):** `Keychain`, `AuthManager`, `APIClient` (real `URLSession` GETs,
Bearer), `GoogleAuth` seam, `Theme`/palette (from `shared/tokens.json`), `Term`/`GlossarySheet`,
`Content`/`Strings` (reads `shared/content/`), `Fmt` money formatting, `Card`/`StatCard`/`Chip`/`Pnl`/
`BpsBadge`/`TapeChart`/`Sparkline`. The splash (dollar rain → wealth-aware greeting) stays, rebranded.

---

## Target information architecture

A **5-tab bar with The Hunt dead center** (the star), a **Markets hub** that folds the four market
destinations behind one tab, and **Chat as a global affordance** (top-right on every screen, like web).

```
┌──────────────────────────────────────────────────────────┐
│  Today      Fund       ✦ HUNT ✦      Markets      More     │
│ newspaper  briefcase   the feed     chart.bar    ellipsis  │
└──────────────────────────────────────────────────────────┘
                 every screen: ⌕ search · 💬 chat (top-right)
```

- **Today** — The Daily (newspaper): masthead, NAV hero, live indices strip, The Tape, lead story,
  movers, top hitters, on-the-radar.
- **Fund** (Portfolio) — NAV, P&L vs benchmark, holdings with logos, the risk dial + soak + kill
  switch live here (or in More — see open questions).
- **✦ The Hunt ✦** — the centerpiece. Vertical scrollable feed of large stock cards. Directed-hunt
  brief bar. Watch / dismiss / open dossier. This is "home."
- **Markets** — a hub with a segmented control: **Watchlist · Universe · Browse · Smart Money**.
- **More** — Reports, Settings (risk dial, kill switch, soak, theme), the "about us" people sheet,
  sign out.
- **Chat** — a `chat.bubble` toolbar button on every tab → presents full-screen chat; `AskGrq` on a
  dossier opens it pre-scoped to that symbol. Members-only.
- **Stock dossier** — pushed (`NavigationLink`) from anywhere a ticker appears.

> Decision rationale: TabView reads best at ≤5 tabs; the Hunt must be center and prominent; the four
> market destinations are siblings that share a layout, so a hub with a segmented control mirrors the
> web's (retired) `MarketTabs` without crowding the bar. Smart Money living inside the hub vs. earning
> its own tab is an **open question** (below).

---

## Constraints & boundaries

- **iOS-only.** This plan touches `ios/` exclusively. Every server change it needs is collected in
  **Appendix A — Backend dependencies** as a precise handoff for the web agent. The Swift client is
  written to the *target* contract and lights up as each endpoint lands (the proven P1 pattern).
- **`shared/contract.ts` is the boundary** and is owned by parity, not by either side alone. I will
  **not** edit it; Appendix A gives exact zod diffs to apply. Swift `Models.swift` is written to match.
- **Builds happen on Cam's Mac** (Linux box has no iOS SDK). My deliverable is Swift source; each
  phase's exit criteria are verified by a Mac build + run.
- **Money rules never move to Swift** (`IOS-PLAN.md`): the app renders integer cents and posts intents
  through the same guarded routes. No quotes, no math, no guardrails on device.
- **Live-on-device is gated on two human/infra steps** (long-standing, `IOS-PLAN.md`): the GRQ-iOS
  Google OAuth client (`GRQ_IOS_GOOGLE_CLIENT_ID`) and the nginx mobile-API location that bypasses
  oauth2-proxy. **Until then**, develop against the LAN box: set `grq.apiBase` to
  `http://<lan-ip>:3012/api` and use the dev login (`GRQ_DEV_LOGIN=1`). All phases are buildable and
  testable this way.

---

## Phases

Each phase is independently shippable and Mac-verifiable. "Backend deps" = items from Appendix A that
must land for that phase to run on **live** data (the UI can be built and previewed before then).

### P0 — Reframe & rebrand (no backend dep)

The skeleton + visual identity. All achievable today against existing endpoints.

- **Tab shell:** replace `MainTabView` with the 5-tab IA (Today · Fund · Hunt · Markets · More), Hunt
  centered and visually emphasized. Add a global `chat.bubble` toolbar button + a `⌕` search entry.
- **Rebrand:** bundle real assets into `Assets.xcassets` — `grq-logo.png`, `grq-logo-light.png`,
  `bull-splash.png`, `bear-splash.png`, `cam.png`, `graham.png`. Replace every text-"GRQ" gradient
  masthead with the logo (light/dark variant by theme). Mascots in the splash and the RatingBar hero.
- **Rating primitives:** new `RatingBar` SwiftUI view — red→amber→green track with a needle at `pos`
  (0..1), optional bull/bear mascots at the ends, the 7-point label; `StanceBadge` (abbr + tone).
  Mirror `web/components/RatingBar.tsx` + `lib/stance.ts` (`STANCE_VALUES`, `pos`, `tone`, `blurb`).
- **Markdown:** add `MarkdownText` (render `bodyMarkdown` — today it's raw `Text`) and `CollapsibleMd`
  (clamp + "show more"), mirroring `components/Md.tsx`/`CollapsibleMd.tsx`.
- **`StockLogo`:** `AsyncImage` from `logoUrl` with the existing initials-circle fallback.
- **Models:** sync `Models.swift` to the current contract and **add forward-declared structs** for the
  new shapes (`Rating`, `HuntFind`, `SmartMoney*`, `StockExtras`, `ReportSummary`) so views compile now.
- **Files:** `App/GRQApp.swift` (tab shell), `Theme/Components.swift` (+RatingBar, StanceBadge,
  MarkdownText, CollapsibleMd, StockLogo), `Models/Models.swift`, `Resources/Assets.xcassets/*`,
  new `Views/Hunt.swift` · `Views/Markets.swift` · `Views/More.swift` (stubs wired into the shell).
- **Exit:** builds on Mac; new bar + logo + mascots visible; Today/Fund/Markets still render live;
  Hunt/SmartMoney/Chat show "coming online" placeholders.

### P1 — The Hunt (the centerpiece) — *Backend deps: A1 (GET /api/hunt), A6 (rating on shapes)*

The signature screen. A vertically scrollable feed of large cards — "Instagram of stocks."

- **Feed:** `LazyVStack` of full-width `HuntCard`s, pull-to-refresh. Each card: `StockLogo`, ticker +
  company, **big 12-mo upside** (`far`), **conviction %**, **obscurity badge** (1–5 → "🔍 deep cut" …
  "well-followed"), now-price, the dossier narrative (`CollapsibleMd`), source chips. Leads, *not*
  verdicts — no Buy/Hold/Sell on the card face (mirror `IdeaCard discovery`).
- **Directed hunt (members):** a `HuntBar` text field → `POST /api/hunt/refresh {brief}`; render the
  **🎯 Directed hunt** banner from `huntBrief`; `↻` refresh (blank brief) goes broad.
- **Card actions (members):** ♥ Watch → `POST /api/universe {action:"add"}`; ✕ Dismiss → `POST
  /api/universe {action:"dismiss"}`; tap → full dossier. (Writes ride P5's Face-ID + middleware admit;
  in P1 they can be optimistic stubs if the admit hasn't landed.)
- **Files:** `Views/Hunt.swift` (feed + `HuntCard` + `HuntBar`), `Services/Services.swift`
  (`hunt()` → `{brief, finds}`, `refreshHunt(brief:)`).
- **Exit:** the feed renders live hunt finds obscurity-first; the brief steers a run; dossier link works.

### P2 — The Daily + the Fund — *Backend deps: A4 (indices for Bearer / fold into today), A2 (logos on movers/positions)*

- **Today → newspaper:** masthead (logo + `{edition} Edition · {date}`), NAV hero + day P&L + vs-XIC,
  **live indices strip** (TSX/S&P/DJIA/NASDAQ/Gold/Oil, polls to close), The Tape (`TapeChart`), the
  lead story (`MarkdownText`, titled by `leadTitle`), movers (clickable → dossier), top hitters,
  on-the-radar. Rework `Views/Today.swift`.
- **Fund (Portfolio):** NAV hero + total P&L + vs-benchmark, stat grid (cash/risk/fees/invested),
  holdings with `StockLogo` + day move + weight, "watched by" member avatars (people). Optionally a
  NAV-history sparkline. Rework `Views/Portfolio.swift`.
- **Exit:** Today shows the live indices strip + tape + movers; Fund shows holdings with logos.

### P3 — Markets hub + the Stock dossier — *Backend deps: A3 (smart-money), A5 (dossier enrichment), A2 (rating/logo on MarketName), A7 (symbol-search + stock-extras for Bearer)*

- **Markets hub:** `Views/Markets.swift` with a segmented control:
  - **Watchlist / Universe:** rows = `StockLogo` + ticker + `RatingBar` (compact) + price + day move;
    tap-to-expand into earnings/analyst grades (`/api/stock-extras`) or push the dossier. Member
    directive (pin/no-fly), promote/demote, watch live here (wired in P5).
  - **Browse:** symbol search (`/api/symbol-search`) → results → Watch (add).
  - **Smart Money:** tracked-portfolio cards (NEW/ADD/TRIM, put/call flags), Congress/funds/insider
    leaderboards, cluster buys, GRQ's read narrative. Mirror `app/market/smart-money/page.tsx`.
- **Stock dossier (the big rebuild):** `Views/Stock.swift` — `StockLogo` + live quote, **RatingBar**
  (GRQ's call + technical lean, mascots), status chips, signals strip, targets, analyst consensus,
  bottom line, fundamentals (P/E · FCF · div yield · market cap), source scoreboard, **per-stock smart
  money**, earnings, news, peers, the dossier markdown, directive buttons, watch/promote, **AskGrq**
  (→ chat scoped to the symbol). Mirror `app/stocks/[symbol]/page.tsx`.
- **Exit:** all four market sub-tabs render live; the dossier is at parity with the web stock page.

### P4 — Chat — *Backend deps: A8 (admit /api/chat for Bearer; chat-server reachable via mobile nginx)*

- **Chat surface:** full-screen chat presented from the global `chat.bubble` and from `AskGrq`
  (pre-fills "Let's talk about {SYMBOL}."). Per-member thread toggle (`owner` param); members-only.
- **Streaming:** consume the SSE the route proxies (`text` / `status` / `error` events) via
  `URLSession.bytes(for:)`, appending tokens live; render bubbles with `MarkdownText` + people avatars
  (Cam/Graham photos, GRQ initial). Mirror `components/ChatClient.tsx`.
- **Files:** `Views/Chat.swift`, `Services/Services.swift` (`chatHistory(owner:)`, `chatStream(...)`).
- **Exit:** a member can converse with the agent, streaming, in either thread, scoped from a stock.

### P5 — Member actions + Face ID — *Backend deps: A9 (admit write routes for Bearer)*

- **Wire the real mutations** behind member role + **Face ID** (`LocalAuthentication`, `evaluatePolicy`)
  for sensitive ones: kill switch (`/api/killswitch`), directives (`/api/stocks/directive`), watch/add
  + promote/demote/retire/dismiss (`/api/universe`), hunt brief/refresh, notes (`/api/note(s)`).
- **UX:** optimistic update + rollback on non-2xx; surface the guardrail text verbatim on rejection
  (the money rules are never funny). This retro-activates the action stubs from P1/P3.
- **Exit:** every member control on web works on iOS, Face-ID-gated, with honest failure copy.

### P6 — Reports, polish, push, TestFlight — *Backend deps: A10 (reports), A11 (push, optional)*

- **Reports:** list + per-day report (`/api/reports`, `/api/reports/day/[date]`). `Views/Reports.swift`
  under More.
- **Polish:** empty/loading/offline states everywhere (`strings.*`), pull-to-refresh, accessibility
  (`reduceMotion` for the splash, Dynamic Type, VoiceOver labels on charts/ratings), iPad layout,
  ticker deep links.
- **Push (stretch):** APNs for kill-switch flips, fills, finished hunts.
- **TestFlight** to Cam & Graham; the parity rule (`IOS-PLAN.md`) is enforced from here — any
  user-facing web change ships on iOS in the same change.
- **Exit:** internal TestFlight build live; `IOS-CONTENT.md` updated to the new IA.

### P0.5 — Infra unblock (human/Cam, parallel) — prerequisite for *live on a phone*

Not iOS code, but the gate to leaving the LAN: create the **GRQ-iOS Google OAuth client** →
`GRQ_IOS_GOOGLE_CLIENT_ID` in `.env`; add the **nginx mobile-API location** that bypasses oauth2-proxy
and never forwards a client `X-Forwarded-Email` (clone `infrastructure/nginx/conf.d/03-whosup.conf`);
drop the **GoogleSignIn SPM package** into the Xcode project on the Mac (the `GoogleAuth` stub marks
the spot). Tracked in `IOS-PLAN.md`.

---

## Appendix A — Backend dependencies (handoff to the web agent)

The contract + endpoints the iOS rebuild consumes. All are server-side; none change a money rule. Each
mobile **read** route must also be admitted at the edge (`web/middleware.ts` `MOBILE_API`) when a
`Bearer` is present; mobile **writes** already self-guard via `memberFromRequest` (which resolves the
GRQ-JWT) but are **currently blocked at the edge** — see A9.

- **A1 — `GET /api/hunt`** *(new)*: `{ brief: string|null, finds: HuntFind[] }`. `HuntFind` is the
  `IdeaCard discovery` shape already assembled in `app/market/page.tsx` → move that into
  `lib/feed.ts` as `huntResponse()`: `{ sym, name, logoUrl, currency, cur, nearBps, farBps, nearDays,
  confidence, rating, body, sources: string[], obscurity, watch }`. Admit `/api/hunt` for Bearer.
- **A2 — `logoUrl` + `rating` on list shapes**: add `logoUrl: string|null` to `Mover`, `Position`,
  `MarketName`; add `rating` (A6) to `MarketName`, `Idea`, `Mover`-where-relevant. `logoUrl` already
  exists on `UniverseRow`.
- **A3 — `GET /api/smart-money`** *(new)*: serialize `lib/smart-money/queries.ts` (portfolios,
  congress/funds/insider leaderboards, clusters, members, freshness, narrative) + universe overlap.
  New contract shapes `SmartPortfolio`, `LeaderRow`, `CongressEntry`, `SmartCluster`. Admit for Bearer.
- **A4 — indices**: either fold the `/api/indices` payload into `todayResponse()` as
  `indices: IndexQuote[]`, **or** admit `/api/indices` for Bearer. Folding is simpler (one fetch).
- **A5 — enrich `dossierResponse()`** to match `app/stocks/[symbol]/page.tsx`: add `logoUrl`, `status`
  (ACTIVE/CANDIDATE/RETIRED), `watch`, `rating` (A6) + technical-lean rec (label+pos), `bottomLine`,
  fundamentals filled from FMP (`peRatio`/`freeCashFlowCents`/`dividendYieldBps` are currently
  hardcoded `null`), `earnings`, `analystGrades`, `news[]`, `peers[]`, `scoreboard`, `smartMoney`,
  `researching` flag, and whether the body is a *hunt* dossier vs a full one.
- **A6 — Stance migration (contract)**: the contract's `AgentCall` enum is the **retired vocabulary**
  (`buy/accumulate/hold/watch/trim/avoid/sell`). Add the live one:
  ```ts
  export const Stance = z.enum(["Strong Buy","Buy","Weak Buy","Hold","Weak Sell","Sell","Strong Sell"]);
  export const Rating = z.object({
    label: Stance, abbr: z.string(), tone: z.enum(["emerald","teal","amber","red"]),
    pos: z.number(),            // 0..1 needle position (Strong Sell 0 → Strong Buy 1)
    blurb: z.string(),
  }).nullable();
  ```
  Emit `rating` from `lib/stance.ts` `stanceMeta()` on Dossier/Idea/MarketName/HuntFind. Keep
  `agentCall` only for back-compat or drop once the app no longer reads it.
- **A7 — admit `/api/symbol-search` + `/api/stock-extras/[symbol]` for Bearer** (both already
  `sessionFromRequest`-guarded and read-only) so Browse + row-expand work on mobile.
- **A8 — admit `/api/chat` (GET history + POST SSE) for Bearer**; confirm the chat-server (`chat:3014`)
  is reachable through the mobile nginx location. SSE streams fine over `URLSession.bytes`.
- **A9 — admit member write routes for Bearer** in `middleware.ts`: `/api/killswitch`, `/api/universe`,
  `/api/stocks/directive`, `/api/hunt/refresh`, `/api/note`, `/api/notes`. They already enforce
  member-only server-side; the edge currently only admits the read GETs, so **every mobile write 403s
  at the door today** — this is the single biggest unblock for P5 (and the P1/P3 actions).
- **A10 — `GET /api/reports`** *(new)*: `{ reports: ReportSummary[] }` + `GET /api/reports/day/[date]`.
  New contract shapes. Admit for Bearer.
- **A11 — push (optional, P6)**: an APNs device-token registration route + the agent emitting pushes on
  kill-switch/fill/hunt events.
- **A12 — watchers (D78, SHIPPED 2026-06-26 — web LIVE + iOS distributed to TestFlight):** `MarketName` +
  `Dossier` carry a `watchers: Watcher[]` (`{ key: "cam"|"graham", name }`, `.default([])`) — the members
  watching the name, independent of `inUniverse`. Built in `lib/feed.ts` via `watchersFor()`. iOS: `Watcher`
  struct + `var watchers: [Watcher]? = nil` on both models, the `WatcherStack` view (`Theme/Components.swift`,
  bundled `Image(key)` faces, no new file → no pbxproj edit) on the Market row + Stock header, and
  single-actor promote copy. The two-person promote flow is gone (any member promotes). Mobile
  watchlist/universe split stays status-based for now (watch-driven mobile = a later follow-up).

> Parity note: as `lib/feed.ts` already builds from the same Prisma source the web pages read, these
> are mostly *serializers over existing queries*, not new logic. Keep `shared/contract.ts` and
> `lib/feed.ts` in lockstep; `web/scripts/verify-mobile-api.ts` is the guard.

## Appendix B — Open questions for Cam

1. **Smart Money: its own tab, or inside the Markets hub?** (Default: in the hub. It's marquee, so a
   5th tab swapping out "More" is defensible — but then Hunt isn't center.)
2. **Where do the controls live — Fund tab or More?** Risk dial / kill switch / soak: I lean **kill
   switch reachable everywhere** (it's sacred) + the dial/soak under More/Settings.
3. **The Hunt feed: scroll or page?** "Instagram" = a scrollable feed of large cards (my default).
   "TikTok/Reels" = one full-screen card you flick vertically. Confirm scroll.
4. **Viewers on mobile?** `IOS-PLAN` says members-only to start. Keep that, or admit read-only viewers?
5. **Reports priority** — P6 as planned, or pull earlier?

## Appendix C — Suggested file layout after the rebuild

```
ios/GRQ/
├─ App/GRQApp.swift            5-tab shell (Hunt center) + global chat + managers
├─ Theme/
│  ├─ Theme.swift              palette (unchanged)
│  └─ Components.swift         + RatingBar, StanceBadge, MarkdownText, CollapsibleMd, StockLogo
├─ Models/Models.swift         synced to contract + Rating/HuntFind/SmartMoney/StockExtras/Report
├─ Services/
│  ├─ Services.swift           APIClient (+ hunt, smartMoney, chat stream, writes), AuthManager
│  └─ Content.swift            unchanged (reads shared/content)
├─ Views/
│  ├─ Splash.swift             rebranded (mascots), unchanged behaviour
│  ├─ SignIn.swift             rebranded
│  ├─ Today.swift              The Daily (P2)
│  ├─ Portfolio.swift          the Fund (P2)
│  ├─ Hunt.swift   ★           the centerpiece (P1)
│  ├─ Markets.swift            hub: Watchlist · Universe · Browse · Smart Money (P3)
│  ├─ Stock.swift              the rich dossier (P3) — replaces StockDetailView in Ideas.swift
│  ├─ Chat.swift               streaming agent chat (P4)
│  ├─ Reports.swift            list + day report (P6)
│  └─ More.swift               Settings/About/sign out (P0/P5)
└─ Resources/Assets.xcassets   logo (light/dark), bull/bear mascots, cam/graham photos
```
(`Views/Ideas.swift` and `Views/Market.swift` are retired into `Hunt.swift` / `Markets.swift` /
`Stock.swift`.)
