# GRQ Go — iPad Responsive Pass

**Date:** 2026-07-10 · **Branch:** `feat/the-race` · **Status:** code complete, `tsc --noEmit` clean, **not yet built/seen on a device**

A full pass to make **GRQ Go** (the Expo/React Native app in `mobile/`) render as a
first-class iPad app. This is the changelog for that work. The durable design contract
lives in **`docs/MOBILE-DESIGN.md` §9** — read that for the "how it works"; this file is
the "what changed and why."

---

## TL;DR

- **Same app, not a new project, not a WebView.** GRQ Go is a *universal* Expo binary —
  the same codebase/TestFlight build runs on iPhone and iPad. iPad is a layout target,
  handled by responsive primitives, never a fork.
- **Approach: native, uses-the-width** (Cam's call). The iPad gets dense, multi-column,
  master-detail layouts built from the *native* components — it deliberately does **not**
  mimic the website pixel-for-pixel.
- **The phone is untouched.** Every wide behavior gates on `isWide`/`isTablet`; on a phone
  the new primitives collapse to the exact previous tree. Verified by typecheck + a
  spacing review of every changed screen.
- **A native rebuild is required** to see it (see [Native / config changes](#native--config-changes)).

---

## The approach

The website (`web/`, Next.js) and GRQ Go (React Native) share the **backend/data** (same
APIs, same wire contract) but **zero UI components**. So "web-like on iPad" was built as a
*responsive native* app — grids, masonry, master-detail, two-column pages — not a port of
the web pages. Native feel, push, gestures, and offline all stay intact.

Size classes are **width-driven** (not device-model driven), so iPad Split View / Slide
Over automatically collapse to the phone layout:

| class | width | layout |
|---|---|---|
| `compact` | `< 700` | iPhone / iPad slide-over → single column, phone layout |
| `medium` | `700–999` | iPad portrait / split → centered column, 2-up grids |
| `expanded` | `>= 1000` | iPad landscape / full-screen → wide, master-detail |

---

## New primitives

### `mobile/constants/layout.ts` (new file)
`useResponsive()` → `{ width, height, sizeClass, isTablet (≥700), isWide (≥1000),
landscape, maxContentWidth, maxGridWidth, gutter }`. Width-driven. Plus `gridColumns()`
helper. This is the single source of responsive truth.

### `mobile/components/Chrome.tsx` (additions)
- **`<Bounded wide?>`** — centered max-width column (reading column 760, or the wider grid
  bound with `wide`). `Screen`/`SubScreen` wrap header + body in it, so on a phone it's a
  full-width pass-through and on an iPad content centers instead of stretching edge-to-edge.
- **`<Grid min={N} gap={N}>`** — self-measuring (`onLayout`) card grid: 1 column on a
  phone, 2–3 up on an iPad. Applies `gap` in **both** single- and multi-column, so callers
  should not add their own inter-card margin (that double-spaces).
- **`<Masonry columns={N} gap style>`** — round-robin distribution of a stack of panels
  into `columns` independent columns (an expanded panel doesn't gap its neighbour).
  ⚠️ The `columns={1}` path applies **no gap** — single-column callers pass
  `style={{ gap }}` or rely on child `SectionTitle` margins.
- **`wide` prop** on `Screen`/`SubScreen` — widens the content column to the grid bound for
  grid / two-column / master-detail screens. Wrap any prose inside a plain `<Bounded>` so
  text stays readable. No-op on a phone (`maxGridWidth` == screen width on `compact`).

---

## Native / config changes

**GRQ Go commits its native `ios/` project** (it is *not* gitignored), so `app.json`
changes do **not** propagate on build. iPad enablement therefore required editing the
native files directly — all done here:

| File | Change |
|---|---|
| `mobile/app.json` | `ios.supportsTablet: true`; `UISupportedInterfaceOrientations~ipad` (all 4 orientations) — kept in sync with the native files below |
| `mobile/ios/GRQGo.xcodeproj/project.pbxproj` | `TARGETED_DEVICE_FAMILY = "1,2"` (both Debug + Release) — was `"1"` (iPhone only) |
| `mobile/ios/GRQGo/Info.plist` | added `UISupportedInterfaceOrientations~ipad` (portrait + both landscapes); iPhone stays **portrait-locked** via the existing global key |

### ⚠️ This needs a NATIVE rebuild, not a metro reload
The current TestFlight build is iPhone-only → on an iPad it runs letterboxed in
iPhone-compatibility mode and the responsive code never sees iPad dimensions.

**To build:**
1. Sync the branch to the Mac (`scripts/grqgo-mac-sync.sh`).
2. Open **`ios/GRQGo.xcworkspace`** in Xcode (run `pod install` if needed), pick an
   **iPad Pro** simulator, Run — or Archive for TestFlight.
3. **Do NOT `expo run:ios` / `expo prebuild`** — it regenerates the native project and
   wipes the manual AppDelegate patch. Build the committed `ios/` project directly.
4. Because JS loads from metro, once this one native build exists all layout tweaks
   hot-reload live. (Archive embeds JS from *local* metro — keep metro running when you
   archive, or the bundle goes stale.)

---

## Layout principles (Cam, 2026-07-10)

Two rules that override "just bound everything," learned from looking at the wide layout
on the device:

1. **Navigation chrome anchors to the screen edges, not the content column.** The header
   (Ask-GRQ bull top-left; bell + messages + avatar top-right; centered title), the
   `SubScreen` back-bar, the dossier's back/share bar, and the search FAB (bottom-right)
   all span the **full screen width**, pinned to the corners — independent of content
   width. Only the *body* content centers. (The header/bars are plain full-width rows with
   their own horizontal padding; they are NOT wrapped in `<Bounded>`.)
2. **A single content piece above a two-column split spans the full width of those
   columns.** On a `wide` screen, don't cap the hero/header/chart region to the 760 reading
   column while the columns below span ~1200 — it reads as unbalanced. The above-columns
   region uses a plain full-width `<View>` (keeping its `gap`); the reading-column
   `<Bounded>` is reserved for genuine single-flow prose (below-columns footnotes/explainers,
   Learn/Ask reading tabs). Applied to Today, Portfolio, Day-Lab, Short-Lab, Desk, Options
   (Calculator/Experiment tabs), Chess, Chess-board, Race.

## Per-screen changes

Every change gates on `isWide`/`isTablet`; the phone path is byte-identical.

### Foundation (lifts every screen)
| File | Change |
|---|---|
| `components/Chrome.tsx` | `Bounded`/`Grid`/`Masonry` primitives + `wide` prop; header, body, and sub-page shell now centered-bounded (kills edge-to-edge stretch app-wide) |
| `components/SearchOverlay.tsx` | jump-search capped to a centered ~560 command palette on iPad |
| `constants/layout.ts` | new — `useResponsive()` + `gridColumns()` |

### Bespoke wide layouts
| Screen | File | Change |
|---|---|---|
| Watchlist | `app/(tabs)/watchlist.tsx` | **master-detail** on `expanded` — list left, selected name's detail pane (Alfred's read, targets, lazy earnings/analyst extras, actions) right; phone keeps expand-in-place. One `WatchDetail` component reused both ways |
| Today | `app/(tabs)/index.tsx` | **two-column broadsheet** — masthead + strips span the top, story sections split into two ordered columns |
| Portfolio | `app/(tabs)/portfolio.tsx` | NAV hero + Tape centered; **book ◀▶ desk** side-by-side on `expanded` |
| Dossier | `app/(tabs)/stock/[symbol].tsx` | **Mirrors the web stock page's section order** (2026-07-11): hero → price chart → a combined **"bottom line" card** (verdict + gauge + targets ▏ Why + what-would-change) → a **position stat strip** (`StatCell` grid) → grouped `<Grid>` data sections (analyst/targets/earnings/13F/signals · options+social · peers/related/smart-money/value-chain · trades/scoreboard/news/record/coverage). Currently 2-up in the ~760 reading column (rolls its own chrome). |
| The Wire | `app/(tabs)/wire.tsx` | full-screen paging story cards **centered at ≤520**, not stretched across the screen |
| Hunt | `app/(tabs)/more/hunt.tsx` | Heat Board → **2 independent columns** (masonry, so an expanded row doesn't gap its neighbour); Top Pick tiles → Grid |
| Smart Money | `app/(tabs)/more/smart-money.tsx` | portfolio cards + leaderboards → Grid; removed per-card `marginBottom` (moved to Grid gap) to keep phone spacing exact |
| Browse | `app/(tabs)/more/browse.tsx` | **two screener columns** (contiguous halves) on `isTablet`; phone keeps one dense list card |
| Desk (Options A/B) | `app/(tabs)/more/desk.tsx` | arm cards **side-by-side** on `isWide`; prose in `Bounded` |
| Options portal | `app/(tabs)/more/options.tsx` | calculator splits **knobs ◀▶ output**; Experiment cards → Grid; Learn/Ask left centered |
| Day-Lab | `app/(tabs)/more/day-lab.tsx` | controls centered; chart/log/panels → Masonry |
| Short-Lab | `app/(tabs)/more/short-lab.tsx` | dashboard header centered; 7 panels → Masonry |
| Chess | `app/(tabs)/more/chess.tsx` | board cards → Grid; prose in `BoundedIf` |
| Chess board | `app/(tabs)/more/chess-board/[id].tsx` | narrative centered; ripple-play cards → Grid |
| Race | `app/(tabs)/more/race.tsx` | scorecard tiles → Grid (removed per-tile `marginBottom`, moved to gap) |
| Race day | `app/(tabs)/more/race-day/[date].tsx` | champion ◀▶ challenger side-by-side (Masonry) on `isTablet` |
| Bulls | `app/(tabs)/more/bulls.tsx` | leaderboard cards → Grid (2-up) |
| Report card | `app/(tabs)/more/report-card.tsx` | stat tiles 2-up (phone) → **3-up** on `isTablet` (`flexBasis`) |
| Reports | `app/(tabs)/more/reports.tsx` | report cards → Grid across tabs (empty-states left full-width) |
| More menu | `app/(tabs)/more/index.tsx` | four sections → Masonry 2-col on `isTablet` |
| Glossary | `app/(tabs)/more/learn-glossary.tsx` | term cards → Grid (2-up) |
| Traffic | `app/traffic.tsx` | "who uses what" per-person cards → Grid |

### Intentionally left centered (design call, not a gap)
Prose / single-flow screens read best in the 760 column: **every Learn lesson / exam /
course syllabus, the Learn hub** (a 2-up catalog), **Reports detail, About GRQ, Tokens**.
The six **modal** screens (Settings, Chat, Messages, Notifications, Notification-settings,
Accounts) render as centered iOS sheets on iPad and need no change.

---

## Phone-parity guarantee & how it was verified

- **Gating:** all wide behavior is behind `isWide`/`isTablet`; on `compact`, `Bounded` is a
  full-width pass-through and `Grid`/`Masonry` render a single column.
- **The double-spacing trap:** a card with its own `marginBottom` inside a `Grid` (which
  also applies `gap`) double-spaces on the phone. Found and fixed in Smart Money and Race
  (margins removed, spacing moved to the Grid gap).
- **Verification available on this host:** `tsc --noEmit` (clean across all changed files)
  + a manual spacing review of every changed screen. **Visual sizing must be eyeballed on
  the device** — the iPad simulator can't run on the Linux dev host.

---

## On-device tuning checklist (all pure-number tweaks)

- [ ] The `1000px` `expanded` threshold (`BP.expanded` in `constants/layout.ts`) — does the
      landscape/portrait break feel right on the 13"?
- [ ] `Grid min` widths (mostly `320`) — bump toward `360` where 3-up feels cramped.
- [ ] Today's + the dossier's **round-robin column balance** — reassign panels if a column
      runs long.
- [ ] Watchlist list-pane width (`360`) and the master-detail split.
- [ ] The Wire story-card cap (`520`) and Desk/Options split proportions.
- [ ] Modals in a form sheet — confirm they read well (expected fine).

---

## Build inventory

New: `mobile/constants/layout.ts`. Modified: `mobile/app.json`,
`mobile/components/{Chrome,SearchOverlay}.tsx`, `mobile/ios/GRQGo.xcodeproj/project.pbxproj`,
`mobile/ios/GRQGo/Info.plist`, `docs/MOBILE-DESIGN.md`, and the 22 screen files listed
above. Built with parallel subagents for the labs/games/lists/admin screens; all diffs
reviewed against the phone-identical rule.
