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
| 3 | Surface the **user's watchlist** + **other users' watchlists** | ✅ **Phase 2 (D57) — social:** the watch lane is **viewer-aware** — it HIDES your own watches and shows what the **other member** is tracking (agent watches included, member-first). Each `watch` card is now as rich as a dossier (GRQ's call, bottom line, targets, signals). The watchlist is still fund-level under the hood (attribution by `addedBy`) |
| 4 | User sets **interested industries / hunt briefs**, or store what they've **asked to be briefed on**; show those names on a given day | ⏳ **Phase 2** — needs a per-user table (see below) |
| 5 | **Cap to already-researched** stocks (recently) | ✅ feed pulls from recent dossiers/finds/watches only |
| 6 | **Articles** that pertain to some stocks | ✅ **Phase 2 (D56)** — `wireResponse` attaches `fmpStockNews` to a few tracked names in the feed; those `article` cards carry `relatedTickers` (tap → the dossier). General market headlines still flow |
| 7 | **Lessons / education** on topics | ✅ `lesson` cards from the glossary — **Phase 2 (D56)** added a "for example" line + tappable related terms; **(D57)** enriched **all 55** glossary terms so every daily rotation is rich |
| 8 | **Push notifications** — set a price alert on a stock | ✅ **Phase 2 (D56)** — `PriceAlert` table + `GET/POST/DELETE /api/notifications/price-alerts`; the runner checks crossings each market-hours tick and pushes the owner via the D53 stack (category `priceTargets`). iOS: a bell on the stock page + a Price-alerts manager |
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
| **find** | 12-mo upside + heat | logo, heat bar, giant upside, near + 12-mo **target prices**, area chart, the **full hunt thesis** (scrolls; D57), sources | → hunt dossier |
| **dossier** | GRQ's call (RatingBar) | price + day move, bottom-line bullets, near/12-mo **target prices**, signals strip | → full dossier |
| **watch** | who's watching (avatar) | **the OTHER member** (yours are hidden; D57), the name, GRQ's call (RatingBar), bottom line, targets, signals, mini chart | → dossier |
| **article** | full-bleed photo | headline, publisher, time, **related-ticker chips** (D56, stock-tied) | → opens the article · chip → the dossier |
| **lesson** | the idea (tinted card) | term + plain-English definition + **"for example" line** + **tappable related terms** (D56) | → glossary sheet |

Ordering: bucket per kind, then **weave round-robin** so the feed reads mixed, not clumped.

---

## Phase plan

### Phase 1 — shipped (2026-06-22)
- `GET /api/wire` (`wireResponse()` in `web/lib/feed.ts`); `WireItem`/`WireResponse` in `shared/contract.ts`.
- Five woven card kinds from existing surfaces (Hunt finds, recent dossiers, watchlist adds, `fmpNews`, `GLOSSARY`).
- "Go rich" fields on the wire: `nearBps`/`nearHorizon`/`targetNear|FarCents`/`signals`/`sources`, watch `spark`.
- iOS: `ios/GRQ/Views/Wire.swift` — full-screen paging + 5 layouts; new "Wire" tab; Markets moved under More.
- Lessons present the wire-carried term/body directly (the bundled glossary is a subset of web's).

### Phase 2 — part 1 shipped (2026-06-22, D56)
2. **Price alerts + push** ✅ — `PriceAlert` table (per-user, one-shot via `active`+`firedAt`); `GET/POST/DELETE
   /api/notifications/price-alerts` (members-only; POST refuses an already-met level + auto-derives direction). The
   runner's `checkPriceAlerts()` compares active alerts to fresh quotes each market-hours tick, one-shots atomically,
   and pushes **the owner only** (new `pushNotify` `onlyEmail`; category `priceTargets`, the long-reserved
   `NotificationPreference.priceTargets` now wired). iOS: a **bell** in the stock page's member controls →
   `SetPriceAlertSheet`, and **More → Price alerts** (`PriceAlertsView`). **Shared visibility:** the stock page shows
   **both members'** active alerts on a name (`GET …?symbol=` → `owner`/`ownerKey`/`mine`), but pings + deletes stay
   per-owner. Requirement #8.
3. **Stock-tied articles** ✅ — `wireResponse` pulls `fmpStockNews` for up to 4 names already in the feed and emits
   article cards with `symbol` + `relatedTickers`; iOS renders tappable ticker chips. Requirement #6.
6. **Lesson richness** ✅ — `GlossaryEntry.example` + `related[]` (~14 terms enriched); the wire lesson item carries
   `lessonExample` + self-contained `lessonRelated` (`{slug,term,def}`); iOS shows an example callout + related chips.

### Phase 2 — part 2 shipped (2026-06-22, D57): the Wire goes social
- **Viewer-aware watch lane** — `wireResponse(viewerEmail?)` hides your own watches and shows the **other member's**
  (agent watches included, member-first). The route passes `session.email`. Requirement #3.
- **Richer watch cards** — each pulls its latest dossier (full/hunt) → GRQ's call, bottom line, targets, signals.
- **Richer find cards** — absolute `targetNearCents`/`targetFarCents` + the **full thesis** (`thesis`, markdown-stripped
  server-side; iOS shows it in a bounded scroll). Requirement (more hunt detail).
- **Full lesson library** — all **55** glossary terms enriched (was ~18) so every daily rotation is rich. This was the
  fix for "the lessons look unchanged": D56 enriched a minority, and the 3-per-day rotation kept landing on plain ones.

### Phase 2 — remaining
1. **Per-user personalization (deeper)** — the watch lane is now per-viewer (D57); the *unlock* is a `UserInterest`
   table (sectors/industries + saved **hunt briefs**, auto-seedable from past `huntBrief`s) to rank/filter the
   whole feed "for you" (requirement #4), beyond just the watch lane.
4. **Web rendering** — render the same `/api/wire` on the web (the contract already supports it).
5. **Unpriced-finds coverage** — ~4/9 hunt finds lack a live quote (pre-existing hunt coverage gap) → those
   cards degrade to heat + thesis + sources. Either improve quote/bar coverage for obscure tickers, or filter
   unpriced finds out of the feed. *(Decision pending.)*

### Open questions
- "Other users' watchlists" beyond the Cam/Graham/agent lanes — do we ever want true per-person watchlists, or is
  the fund-level board the right model for a 2-person fund?
- Immersion: keep the tab bar (current) or add an optional full-immersion mode that hides chrome while browsing?
- Should The Wire eventually **absorb The Hunt** (it's a superset), or stay a separate surface?

---

## Where the code lives
- **Backend:** `web/lib/feed.ts` (`wireResponse` — finds/dossiers/watches/articles+stock-tied/lessons),
  `web/app/api/wire/route.ts`, `web/middleware.ts` (allowlist), `shared/contract.ts` (`WireItem`/`WireResponse`/
  `WireRelatedTerm`/`PriceAlert`), `web/scripts/verify-mobile-api.ts` (contract check). `web/lib/glossary.ts`
  (`example`/`related`).
- **Price alerts (D56):** `web/prisma/schema.prisma` (`PriceAlert`), `web/app/api/notifications/price-alerts/route.ts`,
  `web/agent/runner.ts` (`checkPriceAlerts()` in the tick), `web/lib/push/notify.ts` (`onlyEmail` + `priceTargets`),
  `web/lib/push/categories.ts`.
- **iOS:** `ios/GRQ/Views/Wire.swift` (`WireView` + `WireCardPage` — article chips, lesson example/related),
  `Models.swift` (`WireItem`/`WireRelatedTerm`/`PriceAlert`/`NotificationPreferences.priceTargets`),
  `Services.swift` (`APIClient.wire()` + `priceAlerts`/`createPriceAlert`/`deletePriceAlert`),
  `Views/Stock.swift` (bell → `SetPriceAlertSheet`), `Views/Settings.swift` (`PriceAlertsView` under More).
- **Decision record:** `docs/DECISIONS.md` D55 (v1) · **D56** (Phase 2 part 1).

## Known gaps / honesty
- iOS is committed but compiles only in Xcode (no macOS SDK on the build host) — a real device validates it.
- Price alerts (D56) are the first **per-user** state, but the feed itself is still **shared** — "for you"
  ranking/filtering by interests (Phase 2 #1) isn't built; the watchlist remains fund-level.
- Price alerts fire only during **market hours** (the runner checks against fresh quotes in the open-market tick).
- **Push delivery needs APNs configured** (`APNS_*` env — humans-only Apple-portal step, currently unset). Until then
  `checkPriceAlerts()` deliberately **no-ops** (doesn't consume the one-shot), so alerts accumulate and start firing
  the moment push goes live rather than silently vanishing. Members can still create/list/delete them now.
- Unpriced finds degrade gracefully but look thin (Phase 2 #5).
