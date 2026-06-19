# Handoff: "The Hunt" — GRQ Stock Discovery Feed Redesign

## Overview
"The Hunt" is the AI-powered stock-discovery page in the **Get Rich Quick (GRQ)** app. The user briefs the AI ("find me stocks that are ready to pop") and GRQ web-searches North America for under-the-radar names, returning a ranked feed of candidates with a thesis, live price data, a confidence score, and a heat score for each.

This redesign replaces the original flat 2-column card grid with a higher-energy, more scannable feed built around a **heat ranking system**, **live data-viz** (sparklines + price charts), **bold confidence/heat meters**, and a **bigger, punchier hunt bar**. The original is included as `original_before.png` for comparison.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes that show the intended look, layout, and behavior. **They are not production code to copy directly.** The `.dc.html` file uses an internal HTML prototyping runtime (`<x-dc>`, `<sc-for>`, `<sc-if>`, `renderVals()`); none of that should ship.

Your task is to **recreate these designs in the GRQ codebase's existing environment** (React/Vue/etc.), using its established components, data layer, charting library, and styling system. If no front-end environment exists yet, choose the most appropriate framework and implement there.

## Fidelity
**High-fidelity.** Colors, typography, spacing, gauges, sparklines, and interactions are final and intended to be matched closely. Exact tokens are listed in the **Design Tokens** section. The one caveat: the dummy stock data in the prototype is illustrative — wire the real feed in its place.

## Three Directions (pick one to ship, or A/B test)
The prototype contains **three alternative layouts** for the results feed, switchable via the toolbar tabs. They share the same header, hunt bar, directed-hunt banner, toolbar, color system, and per-stock data — only the results layout differs. Decide with the team which to ship (the switcher itself is a prototyping aid, not a shipping feature).

| Direction | Name | Best for | Screenshot |
|-----------|------|----------|------------|
| **A** | Heat Board | Default. Dense horizontal rows, ranked by heat, every metric visible at a glance | `screens/heat-board.png` |
| **B** | Top Pick + Grid | A hero "hottest pick" with a big chart, then a 3-col card grid below | `screens/top-pick.png` |
| **C** | Scanner / Terminal | Power-user dense table, one stock per row, terminal aesthetic | `screens/scanner.png` |

**Recommendation:** ship **A (Heat Board)** as the default — it best satisfies the goals (heat ranking, strong hierarchy, live viz, scannability) while staying readable. Consider C as a "compact/table" view toggle for power users.

---

## Shared Chrome (all directions)

### Header (sticky top bar)
- Full-width, `padding: 16px 40px`, bottom border `1px solid rgba(90,200,180,0.10)`.
- **Left:** logo lockup + primary nav.
  - Logo: 34×34 rounded-square (`border-radius:10px`), gradient `linear-gradient(150deg,#34e0c4,#1c8f7c)`, glyph "↗" in `#06120f`, glow `box-shadow:0 0 20px rgba(52,224,196,0.35)`. Wordmark "GET **RICH** QUICK" — "RICH" in accent `#34e0c4`, rest `#a9c6be`, Space Grotesk 700, 16px, letter-spacing 0.5px.
  - Nav items (13.5px): Today, Portfolio, Watchlist, Smart Money, Universe, **The Hunt** (active), Browse. Inactive `#82a39b`; active pill has gradient bg `linear-gradient(180deg,rgba(52,224,196,0.18),rgba(52,224,196,0.05))`, border `1px solid rgba(52,224,196,0.4)`, text `#7af0da`, weight 600.
- **Right (13px):** Reports, Settings, Chat (accent). Then two status pills + avatar:
  - **HALT TRADING** pill — red system. bg `rgba(255,93,107,0.08)`, border `rgba(255,93,107,0.3)`, text `#ff8b96`, 7px pulsing dot `#ff5d6b` (animation `pulseDot`, 2s infinite). This reflects a real kill-switch state — wire to actual trading status.
  - **IBKR-PAPER** pill — accent system. bg `rgba(52,224,196,0.07)`, border `rgba(52,224,196,0.28)`, text `#7af0da`. Reflects the connected brokerage/account mode.
  - Avatar — 34×34 circle, conic-gradient ring, initials "JK", 2px `#0d1a18` border.

### Hunt Bar (hero)
The focal point. Centered, `max-width:1340px`, `padding:0 40px`, `margin-top:30px`.
- Gradient **border** via 2px padding wrapper: `linear-gradient(120deg,rgba(52,224,196,0.55),rgba(155,124,255,0.35),rgba(255,122,69,0.3))`, `border-radius:18px`. An inner overlay animates opacity (`huntGlow`, 4s) for a living-glow effect.
- Inner panel: `border-radius:16px`, bg `linear-gradient(150deg,#0e1f1c,#0a1614)`, `padding:22px 22px 22px 26px`, flex row gap 18px.
  - Leading 46×46 icon tile "⌖", bg `rgba(52,224,196,0.12)`, border `rgba(52,224,196,0.3)`, accent glyph.
  - Text input: transparent, 18px Hanken Grotesk 500, color `#eafff9`, placeholder *"Brief the hunt — e.g. 'emerging medical names about to post trial data'"*. Sub-caption 12.5px `#5d7b74`: *"GRQ web-searches North America for under-the-radar names that fit your brief. Leave it blank to go broad."*
  - **HUNT button:** `padding:14px 30px`, `border-radius:12px`, Space Grotesk 700 15px, letter-spacing 0.8px, text `#04110d`, bg `linear-gradient(180deg,#5af0d6,#22c2a8)`, shadow `0 6px 24px rgba(52,224,196,0.35), inset 0 1px 0 rgba(255,255,255,0.3)`, label "⚡ HUNT". Submits the brief.

### Directed-Hunt Banner
Shown when a brief is active. `margin-top:16px`, `padding:13px 18px`, `border-radius:13px`, bg `linear-gradient(90deg,rgba(255,122,69,0.10),rgba(255,122,69,0.02))`, border `rgba(255,122,69,0.22)`. 9px orange dot `#ff7a45` with glow. Copy: **"Directed hunt:"** (orange `#ffb18d`) + the brief in `#eafff9` 700 + muted hint to refresh for a broad hunt.

### Toolbar
`margin: 24px auto 16px`, flex, wrap.
- **Left:** segmented switcher (the 3 directions). Container bg `rgba(255,255,255,0.03)`, border `rgba(120,200,180,0.12)`, `border-radius:14px`, `padding:5px`. Each tab `padding:9px 16px`, `border-radius:10px`, Space Grotesk 600 13.5px. Active: border `rgba(52,224,196,0.5)`, bg `linear-gradient(180deg,rgba(52,224,196,0.2),rgba(52,224,196,0.05))`, text `#7af0da`. Inactive: transparent, `#6c8a83`. *(This switcher is a prototype affordance — see note above.)*
- **Right (12.5px `#6c8a83`):** "**6** hot names" · "sorted by **HEAT ▾**" (accent, clickable sort) · "↻ refresh" pill (accent-tinted).

---

## Per-Stock Data Model
Every result, in all three directions, renders from one record. Fields the UI needs:

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `ticker` | string | `"WELL"`, `"HPS.A"` | |
| `name` | string | `"Welltower Inc."` | issuer name |
| `exchangeSector` | string | `"NYSE · Healthcare"` | shown as `tag` |
| `price` | string | `"$206.65"`, `"C$0.42"` | currency-aware |
| `changePct` | number | `-98`, `12` | % change; sign drives color |
| `confidence` | number 0–100 | `53` | AI conviction → gauge |
| `heat` | number 0–100 | `88` | "ready to pop" score → ranking + meter + color |
| `thesis` | string | (long) | AI rationale; clamped in feed |
| `thesisWordCount` | number | `289` | "read all (N words)" |
| `sparkSeries` | number[] | `[42,40,...,24]` | 30-day price series (~12 pts in mock; use real daily closes) |
| `watching` | boolean | `true` | watchlist membership |

**Derived in the view layer:**
- `rank` — assign by sorting results **descending by `heat`**; display zero-padded (`01`, `02`…). Rank 1 gets a "HOTTEST" badge (`isTop`).
- `initials` — ticker minus dots, first 2 chars (`HPS.A` → `HP`).
- `heatColor` — see Color section; a function of `heat`.
- `changeColor` — green `oklch(0.82 0.15 162)` if `changePct ≥ 0`, else red `oklch(0.68 0.2 22)`.
- `changeStr` — `(pos?'+':'')+changePct+'%'`.

---

## Component Specs

### Confidence Gauge (signature element)
A radial ring meter; the hero metric the team wanted to elevate from a corner pill.
- SVG, viewBox `0 0 52 52`. Track circle r=22, stroke `rgba(120,220,200,0.13)`. Progress circle r=22, stroke = accent `#34e0c4`, `stroke-linecap:round`, `transform:rotate(-90 26 26)`, glow `drop-shadow(0 0 4px rgba(52,224,196,0.55))`.
- Arc length: `dasharray = (confidence/100 · 2π·22) + ' ' + (2π·22)` → circumference ≈ 138.23.
- Center text: confidence number (JetBrains Mono 700), label "CONF"/"CONFIDENCE" below in `#6c8a83`.
- Rendered sizes: Heat Board 58px; Scanner 46px; Grid card 50px; Hero 92px.

### Heat Meter + Score
- Label "HEAT" (9px, letter-spacing 1.5px, `#6c8a83`) + score (JetBrains Mono 700, colored by `heatColor`).
- Bar: track `height:7px` (5px in Scanner, 10px in hero), `border-radius:4px`, bg `rgba(255,255,255,0.06)`. Fill width `heat%`, bg `linear-gradient(90deg,#34e0c4, heatColor)`.

### Sparkline (30-day trend)
- SVG, `preserveAspectRatio:none`, color = `changeColor`.
- Build from `sparkSeries`: normalize min→max into the box height; `M/L` path for the line (`stroke-width:2`, round caps); a second path closing to the baseline for a 0.13-opacity area fill; an end-dot `circle` r≈2.8 with `drop-shadow(0 0 5px currentColor)`.
- Hero (Direction B) uses a larger 460×150 version with two faint horizontal gridlines at y=38 and y=94.

### Action buttons
- **full dossier →** — primary. `border-radius:9–11px`, text `#04110d`, bg `linear-gradient(180deg,#5af0d6,#26c8ae)`. Opens the stock's full dossier (out of scope for this page).
- **watch toggle** — "☆ watch" / "★ watching". Off: bg `rgba(255,255,255,0.03)`, border `rgba(120,200,180,0.18)`, text `#9fc0b8`. On: bg `rgba(52,224,196,0.14)`, border `rgba(52,224,196,0.45)`, text `#7af0da`, weight 600. In compact layouts collapses to a 34×34 icon-only star.
- **✕ dismiss** — removes the card from the feed; muted `#4f6c66`.

---

## Direction A — Heat Board (recommended default)
Vertical stack of full-width rows, `margin-bottom:14px` each. Row: `border-radius:16px`, bg `linear-gradient(150deg,#10211e,#0a1513)`, border `rgba(90,200,180,0.12)`, `padding:20px 26px 20px 28px`, flex row align-center gap 20px. A 4px left rail painted `heatColor` with matching glow.
Row columns left→right: **Rank** (58px — big `heatColor` number + "RANK") · **Identity** (216px — HOTTEST badge if top, logo tile + ticker + name, then price/change/tag) · **Thesis** (flex, clamped 3 lines, "▸ read all" link) · **Sparkline** (146px + "30-DAY TREND") · **Heat meter** (120px) · **Confidence gauge** (62px) · **Actions** (118px — dossier + watch). ✕ dismiss top-right.

## Direction B — Top Pick + Grid
**Hero** (`#1` stock): `border-radius:22px`, bg `linear-gradient(140deg,#13251f,#0a1513)`, border `rgba(255,122,69,0.26)`, ambient shadow `0 0 70px rgba(255,122,69,0.07)`, 3px top accent bar. Two columns: left = "▲ HOTTEST PICK" badge + rank/heat, 50px logo + 38px ticker, name·tag, 30px price + change, full thesis (unclamped), action row (dossier / watch / dismiss). Right (480px) = big 460×150 price chart panel + a row with the 92px confidence gauge and a large heat score + meter + "read all".
**Grid below:** `display:grid; grid-template-columns:repeat(3,1fr); gap:18px`. Each card: 3px top accent bar, logo+ticker+name with price/change top-right, full-width sparkline, a row of 50px gauge + heat meter, 2-line clamped thesis, then dossier + icon-watch. Responsive: collapse to 2 cols ~1024px, 1 col ~640px.

## Direction C — Scanner / Terminal
Single panel, `border-radius:16px`, bg `linear-gradient(160deg,#0e1f1c,#0a1413)`. CSS grid table, columns `128px 196px 104px 76px 132px 70px 1fr 116px`, gap 14px. Sticky-feel header row (10px JetBrains Mono, `#5d7b74`, bg `rgba(0,0,0,0.15)`): HEAT ▾ · TICKER · LAST · CHG · 30-DAY · CONF · THESIS · (actions). Body rows `padding:15px 22px`, bottom border `rgba(90,200,180,0.07)`, **hover** `background:rgba(52,224,196,0.05)`. Compact inline heat meter, logo+ticker (+ "HOT" tag on #1), right-aligned mono price/change, mini sparkline, 46px gauge, 2-line thesis, "dossier" + icon-watch.

---

## Interactions & Behavior
- **Run a hunt:** typing in the hunt bar updates the brief; HUNT (or Enter) submits → triggers the AI web-search → populates results + shows the directed-hunt banner with the brief text. Empty brief = broad hunt.
- **Refresh / go broad:** "↻ refresh" re-runs without a brief.
- **Sort:** "HEAT ▾" toggles sort key (heat is default; expose change%, confidence as alternates).
- **Watch toggle:** optimistic add/remove from watchlist; flips button state.
- **Dismiss:** removes the card from the current feed (client-side; ideally remembered so it doesn't return next hunt).
- **full dossier →:** navigates to the stock's dossier page.
- **read all (N words):** expands the thesis inline (or opens dossier).
- **Direction switch:** swaps the results layout only — chrome, data, and scroll position should persist.

### Animations (keep subtle)
- `pulseDot` — 2s infinite, expanding box-shadow ring on the HALT dot.
- `huntGlow` — 4s ease-in-out, opacity 0.4↔0.85 on the hunt-bar gradient overlay.
- `floatGlow` — 15s/19s ambient background blobs drifting (decorative, behind content; gate behind a reduced-motion / perf check).
- Honor `prefers-reduced-motion: reduce` — disable the looping ambient/glow animations.

## State Management
- `brief: string` (hunt input), `activeBrief: string | null` (submitted), `results: Stock[]`, `sortKey: 'heat'|'change'|'confidence'`, `direction: 'A'|'B'|'C'` (or your shipped single view), `loadingHunt: boolean`, per-stock `watching`, dismissed-IDs set.
- **Data fetching:** submitting a brief calls the GRQ hunt/AI-search endpoint → returns the result records (model above). Price `sparkSeries` should be real daily closes from your market-data source. Watch toggle hits the watchlist API.

---

## Design Tokens

### Color
| Token | Value | Use |
|-------|-------|-----|
| Background base | `#07110f` | page |
| Surface | `linear-gradient(150deg,#10211e,#0a1513)` | cards/rows |
| Hunt panel | `linear-gradient(150deg,#0e1f1c,#0a1614)` | hunt bar inner |
| Accent (primary) | `#34e0c4` | brand teal, gauges, CTAs |
| Accent bright | `#5af0d6` → `#22c2a8` | CTA gradient |
| Accent text | `#7af0da` | active/links on dark |
| Warn / hot | `#ff7a45`, `#ff9a6e`, `#ffb18d` | hottest, directed hunt |
| Danger | `#ff5d6b`, `#ff8b96` | halt trading |
| Text primary | `#eafff9` / `#d6efe8` | headings / body |
| Text secondary | `#b6d4cc`, `#a8c7bf` | thesis |
| Text muted | `#6c8a83`, `#5d7b74` | labels/captions |
| Text faint | `#4f6c66` | dismiss |
| Hairline border | `rgba(90,200,180,0.10–0.12)` | dividers/cards |
| Positive change | `oklch(0.82 0.15 162)` | green |
| Negative change | `oklch(0.68 0.2 22)` | red |
| **Heat color (fn)** | `oklch(0.79 0.165 H)` where `H = 175 − (heat/100)·150` | high heat → warm/orange, low heat → teal. Drives rank number, meter fill end, logo tile, left rail. |

### Typography
- **Space Grotesk** (400–700) — display/brand: tickers, big numbers, rank, CTAs, nav active.
- **Hanken Grotesk** (400–700) — UI/body: thesis, captions, inputs. Default sans.
- **JetBrains Mono** (400–700) — all numerics: prices, %, heat, confidence, table values.
- Scale (px): hero ticker 38 · rank number 30 · ticker 17–19 · price 14–30 · body/thesis 12.5–14.5 · captions 11–12.5 · micro-labels 9–10 (letter-spacing 1–1.5).

### Spacing / Radius / Effects
- Container `max-width:1340px`, gutters `padding:0 40px`.
- Radii: rows/cards 16px · hero 22px · hunt outer 18 / inner 16 · pills/buttons 8–12px · meters 4px.
- Card borders 1px hairline; CTAs and glows use teal `rgba(52,224,196,0.3–0.35)` shadows.
- Gaps: feed rows 14px, grid 18px.

## Assets
- **No image assets.** Logos are initial-tiles (derived from ticker); all charts/gauges/icons are SVG or unicode glyphs (↗ ⌖ ⚡ ▲ ★ ☆ ✕ ↻ ▸ ▾). Replace glyph icons with your icon library's equivalents if preferred.
- **Fonts:** Space Grotesk, Hanken Grotesk, JetBrains Mono (Google Fonts) — self-host or use your app's font pipeline.
- `original_before.png` — the page before redesign (reference only).
- `screens/*.png` — rendered captures of each direction.

## Files
- `The Hunt.dc.html` — the prototype (all 3 directions + logic). Open in a browser to interact. The `renderVals()` block at the bottom shows exact gauge/sparkline math and the dummy data.
- `original_before.png`, `screens/heat-board.png`, `screens/top-pick.png`, `screens/scanner.png`.
