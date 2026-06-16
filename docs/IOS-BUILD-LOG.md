# GRQ iOS — Build Log & Handoff

A record of the iOS initiative as built on **2026-06-15** (Claude session). Companion to
`IOS-PLAN.md` (the framework) and `IOS-CONTENT.md` (the per-screen content spec). This is
the "where things stand and why" doc — the receipts.

> **Reconcile later:** this session was constrained to **new files only** (an agent was
> live-editing `web/`), so nothing here is folded into `CLAUDE.md`, `PROJECT_PLAN.md`,
> `docs/DECISIONS.md`, or `docs/PHASES.md` yet. Those updates + the web wiring below need
> a human/agent pass when the tree is free.

## What this is

A **native SwiftUI** companion app to grq.camerontora.ca, for **TestFlight to Cam &
Graham**. Built to the whosup pattern. The product requirement driving the architecture:
*"talk to the agent → changes land on web AND iOS, no separation."*

## Decisions made this session (and why)

1. **Native SwiftUI**, not Expo/RN or a Capacitor wrap. Cam said "use whosup as the
   example," and whosup is native — which *rules out* a shared-UI stack. So "no
   separation" is met at the **contract + workflow** layer, not one UI codebase.
2. **Monorepo.** `ios/` and `shared/` sit beside `web/`. whosup is itself a monorepo
   (`backend/` + `ios/`), so this matches Cam's proven layout.
3. **Read camwiki for method (didn't mirror it).** Applied: the Ubuntu+Mac SSHFS dev split
   (`expo-react-native-build-pipeline`), the JWT spectrum (`jwt-authentication` — whosup's
   7-day Keychain token vs SBCA's access+refresh), and the self-hosted-for-financial-data
   posture (`family-app-stack-comparison`: GRQ is Haymaker-class).
4. **Auth seam = email.** GRQ authz keys entirely off `X-Forwarded-Email → roleForEmail`
   (`web/lib/session.ts`). So iOS only needs GRQ to resolve a trusted email per request and
   **every existing guardrail (kill switch, viewer, order gate) works unchanged.** Plan:
   Google Sign-In → `POST /api/auth/google` (verify the ID token server-side) → GRQ JWT in
   **Keychain**, **Face ID** on member actions.
5. **`jsonwebtoken`, not `jose`.** Earlier I reached for `jose` assuming JWT verification in
   Next *middleware* (edge runtime). Corrected: verify in the **Node route layer**
   (`session.ts`) with `jsonwebtoken` (same as whosup); middleware just excludes the mobile
   API paths from its HTML door. One fewer dependency.
6. **Splash = "make it rain."** Dollar bills fall (SwiftUI `Canvas`) → fade into the
   wealth-aware greeting (banded by P&L), then into the app. Honors Reduce Motion. Zero
   money logic — pure presentation.
7. **Content backbone first.** `shared/content/` is the language-neutral source of truth for
   every word, seeded faithfully from `web/lib/{glossary,dailyquote,funfacts,greetings}.ts`,
   with a **determinism contract** so web (TS) and iOS (Swift) pick the *same* daily
   quote/greeting.
8. **Skeleton-first, mock mode.** The app runs with **no backend and no Google SDK** so Cam
   & Graham can give feedback on look/flow immediately; real auth + live data are stubbed
   behind clean seams.
9. **Committed, hand-maintained `GRQ.xcodeproj`** (objectVersion 56, templated from
   whosup), like whosup — `open` it directly, no XcodeGen step. `project.yml` kept only as
   a regen aid.

## Inventory (all new files)

### `shared/` — the "no separation" layer
| File | Purpose |
|---|---|
| `README.md` | The layer + the parity rule |
| `contract.ts` | API request/response shapes (zod). Portfolio/Auth mirror `lib/portfolio.ts` exactly; Today/Market/Ideas are **v0** |
| `tokens.json` | Design tokens — brand palette + both member themes, extracted from `web/app/globals.css` |
| `content/README.md` | Content model + the **determinism contract** (hash + day-key so both platforms match) |
| `content/voice.md` | The GRQ voice guide (money rules never funny; loss jokes punch at the robot) |
| `content/glossary.json` | 47 literacy terms (faithful transcription of `lib/glossary.ts`) |
| `content/daily.json` | Quotes · fun facts · wealth-aware greeting bands |
| `content/strings.json` | UI copy: splash, auth, tabs, empty states, guardrail messages |

### `docs/`
| File | Purpose |
|---|---|
| `IOS-PLAN.md` | The locked framework (stack, auth seam, pipeline, splash, phasing) |
| `IOS-CONTENT.md` | Per-screen content spec + the per-feature parity checklist |
| `IOS-BUILD-LOG.md` | This file |

### `ios/` — native SwiftUI app (13 Swift files + project)
| Path | Purpose |
|---|---|
| `GRQ.xcodeproj/` | Committed, hand-maintained project + self-referencing workspace |
| `project.yml` | XcodeGen spec — regen aid only (`xcodegen generate`) |
| `GRQ/App/GRQApp.swift` | `@main`, RootView (splash→auth→tabs), TabView, ThemeManager, GlossaryPresenter |
| `GRQ/Theme/Theme.swift` | Palette (light/dark from `tokens.json`), brand gradient, `Color(hex:)` |
| `GRQ/Theme/Components.swift` | Card, StatCard, Chip, Pnl, MoneyText, TermLink, Sparkline, GlossarySheet, `Fmt` |
| `GRQ/Services/Content.swift` | Loads `../shared/content/*.json`; greeting/quote/fact selection matching web |
| `GRQ/Services/Services.swift` | AuthManager (stub), APIClient (Bearer-ready, returns mock), MockData |
| `GRQ/Models/Models.swift` | Codable structs mirroring `contract.ts` |
| `GRQ/Views/*.swift` | Splash, SignIn, Today (The Daily), Market, Portfolio, Ideas (+ StockDetail), Settings |
| `GRQ/Resources/Assets.xcassets` | AppIcon placeholder + AccentColor (teal #14b8a6) |

The project **bundles `../shared/content/*.json` + `tokens.json` as resources** (via
`SOURCE_ROOT`), so the app reads the same source of truth as the web app at runtime.

## State of play

- **Builds and RUNS on a real iPhone (2026-06-15)** — the blind-authored SwiftUI compiled and
  ran on device on the first Mac build. A flashy pass is applied: elevated glass cards, hero
  NAV, gradient area-chart Tape, ambient glow, and one bold gradient header per screen via
  `GRQScreen` (system bar hidden → no doubled headers). The splash money-rain replays on
  **every open** (cold launch + return from background, via `scenePhase`).
- **App icon added** — `AppIcon.appiconset/AppIcon-1024.png` (teal "GRQ" wordmark, opaque /
  no alpha). Fixes the TestFlight rejections (`CFBundleIconName` missing + no 120px icon) and
  the blank home-screen icon. `Assets.xcassets` is a folder reference, so the icon is picked
  up on the next archive with **no project-file change** — Xcode generates all sizes from the
  single 1024.
- **Verified (from Linux):** JSON valid; `project.pbxproj` sound (object refs resolve, 13
  sources == files on disk, shared resources resolve). Swift can't be compiled here (no iOS
  SDK) — that's the Mac's job, now proven on device.
- **Universe screen + tap-to-dismiss splash (2026-06-15):** the second tab is now **Universe** —
  the investable set with GRQ's call + signal strip, **member directives (pin / no-fly)**,
  **promote-from-watchlist**, and **propose-a-name** (all mock; the real ones hit
  `/api/stocks/directive` + `/api/universe`, member + Face ID). `Directive` added to
  `shared/contract.ts` (mirrors `SymbolDirective`). The splash is now **full-page money rain on
  every open that stays until tapped** (no auto-advance).
- **Still pending:** TestFlight re-archive + upload (with the icon); push notifications (P3,
  not built); the live-data web wiring (below) + a `/api/quotes` poll for a live price ticker.

## Pending — needs Cam's go (edits to existing files)

The app has nothing *live* to read until the web side is wired. All of these touch existing
files the agent owns, so they were intentionally left:

1. `web/lib/session.ts` — resolve email from a verified `Bearer` JWT (`jsonwebtoken`) when
   `X-Forwarded-Email` is absent. `roleForEmail`/`memberFromRequest` untouched.
2. `web/middleware.ts` — exclude the mobile API paths from the 403-HTML door (like `/api/health`).
3. **New GET routes** returning `contract.ts` shapes: `/api/today`, `/api/portfolio`,
   `/api/market`, `/api/ideas`, `/api/auth/me`; plus `POST /api/auth/google`.
4. **nginx** — a GRQ mobile-API location bypassing oauth2-proxy (clone
   `infrastructure/nginx/conf.d/03-whosup.conf`); never forward a client `X-Forwarded-Email`.
5. **web → shared** — migrate `web/` to import from `shared/content/` (replaces inline
   `lib/*.ts`); until then they're mirrors to keep in sync.
6. `.env` — a new GRQ-iOS OAuth client id + `GRQ_JWT_SECRET`.

## Maintenance notes

- **Adding a Swift file** → add it to `project.pbxproj` (a `PBXFileReference` +
  `PBXBuildFile` + the group + the Sources phase) **or** run `xcodegen generate`. Same cost
  as whosup for owning the project file.
- **Daily content determinism** lives in `shared/content/README.md` — keep the Swift hash
  (`Content.swift`) and the TS hash byte-identical or the two screens drift.
- **Build/ship is Mac-only** (Xcode). The Linux box edits; Cam archives/uploads. A macOS CI
  runner later would give the agent a compile feedback loop.
- The splash bill is the 💵 emoji in a `Canvas` — swap for a real asset in `Views/Splash.swift`.
- `DEVELOPMENT_TEAM` in the project is Cam's (`3WR9SN94Q4`, from whosup); Graham sets his own
  for device builds (simulator needs none).

## Next (from `IOS-PLAN.md`)

**P0** contract + dual-auth seam + nginx + Google Sign-In → first authenticated GET ·
**P1** read-only screens on live data · **P2** member actions (kill switch/order/directives)
behind Face ID · **P3** push + agent chat · **P4** TestFlight, parity enforced.
