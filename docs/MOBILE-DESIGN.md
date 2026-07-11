# GRQ Go — Mobile Design System

The visual contract for the Expo app (`mobile/`). Sibling of `docs/DESIGN.md` (the web
contract) — same soul (teal, honest, lightly funny), adapted to a phone. Read this before
adding or restyling any screen. **Consistency is the product requirement**: every screen
should look like it came from the same hand.

## 1. Theming — member-keyed, not device-keyed

Two palettes in `constants/theme.ts`, ported from the native `Theme.swift` / web tokens.
**The signed-in member picks the theme: Cam = light, Graham = dark** (`me.theme` from
`/api/auth/me`). The device scheme is only the fallback before sign-in. `usePalette()`
resolves this — never call `useColorScheme()` directly in a screen.

**The colour rule (same as web, non-negotiable):** every colour comes from the palette
object `p` (or `brandAccent`). No raw hex in components, no gray/white/black literals.
Meaning is consistent: **teal** = brand/neutral, **emerald (`p.pos`)** = gains/live,
**red (`p.neg`)** = losses/halt, **amber** = caution/obscurity (use `#f59e0b`-family via
a palette addition if needed — don't inline it).

## 2. Typography

Two families, loaded in the root layout (`@expo-google-fonts/*`):

| Role | Font | How |
|---|---|---|
| Display — masthead, page titles, section headers, big numbers | **System (SF)** — the same face as the website's headers | `fontFamily: 'System'` + `fontWeight` ('600'–'900') |
| UI/body — everything else | **Inter** 400/500/600/700/800 | `F.reg` `F.med` `F.semi` `F.bold` `F.black` |

RN rule: custom fonts ignore `fontWeight` — always set the exact `fontFamily` token.
Numbers that align in columns (money, %) add `fontVariant: ['tabular-nums']` (Inter).

Scale: page title 17 (in the header bar) · section title 15 · body 14 · secondary 12 ·
caption 11 · micro 10. Money/hero numbers go bigger (20–28, display family).

## 3. The chrome — every screen, no exceptions

Every tab screen renders inside `<Screen title="...">` (`components/Chrome.tsx`):

- **Top bar**: the **bull bubble** top-left (34, circular, accent ring + glow — the
  web's floating launcher moved up here) → the member's **Ask Alfred** thread
  (`/chat`); the **page title centered** (System 800, 17); top-right the
  **notifications bell**, the **chat icon** (unread red dot; → `/messages`, the
  Cam↔Graham thread), then the **signed-in member's avatar** (28, circular, accent
  ring) → **Settings** (`/settings` — me/sign-out, kill switch, risk dial, fees,
  Currency & FX approvals, notifications link, the soak gate, system).
- Body: `ScrollView` with pull-to-refresh (`RefreshControl` tinted `p.accent`) unless
  the screen is a list that scrolls itself.
- Background `p.bodyBg` everywhere; content padding 16 horizontal.

The splash and sign-in screens are the only chrome-less surfaces.

## 4. Surfaces & sections

- **Card**: `p.cardBg` background, 1px `p.cardBorder`, radius 16, padding 12–16
  (`components/Chrome.tsx` `Card`). Every panel sits on one. Lists inside cards use
  hairline dividers (`p.cardBorder`).
- **Section header** (`SectionTitle`): uppercase, System 800, 13, `p.textPrimary`,
  letter-spacing 1 — with an optional lighter descriptor (`sub`) after it, like the
  web's `SectionTitle`/`SectionSub`. Sits **outside** the card, 8pt above it.
- Section spacing: 24 between sections, 8 header→card.
- **Row** pattern (movers/hitters/earnings): logo 32 → symbol (Inter 600, `p.accentText`)
  over muted name (11) → right-aligned numbers (tabular).
- **Every stock listed anywhere links to `/stock/[symbol]`** (Cam 2026-07-03). Plain
  rows: the whole row is the Pressable. Rows with their own tap behavior (e.g. the
  Watchlist's expand-on-tap): the *symbol* is the link, underlined (web §1.7 — the
  symbol is the affordance). Back always returns to the originating screen
  (`router.push` history; the stock route is a hidden tab screen so the bottom nav
  stays visible).
- **Segmented toggle** (`Segmented` in Chrome.tsx): the house two-way switch — pill
  container on `p.cardBg`, active segment `p.accent` @ 15% with `p.accentText` label.
  Used for Portfolio's Alfred | Personal split; reuse it for any in-page view switch.

## 5. Money & numbers

Integer **cents** end-to-end (house rule #4). Render only via `lib/format.ts`
(`money`, `signedMoney`, `pctFromBps`, `signedPctFromBps`) — never `toFixed` in a
component. P&L colours by sign: `p.pos` / `p.neg` / `p.textMuted` for flat.

## 6. Data

- All data through `services/api.ts` (`api<T>()`, GRQ-JWT Bearer) + `useApi` hook
  (`services/hooks.ts`) — loading / error / pull-to-refresh in one place.
- Wire types live in `services/types.ts`, hand-mirrored from `shared/contract.ts`
  (import-from-shared is a later metro-config follow-up). Additive server fields are
  optional here — render nothing when absent, never crash.

## 7. Voice

GRQ's voice everywhere: honest, plain-English, lightly funny — but money rules are
never funny. Empty states get a line of personality ("All cash — patience is a
position."), errors state what happened plainly.

## 8. The five pages

Today · Portfolio · The Wire · Watchlist · More — tab bar in that order, Ionicons
outline set, active tint `p.accent`. Each page is designed for the phone (not a port
of the web layout), but reuses the web's *content order* where it exists.

**The jump-search is NOT a tab** (Cam 2026-07-03): it's the floating round button
bottom-right above the tab bar (`components/SearchOverlay.tsx`, mirroring the web's
launcher) — tap → scrim + autofocused field + tappable result list over the covered-
names index. More holds settings/kill-switch/labs (building out).

- **Today** — the newspaper (shipped; see `components/today/sections.tsx`).
- **Portfolio** — split **Alfred | Personal** via `Segmented`, defaulting to Alfred.
  Alfred = NAV hero → the Tape → the book (cash + positions) → latest fund-level
  briefing. Personal = each member's SnapTrade accounts, read-only, with the honest
  footer that Alfred can neither see nor trade them (D97).

## 9. iPad — one app, responsive (not a separate project)

GRQ Go is a **universal** Expo app: the same binary/codebase runs on iPhone and
iPad (`app.json` → `ios.supportsTablet: true`; iPhone stays portrait-locked while
iPad gets all orientations via `UISupportedInterfaceOrientations~ipad`). There is
**no separate iPad project** — iPad is a layout target, handled by responsive
primitives, never a fork.

**Size classes are width-driven, not device-driven** (`constants/layout.ts`
`useResponsive()`), so iPad Split View / Slide Over collapse to the phone layout
automatically:

| class | width | layout |
|---|---|---|
| `compact` | `< 700` | iPhone / iPad slide-over → single column, phone layout |
| `medium` | `700–999` | iPad portrait / split → centered reading column, 2-up grids |
| `expanded` | `>= 1000` | iPad landscape / full-screen → wide, master-detail |

**The two primitives (both in `components/Chrome.tsx`):**

- **`<Bounded>`** — the centered content column. `Screen`/`SubScreen` wrap header +
  body in it, so on a phone it's a full-width pass-through and on an iPad content
  caps (reading column 760, or the wider grid bound with `wide`) and centers —
  nothing sprawls edge-to-edge. The dossier (`stock/[symbol]`) rolls its own chrome
  and so wraps `<Bounded>` itself.
- **`<Grid min={…}>`** — a self-measuring (`onLayout`) card grid: one column on a
  phone, 2–3 up on an iPad. Used by the Hunt (Top Pick tiles) and Smart Money
  (portfolio cards + boards). Pass items that stretch to fill their cell.

**`wide` screens** (`Screen`/`SubScreen wide`) widen the column to the grid bound for
master-detail / two-column pages; wrap any prose inside a plain `<Bounded>` so text
stays readable. Shipped `wide` layouts:

- **Watchlist** — master-detail on `expanded`: list on the left, the selected name's
  detail pane (Alfred's read + targets + lazy earnings/analyst extras + actions) on
  the right. Phone keeps expand-in-place. The row detail is one `WatchDetail`
  component reused both ways (no dossier refactor).
- **Today** — broadsheet on `expanded`: masthead + strips span the top, story
  sections split into two ordered columns (reading order kept per column).
- **Portfolio (Alfred)** — NAV hero + Tape stay in the reading column; the book and
  the desk sit side-by-side on `expanded`.
- **Dossier (`stock/[symbol]`)** — the hero + Alfred's-call verdict span full width
  as the headline; every reference panel below (bottom line, position, trades, price,
  analyst, earnings, signals, 13F, news, …) flows into a `<Masonry columns={2}>` on
  `expanded`, one column on a phone. Distribution is round-robin (not height-balanced)
  — reassign panels or add measurement if a column runs long.

**Full-app coverage (every screen is built-for-iPad, not just the tab bar):**
- **Card grids** (`<Grid>`): Hunt (Top Pick), Smart Money, Browse (two screener
  columns), Chess, Chess-board (ripple cards), Race (scorecard), Bulls, Reports,
  Report-card (3-up tiles), the glossary, Traffic ("who uses what"), Options
  (Experiment).
- **Masonry / two-column** (`<Masonry>` / flex split): the dossier, Today, More menu,
  Day-Lab, Short-Lab, Race-day (champion ◀▶ challenger), the Options calculator
  (knobs ◀▶ output), the Options Desk (arm ◀▶ arm).
- **Master-detail**: Watchlist (list ◀▶ detail).
- **Centered story column**: The Wire (each card capped, not stretched).

**Intentionally left centered** (a single reading/sequential flow reads best in the
760 column — this is a design call, not a gap): every Learn lesson/exam/course
syllabus, the Learn hub (a 2-up catalog), Reports detail, About GRQ, Tokens. The six
**modal** screens (Settings, Chat, Messages, Notifications, Notification-settings,
Accounts) render as centered iOS sheets on iPad and need no change.

**The phone is untouched everywhere**: all wide behavior gates on `isWide`/`isTablet`;
`<Bounded>`/`Grid`/`Masonry` collapse to the exact phone tree on `compact`. Final
sizing (column widths, the 1000px `expanded` threshold, Today's/dossier's column
balance) is meant to be **eyeballed on the device** — the structure is here; tune the
numbers on an iPad.
