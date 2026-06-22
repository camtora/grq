# GRQ iOS — Architecture (the framework)

Locked 2026-06-15 with Cam. The companion native app to grq.camerontora.ca, for
TestFlight to Cam & Graham. This is the framework; the content spec is `IOS-CONTENT.md`;
the shared word-layer is `shared/content/`.

## The decision

**Native SwiftUI**, mirroring the proven `whosup` pattern (camwiki:
`wiki/projects/whosup`). Not Expo/RN, not a Capacitor wrap — Cam chose native feel,
and "use whosup as the example" rules out shared-UI stacks (whosup is native).

**"No separation" is achieved at the contract + workflow layer, not one UI codebase:**

- **Monorepo** — `ios/` beside `web/` (whosup keeps `backend/` + `ios/` in one repo).
- **`shared/`** — `contract.ts` (one API/type source → generates TS + Swift) and
  `content/` (one word source — glossary, copy, daily content; see `IOS-CONTENT.md`).
- **Parity rule** — any user-facing change ships on web *and* iOS in the same change;
  the contract + content are law.
- One agent session edits API + web + iOS together and commits in lockstep.

```
grq/
├─ web/                 Next.js (unchanged stack)        ─┐
├─ ios/   GRQ.xcodeproj SwiftUI client                   ─┤→ same /api/*
│  └─ GRQ/{App,Services,Models,Views,Resources}           │
└─ shared/                                                ─┘
   ├─ contract.ts       zod schemas → gen TS + Swift types
   ├─ tokens.json       teal/dark palette → Tailwind + SwiftUI
   └─ content/          glossary · daily · strings · voice  (shipped 2026-06-15)
```

## The seam: email-based authz makes this clean

GRQ's whole authorization keys off one thing — `X-Forwarded-Email` → `roleForEmail()`
→ member/viewer (`web/lib/session.ts`, `users.ts`). So the iOS path only has to make
GRQ resolve a trusted email per request, and **every existing guard (kill switch,
viewer read-only, order gate) works unchanged.**

### Auth (finance-grade end of Cam's own JWT spectrum — camwiki `jwt-authentication`)

1. iOS Google Sign-In → Google ID token.
2. **`POST /api/auth/google`** (new) — verify the ID token *cryptographically*
   (`google-auth-library`, audience = a new GRQ-iOS OAuth client; this is the vuln
   whosup closed in `e0a090b` — never trust a decoded token), check
   `roleForEmail(email) === "member"` (members-only on mobile to start; oauth2-proxy's
   allowlist is bypassed here so GRQ must enforce it itself), issue a GRQ-JWT signed
   with a new `GRQ_JWT_SECRET`.
3. Token in **iOS Keychain** (not UserDefaults — it's a finance app). **Face ID** gates
   sensitive actions (kill switch, orders, directives). Short-lived token now; add a
   refresh token before any public release.
4. iOS sends `Authorization: Bearer <grq-jwt>` to `/api/*`.

### Required backend changes (all on the existing Next.js `web` service — no new backend)

**SHIPPED 2026-06-16** — the dual-auth seam + the read API are built, deployed, and
verified in production (curl over both the Bearer and X-Forwarded-Email paths; the
existing dashboard + no-auth-403 door are unchanged). What landed:

- **`web/lib/auth-jwt.ts`** *(new)* — mint/verify the GRQ-JWT (HS256, `GRQ_JWT_SECRET`,
  `jsonwebtoken`). 30-day TTL for internal TestFlight; add a refresh token before public.
- **`web/lib/session.ts`** — `X-Forwarded-Email` still wins; else resolve email from a
  verified `Authorization: Bearer` GRQ-JWT, else `GRQ_DEV_EMAIL`. `roleForEmail` /
  `memberFromRequest` untouched. ✅
- **`web/middleware.ts`** — the 403 door now admits `/api/auth/*` (public; self-guarding)
  and the listed mobile read paths **when a Bearer is present**; everything else (chat,
  explain, quotes) stays cookie-only. No Edge JWT check. ✅
- **`web/lib/feed.ts`** *(new)* — builders that emit the exact `shared/contract.ts` shapes
  from the same Prisma source the web pages read (so the app sees the same universe / NAV /
  calls — no second source of truth). Verified against the zod contract by
  `web/scripts/verify-mobile-api.ts`.
- **GET read endpoints** *(new)* — `/api/portfolio`, `/api/market`, `/api/ideas`,
  `/api/today`, `/api/dossier/[symbol]`, and a GET on `/api/settings`. Dossier lives at
  `/api/dossier/*` (NOT `/api/stocks/*`) so it never collides with the mutating
  `/api/stocks/directive`. Each self-guards via `sessionFromRequest`. ✅
- **`POST /api/auth/google`**, **`GET /api/auth/me`** *(new)*, plus a local-only
  **`POST /api/auth/dev`** (gated by `GRQ_DEV_LOGIN=1`, 404 otherwise) so the app can be
  exercised before the OAuth client exists. ✅

**Still blocked on Cam / the Mac (the app can't fetch live until these land):**

- **nginx** — a GRQ location for the mobile API that **bypasses oauth2-proxy** (clone
  `infrastructure/nginx/conf.d/03-whosup.conf`) and never forwards a client-supplied
  `X-Forwarded-Email`. *(infra repo — without it a phone can't reach `/api/*` through the
  front door; for now point the simulator at the LAN box via the `grq.apiBase` default.)*
- **GRQ-iOS Google OAuth client** → set `GRQ_IOS_GOOGLE_CLIENT_ID` in `.env` (until then
  `POST /api/auth/google` returns 503). `GRQ_JWT_SECRET` is already generated in `.env`.

## Guardrails preserved

The gate stays in `web/lib/broker/sim.ts`. iOS is a **thin client** — it computes no
money, quotes, or guardrails; it renders the API and posts intents through the same
guarded routes. A stolen token can only do what a member could, and Face ID gates that.
No money rule ever moves to Swift.

## Dev pipeline (Cam's documented Ubuntu + Mac split — camwiki `expo-react-native-build-pipeline`)

Edit `.swift` on the Ubuntu box (Claude Code) → Mac opens `ios/GRQ.xcodeproj` (git pull
or the SSHFS mount) → build/run/archive/upload. **Native SwiftUI is simpler than the
Expo split** — no Metro, no CocoaPods, no `prebuild`; only GoogleSignIn via SPM
(resolved in Xcode on the Mac). **The Linux box cannot compile or type-check iOS** (no
iOS SDK) — builds happen on Cam's Mac; a macOS CI runner later gives the agent a
feedback loop.

## Splash

Cold launch → dollar bills rain (~1.8s, tumbling) while `AuthManager` restores the
Keychain token and calls `/api/auth/me` → bills fade into the wealth-aware greeting
(`shared/content/daily.json`, banded by P&L; Cam light / Graham dark theme). Authed →
TabView; not authed → Sign-in. Honors `accessibilityReduceMotion`. Pure presentation —
touches zero money logic. Start in SwiftUI (`TimelineView` + `Canvas`); upgrade to a
wrapped `CAEmitterLayer` if denser rain is wanted.

## iOS conventions

iOS 17+, SwiftUI, SF Symbols, MapKit not needed. Sign in with Apple only required for
the public App Store (guideline 4.8) — Google-only is fine for internal TestFlight.

## Phasing

- **P0** — `shared/contract.ts` + dual-auth seam + nginx + Google Sign-In → first
  authenticated `GET` from the app. **Backend half DONE (2026-06-16):** seam + read API
  live & verified; the iOS client now does real `URLSession` GETs with a Keychain-held
  Bearer (all `MockData` deleted). Remaining: nginx route, the GRQ-iOS OAuth client, and
  dropping the GoogleSignIn SDK in via SPM on the Mac (the `GoogleAuth` stub marks the spot).
- **P1** — read-only iOS: Splash, Today (The Daily), Portfolio, Market. **Client wired
  (2026-06-16)** — goes live the moment auth + nginx land; no view rewrites needed.
- **P2** — member actions (kill switch, order, directives) behind member role + Face ID.
- **P3** — push (APNs) + agent chat. **Push code-complete (2026-06-22, D53)** — the
  Discord event stream now fans out to APNs, per-user configurable in Settings (trades +
  risk always-on). Silent no-op until the `APNS_*` env + the Apple-portal steps land; see
  **docs/PUSH-NOTIFICATIONS.md**. Agent chat already shipped (read-only).
- **P4** — TestFlight to Cam & Graham; parity enforced from here on.

## Open items for Cam

- Clearance to make the existing-file edits above (session/middleware) when ready.
- Apple Developer account + bundle id (`ca.camerontora.grq`) — likely already have from whosup.
- New OAuth client (GRQ-iOS) + `GRQ_JWT_SECRET` in `.env`.
