# GRQ iOS

Native SwiftUI companion to grq.camerontora.ca. Framework: `docs/IOS-PLAN.md`.
Per-screen content: `docs/IOS-CONTENT.md`. Reads the shared layer in `../shared/`.

## Open it (on your Mac)

The Xcode project is generated from `project.yml` (kept out of git so the repo stays
clean and the agent can edit it from Linux). Once:

```bash
brew install xcodegen        # if you don't have it
cd ios
xcodegen generate            # writes GRQ.xcodeproj
open GRQ.xcodeproj
```

Then pick an iPhone simulator and hit Run. Requires **Xcode 15+ / iOS 17**.

> Prefer not to use XcodeGen? Make a new iOS App in Xcode (SwiftUI, bundle id
> `ca.camerontora.grq`), delete its template files, drag in the `GRQ/` folder, and add
> `../shared/content/*.json` + `../shared/tokens.json` to the target as resources.

## What works today (mock mode)

This is the **skeleton** — it builds and runs with **no backend and no sign-in SDK**, so
you can give feedback on look and flow now:

- **Splash** — dollar-bill rain → the wealth-aware greeting (from `../shared/content/daily.json`).
- **Sign in** — tap **Cam** or **Graham** to mock a session (no real auth yet). The choice
  is remembered, themes the app (Cam = light, Graham = dark), and personalizes the splash.
- **Today / Market / Portfolio / Ideas / Settings** — real screens rendering **mock data**
  (`Mock/` ) in the GRQ visual language (teal, cards, tabular money). Tap any underlined
  **term** for a plain-English definition (`glossary.json`). The kill switch shows its
  confirm + plain copy (mock).

## What's stubbed (needs the backend work in `docs/IOS-PLAN.md`)

- Google Sign-In → GRQ JWT (Keychain, Face ID) — `Services/AuthManager` has the seam + TODOs.
- Live data — `Services/APIClient` returns mock; swap to real `GET /api/*` when those land.
- The dollar bill is the 💵 emoji drawn in a `Canvas` — swap for an asset in `MoneyRain`.

## Layout (mirrors whosup)

```
GRQ/
├─ App/        GRQApp, RootView, tab bar, managers
├─ Theme/      palette (from ../shared/tokens.json), shared components
├─ Services/   Content (reads ../shared/content), AuthManager (stub), APIClient (mock)
├─ Models/     Codable structs mirroring ../shared/contract.ts
├─ Mock/       sample data so the UI is real
├─ Views/      one folder-ish per screen
└─ Resources/  Assets.xcassets
```
