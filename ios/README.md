# GRQ iOS

Native SwiftUI companion to grq.camerontora.ca. Framework: `docs/IOS-PLAN.md`.
Per-screen content: `docs/IOS-CONTENT.md`. Reads the shared layer in `../shared/`.

## Open it (on your Mac)

The project file is committed (like whosup) — just open it:

```bash
open ios/GRQ.xcodeproj
```

Pick an iPhone simulator → **Run** (⌘R). Requires **Xcode 15+ / iOS 17**. The simulator
needs no signing; for a real device, set your team under Signing & Capabilities
(`DEVELOPMENT_TEAM` is currently Cam's, from whosup).

> `project.yml` is kept as a regeneration aid: `xcodegen generate` rebuilds an
> equivalent `GRQ.xcodeproj` from it. The committed project file is the source of
> truth; you don't need XcodeGen to open or build.

## What works today (mock mode)

Builds and runs with **no backend and no sign-in SDK**, so you can give feedback on look
and flow now:

- **Splash** — dollar-bill rain → the wealth-aware greeting (from `../shared/content/daily.json`).
- **Sign in** — tap **Cam** or **Graham** to mock a session (no real auth yet). The choice
  is remembered, themes the app (Cam = light, Graham = dark), and personalizes the splash.
- **Today / Market / Portfolio / Ideas / Settings** — real screens rendering **mock data**
  (`Mock` data in `Services/Services.swift`) in the GRQ visual language (teal, cards,
  tabular money). Tap any underlined **term** for a plain-English definition
  (`glossary.json`). The kill switch shows its confirm + plain copy (mock).

## What's stubbed (needs the backend work in `docs/IOS-PLAN.md`)

- Google Sign-In → GRQ JWT (Keychain, Face ID) — `Services/Services.swift` has the seam + TODOs.
- Live data — `APIClient` returns mock; swap to real `GET /api/*` when those land.
- The dollar bill is the 💵 emoji drawn in a `Canvas` — swap for an asset in `Views/Splash.swift`.

## Layout (mirrors whosup)

```
GRQ/
├─ App/        GRQApp, RootView, tab bar, managers
├─ Theme/      palette (from ../shared/tokens.json), shared components
├─ Services/   Content (reads ../shared/content), AuthManager (stub), APIClient (mock), MockData
├─ Models/     Codable structs mirroring ../shared/contract.ts
├─ Views/      one screen per file (Splash, SignIn, Today, Market, Portfolio, Ideas, Settings)
└─ Resources/  Assets.xcassets

GRQ.xcodeproj   committed; bundles ../shared/content/*.json + ../shared/tokens.json as resources
```
