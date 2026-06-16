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

- **`web/lib/session.ts`** — if no `X-Forwarded-Email`, resolve email from a Bearer JWT
  verified with **`jsonwebtoken`** (the same lib whosup uses; runs in the Node route
  runtime). `roleForEmail` / `memberFromRequest` untouched. *(edit — needs Cam's go)*
- **`web/middleware.ts`** — exclude the mobile API paths from the 403-HTML door (like
  `/api/health` already is); those routes self-guard via `session.ts`. No token check at
  the edge, so no `jose` and no Edge-runtime concern. *(edit — needs go)*
- **New GET read endpoints** — the web pages read Prisma directly in server components
  (`/today`, `/portfolio`, `/market`, `/ideas`, `/stocks/[symbol]` have no JSON API).
  iOS needs GET routes returning the `shared/contract.ts` shapes. *(new files)*
- **`POST /api/auth/google`**, **`GET /api/auth/me`** (name + totalPnlCents +
  contributionsCents for the splash greeting). *(new files)*
- **nginx** — a GRQ location for the mobile API that **bypasses oauth2-proxy** (clone
  `infrastructure/nginx/conf.d/03-whosup.conf`) and never forwards a client-supplied
  `X-Forwarded-Email`. *(infra repo)*

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
  authenticated `GET` from the app.
- **P1** — read-only iOS: Splash, Today (The Daily), Portfolio, Market.
- **P2** — member actions (kill switch, order, directives) behind member role + Face ID.
- **P3** — push (APNs) + agent chat.
- **P4** — TestFlight to Cam & Graham; parity enforced from here on.

## Open items for Cam

- Clearance to make the existing-file edits above (session/middleware) when ready.
- Apple Developer account + bundle id (`ca.camerontora.grq`) — likely already have from whosup.
- New OAuth client (GRQ-iOS) + `GRQ_JWT_SECRET` in `.env`.
