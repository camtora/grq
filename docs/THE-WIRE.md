# The Wire — a full-screen discovery feed ("the Hunt meets Instagram")

Cam, 2026-06-22: *"A prototype version of the Hunt meets Instagram."* A separate, scrollable
surface that mixes the fund's discovery streams — finds, research, the board, the news, a
lesson — into one feed you flick through. Later: *"render each tile to fill the browsable
area, scroll-lock them into view, swipe up/down to the next one… more opportunity to display
more information for each card. Each one needs to be handled uniquely."*

This is a **prototype**, **iOS-first**, **shared + read-only** for v1. Decision record: `docs/DECISIONS.md`
**D55**. This file is the living plan + requirements; keep it in sync as the feature grows.

---

## The original ask (requirements → status)

| # | Requirement (Cam's words) | Status |
|---|---|---|
| 1 | A separate page, scrollable, mixing discovery streams | ✅ v1 — `The Wire`, a 4th iOS tab |
| 2 | Surface the **hunt stocks** | ✅ `find` cards |
| 3 | Surface the **user's watchlist** + **other users' watchlists** | ◑ v1 shows recent watchlist adds attributed to **Cam / Graham / agent** (`watch` cards). NB the watchlist is *fund-level* today — "other users' watchlists" = the Cam/Graham/agent lanes, not separate per-person lists |
| 4 | User sets **interested industries / hunt briefs**, or store what they've **asked to be briefed on**; show those names on a given day | ⏳ **Phase 2** — needs a per-user table (see below) |
| 5 | **Cap to already-researched** stocks (recently) | ✅ feed pulls from recent dossiers/finds/watches only |
| 6 | **Articles** that pertain to some stocks | ◑ v1 shows market headlines (`article` cards); **stock-tied** articles are Phase 2 |
| 7 | **Lessons / education** on topics | ✅ `lesson` cards from the glossary |
| 8 | **Push notifications** — set a price alert on a stock | ⏳ **Phase 2** — the D53 push stack exists; not yet wired to The Wire or to price triggers |
| 9 | Full-screen tiles, **scroll-locked**, swipe up/down, each tile fills the area, each handled uniquely | ✅ v1 — iOS-17 paging, 5 purpose-built full-screen layouts |
| 10 | Keep the **tab bar** + a **header with top-right avatar** (like the Hunt tab) | ✅ v1 |

Legend: ✅ done · ◑ partial · ⏳ deferred to Phase 2

---

## Decisions locked (with Cam)

- **Name:** The Wire (fits the GRQ "The Daily / The Tape / The Hunt / The Close" family).
- **v1 scope:** shared feed (no per-user state), read-only, **no schema change** — reuse existing tables/feeds.
- **Platform:** iOS-first. The `/api/wire` endpoint is contract-shaped, so web can follow later.
- **Push:** deferred to Phase 2 (the D53 APNs stack is left untouched).
- **Layout:** full-screen vertical paging (Reels/Stories). **Tab bar stays**; **fixed header** (brand + top-right
  `MemberAvatar`). Cards fill the area between header and tab bar.
- **Style:** **mixed** — unified dark cards for stock kinds; full-bleed photo for articles; accent-tinted flash
  card for lessons.
- **Depth:** **go rich** — full-screen means room for more, so cards carry targets, signals, sources, sparklines.

---

## The five card kinds (each handled uniquely)

Each is a full-screen page with a top progress rail + kicker, a single bottom CTA, and a swipe hint. Content is a
**fitted summary** — depth lives behind the CTA (tap → the existing detail view); cards never scroll internally
(that would fight the paging).

| Kind | Hero | Shows | Tap |
|---|---|---|---|
| **find** | 12-mo upside + heat | logo, heat bar, giant upside, near target, area chart, "why we care", sources | → hunt dossier |
| **dossier** | GRQ's call (RatingBar) | price + day move, bottom-line bullets, near/12-mo **target prices**, signals strip | → full dossier |
| **watch** | who's watching (big avatar) | the member, the name, a mini chart, GRQ's call, "since {date}" | → dossier |
| **article** | full-bleed photo | headline, publisher, time (related tickers = Phase 2) | → opens the article |
| **lesson** | the idea (tinted card) | term + plain-English definition (example + related terms = future) | → glossary sheet |

Ordering: bucket per kind, then **weave round-robin** so the feed reads mixed, not clumped.

---

## Phase plan

### Phase 1 — shipped (2026-06-22)
- `GET /api/wire` (`wireResponse()` in `web/lib/feed.ts`); `WireItem`/`WireResponse` in `shared/contract.ts`.
- Five woven card kinds from existing surfaces (Hunt finds, recent dossiers, watchlist adds, `fmpNews`, `GLOSSARY`).
- "Go rich" fields on the wire: `nearBps`/`nearHorizon`/`targetNear|FarCents`/`signals`/`sources`, watch `spark`.
- iOS: `ios/GRQ/Views/Wire.swift` — full-screen paging + 5 layouts; new "Wire" tab; Markets moved under More.
- Lessons present the wire-carried term/body directly (the bundled glossary is a subset of web's).

### Phase 2 — next (not built)
1. **Per-user personalization** — a `UserInterest` table (keyed by email): chosen **sectors/industries** + saved
   **hunt briefs**; could auto-seed from each member's past `huntBrief`s. Then rank/filter the feed per member.
   This is the unlock for requirement #4 and turns "shared feed" into "for you."
2. **Price alerts + push** — a `UserPriceAlert` table (symbol, email, trigger cents) + a per-tick check in the
   agent runner + fan-out through the D53 push stack. Requirement #8.
3. **Stock-tied articles** — attach `fmpStockNews` to tracked names so articles carry related tickers (req #6).
4. **Web rendering** — render the same `/api/wire` on the web (the contract already supports it).
5. **Unpriced-finds coverage** — ~4/9 hunt finds lack a live quote (pre-existing hunt coverage gap) → those
   cards degrade to heat + thesis + sources. Either improve quote/bar coverage for obscure tickers, or filter
   unpriced finds out of the feed. *(Decision pending.)*
6. **Lesson richness** — a "for example" line + tappable related terms.

### Open questions
- "Other users' watchlists" beyond the Cam/Graham/agent lanes — do we ever want true per-person watchlists, or is
  the fund-level board the right model for a 2-person fund?
- Immersion: keep the tab bar (current) or add an optional full-immersion mode that hides chrome while browsing?
- Should The Wire eventually **absorb The Hunt** (it's a superset), or stay a separate surface?

---

## Where the code lives
- **Backend:** `web/lib/feed.ts` (`wireResponse`), `web/app/api/wire/route.ts`, `web/middleware.ts` (allowlist),
  `shared/contract.ts` (`WireItem`/`WireResponse`), `web/scripts/verify-mobile-api.ts` (contract check).
- **iOS:** `ios/GRQ/Views/Wire.swift` (`WireView` + `WireCardPage`), `Models.swift` (`WireItem`),
  `Services.swift` (`APIClient.wire()`), `App/GRQApp.swift` (tab + `GlossaryPresenter.present`),
  `Views/Settings.swift` (Markets under More).
- **Decision record:** `docs/DECISIONS.md` D55.

## Known gaps / honesty
- iOS is committed but compiles only in Xcode (no macOS SDK on the build host) — a real device validates it.
- The watchlist is fund-level; per-user lists/preferences don't exist yet (Phase 2 #1).
- Unpriced finds degrade gracefully but look thin (Phase 2 #5).
