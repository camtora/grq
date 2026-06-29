# GRQ — Design System & UI Consistency

The visual contract for the GRQ web app. Read this before adding or restyling a
page. The goal: every page should look like it came from the same hand — teal,
honest, lightly funny — and should re-skin correctly between **dark (default)**
and **light** themes without a single hardcoded colour.

This doc has two halves:
1. **The system** — tokens, components, and conventions that are the source of truth.
2. **The audit** — a snapshot of where pages currently deviate (2026-06-28), with
   a prioritized fix list.

The **stock page** (`app/stocks/[symbol]/page.tsx`) is the reference
implementation — when in doubt, copy what it does.

---

## 1. The system

### 1.1 Theming & colour tokens

The app ships two themes. `globals.css` defines a dark `:root` and a
`html[data-theme="light"]` block that **redefines the Tailwind teal ramp**
(`--color-teal-50…950`) plus red/emerald/amber, so the same utility classes
re-skin automatically. Surfaces use CSS vars:

| Token | Use |
|---|---|
| `--body-bg` / `--body-fg` | page background / default text |
| `--card-bg` | every card / panel surface |
| `--card-border` | every card / panel border |
| `--field-bg` | inputs, search fields, floating panels |
| `--nav-bg` | the sticky nav bar |
| `--spark-up` / `--spark-down` | sparkline / chart up-down (themed hex) |
| `--scroll-thumb(-hover)` | `.grq-scroll` thin scrollbar |

**The colour rule (non-negotiable):** only ever use the **teal / red / emerald /
amber** Tailwind ramps and the CSS vars above. Opacity suffixes (`text-teal-200/50`,
`bg-teal-400/10`) are encouraged — they read as soft tints in both themes.

**Never** use:
- raw hex in `className` or as a prop default (e.g. a chart `color="#5eead4"`) — it
  won't flip in light mode. Use a CSS var (`var(--spark-up)`) or a teal class.
- `text-white` / `text-black`, or the `gray` / `slate` / `zinc` / `neutral` / `stone`
  ramps — none of these are themed; they'll look wrong in light mode.

Accent meaning is consistent: **teal** = brand / neutral-positive, **emerald** =
gains / live, **red** = losses / rejections / halt, **amber** = caution /
SELL side / obscurity.

### 1.2 Shared components (`components/ui.tsx` + `components/PanelHeader.tsx`)

Reach for these before hand-rolling. Importing them is what keeps the app
coherent — a restyle in one file then fixes every page.

| Component | Renders | Use for |
|---|---|---|
| `Card` | `rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)]` (no padding — you add `p-5`/`p-6`) | **every** panel / surface |
| `PageHeader` | `<h1 className="text-2xl font-bold text-teal-50">` + optional `sub` (`text-sm text-teal-200/50`) + `right` slot, wrapped `mb-8 flex flex-wrap items-end justify-between gap-4` | the page's single top title |
| `PanelHeader` | `<h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">` + optional freshness badge (`live`/`fresh`) **or** a `right` slot (links/meta) | **every** section/panel heading |
| `StatCard` | label (`text-xs uppercase tracking-wider text-teal-200/50`) + big `tabular-nums` value + note; `compact` variant | stat strips (NAV, P&L…) |
| `Chip` | `rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider`, tones `teal/red/green/dim` | status pills, tags |
| `Pnl` / `Money` | `tabular-nums`, P&L colour-coded | any cents value |
| `EmptyState` | centered `Card p-10` | "nothing here yet" states |

`PanelHeader` gained an optional `right` slot (2026-06-28) so non-stock pages can
hang a link/meta line ("ledger →", "journal →", a timestamp) off the header while
the stock page keeps its freshness badges. `right` takes precedence over the
live/fresh badge.

### 1.3 Typography & headings

Two heading levels, two components — that's it.

- **Page title** → `PageHeader` (`<h1>`, `text-2xl font-bold text-teal-50`). One per page.
- **Section heading** → `PanelHeader` (`<h2>`, `text-sm font-semibold uppercase tracking-wider text-teal-200/50`), sitting **outside** the card.

**The canonical "panel" shape** (copied from the stock page):

```tsx
<div className="space-y-2">
  <PanelHeader>Valuation vs peers</PanelHeader>
  <Card className="p-5">…</Card>
</div>
```

The header lives **outside** the `Card`, separated by `space-y-2`. Do **not** put a
section title inside the card with a `border-b`.

**Third (legitimate) level — the in-card eyebrow.** A small label *inside* a card,
above a block of body copy, uses `text-xs font-bold uppercase tracking-[0.2em]
text-teal-300/70` (e.g. "GRQ first-pass read" / "The bottom line" on the stock
page, "What would change our mind" in `ConfidenceLevers`). This is intentional and
distinct from a section heading — keep using it for in-card eyebrows.

**The rule that matters:** a *section heading* (a title that sits **outside** a
card, labelling the panel) must be `PanelHeader`. Using the eyebrow style
(`text-xs … tracking-[0.2em] text-teal-300/70`) as a section heading is the
deprecated pattern that caused the drift — that's what got swept on 2026-06-28.
Don't **hardcode `PanelHeader`'s classes inline** either; import the component so
future restyles propagate.

**Intentional exceptions** (hero headers, not bugs): the Today masthead
("GRQ Daily", `app/page.tsx`) and the Portfolio greeting (`app/portfolio/page.tsx`)
are deliberate page-specific heroes and are exempt from `PageHeader`.

### 1.4 Layout & navigation

- **Page shell:** content lives in `<main>` (max-width/padding come from the root
  layout — don't re-declare them per page).
- **Back-nav:** a sub-page (one not reachable from the global header nav) starts
  `<main>` with a plain text link:
  ```tsx
  <Link href="/…" className="text-xs text-teal-300 hover:underline">← today</Link>
  ```
  Lowercase, leading "←", names the destination. **Not** a pill or button. Primary
  header-nav destinations (Today, Portfolio, Watchlist, Universe, The Hunt, Browse,
  Smart Money, Reports, Settings) don't need one.
- **Section spacing:** `space-y-2` between a `PanelHeader` and its `Card`;
  `space-y-6` / `gap-4`–`gap-6` between stacked panels; `mb-6`/`mb-8` under the
  page header.
- **Grids:** the standard two-column dashboard is
  `grid items-start gap-4 lg:grid-cols-3` with a `lg:col-span-2` main column and a
  `lg:col-span-1` rail. A rail panel that should match the main column's height
  uses `lg:relative lg:self-stretch` + an inner `lg:absolute lg:inset-0` flex
  column (see Portfolio's Activity rail).

### 1.5 Buttons & controls

There is **no shared `Button` component** — buttons are styled inline, which is why
sizing has drifted (see audit). The canonical control is the header KillSwitch:

```
rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider
```

`px-2.5 py-1` is the house size (the dominant padding in the codebase). A
borderless variant adds `border border-[color:var(--card-border)]`; tabs/toggles add
`bg-teal-400/15 text-teal-200` when active. **Avoid** oversized CTAs
(`rounded-xl`, `px-4`/`px-5`, `py-2`, `text-sm`+). Inline action links use
`text-xs text-teal-300 hover:underline`.

> **Backlog candidate:** extract a `Button` component (+ `variant`/`size`) to end
> the padding drift. See §2.

### 1.6 Money & numbers

Money is integer **cents** end-to-end (never floats). Render via `Money` / `Pnl`
or `money()`/`signedMoney()` from `lib/money`, always with `tabular-nums` so columns
align. P&L is colour-coded by sign (`pnlClass`). USD uses the `usd()` helper / `US$`
prefix.

---

## 2. The audit (snapshot 2026-06-28)

> **Status: RESOLVED 2026-06-28.** Everything in §2/§3 below has been fixed in one
> pass — section-heading sweep, back-nav, `<details>`→`Card`, the `Button`
> component + browse migration, and the theme-safe chart colour. The tables are
> kept as the record of what was changed. The one deliberate hold-out is noted
> inline (reports/[id]).

Buttons-colour-cards were broadly healthy across the app; **section headings** and
**back-nav** were the two real consistency problems. Today + Portfolio + the
`/traffic` section map were aligned earlier on 2026-06-28; the items below were the
rest.

### 2.1 Section headings — the big one

Pages whose section headings don't use `PanelHeader`:

| Page | Where | Current style | Action |
|---|---|---|---|
| `market/browse` | `:195` | deprecated `tracking-[0.2em] text-teal-300/70` | → `PanelHeader` |
| `market/watchlist` | `:178`, `:207` (an `<h3>`) | deprecated + inline-canonical | → `PanelHeader` |
| `universe` | `:232`, `:250`, `:263` | deprecated `tracking-[0.2em] text-teal-300/70` ×3 | → `PanelHeader` |
| `market/smart-money` | `:122`, `:165` | `Chip` + bare `<span>` as headings | → `PanelHeader` |
| `bulls` | `:69`, `:77` | inline-hardcoded canonical classes | → `PanelHeader` |
| `options-desk` | `:67`, `:75` (+ inner `<div>` subheads) | inline-hardcoded canonical classes | → `PanelHeader` |
| `settings` | `:145`, `:204` | inline `<div>` canonical classes | → `PanelHeader` |
| `tokens` | `:95`, `:120`, `:165`, `:216` | inline-hardcoded `<h2>` | → `PanelHeader` |
| `traffic` | `:105`, `:127`, `:171`, `:218` | `font-bold` + `text-teal-200/60` (off-shade) | → `PanelHeader` |
| `reports/day/[date]` | `:86`, `:98`, `:127`, `:151` | deprecated `tracking-[0.2em] text-teal-300/70` | → `PanelHeader` |
| `how-it-works` | `:219`,`:240`,`:254`,`:273`,`:286`,`:299`,`:317` | inline `<div>` canonical classes ×7 | → `PanelHeader` |
| `journal` | `JournalSection.tsx:78` (`<summary>`) | deprecated `tracking-[0.2em] text-teal-300/70` | → `PanelHeader` |
| `stocks/[symbol]` (ref) | one `tracking-[0.2em]` + one inline-canonical instance | minor | tidy when nearby |

Two clusters: (a) the **deprecated** `tracking-[0.2em] text-teal-300/70` style
(browse, watchlist, universe, reports/day, journal summary, + 1 on the stock page),
and (b) pages that **hardcode the right classes** instead of importing `PanelHeader`
(bulls, options-desk, settings, tokens, how-it-works). Both should route through the
component.

### 2.2 Back-nav missing on sub-pages

Present & correct: `accounts`, `stocks/[symbol]`, `tokens`, `traffic`,
`reports/[id]`, `race/[date]`.

Fixed:
- **`journal`** → added `← portfolio`.
- **`how-it-works`** → added `← settings` (on all tab branches).

**Settled rule for the labs pages:** `race` / `bulls` / `options-desk` sit in the
LABS header-nav group, so they're treated as **primary header destinations — no
back-nav** (same as Portfolio / Today). Their *detail* pages do get one (e.g.
`race/[date]` → `← the race`).

### 2.3 Hand-rolled cards via `<details>`

`race:41`, `bulls:93`, `options-desk:91/102/111` use
`<details className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-4">`
— a duplicated `Card` by hand. Wrap the `<details>` in `<Card>` (or add a
`<Card as="details">` affordance) so the surface stays single-sourced.

### 2.4 Headers rendered inside cards

`accounts` (`AccountCard`, the institution/value row with `border-b`) and `journal`
(`JournalSection` row header) put the panel's title **inside** the card. Per §1.3 the
title should sit outside via `PanelHeader`. Lower priority — these are list-item
captions, not section headings — but worth aligning when touched. (`PersonalLane`
has the same in-card caption; acceptable since it sits under a proper `PanelHeader`.)

### 2.5 Hardcoded colours

- `options-desk:70/76` — chart series fallback `"#5eead4"`. Replace with
  `var(--spark-up)` or a teal token so it themes.

Otherwise colour compliance is clean across all audited pages — no stray
gray/slate/white/black or hex found elsewhere.

### 2.6 Button-size drift

No shared component → paddings vary: `px-2.5 py-1` (canonical, 22×) but also
`px-3 py-1.5` (7×, e.g. journal filter chips, reports tabs, traffic window selector,
Today nav), `px-2 py-1` (6×), `px-2.5 py-2` (5×). One oversized CTA:
`market/browse:250` (`rounded-xl px-4 py-2 text-sm`). Fix the outlier; extracting a
`Button` component (§1.5) is the durable fix.

### 2.7 Minor title deviations

- `reports/[id]:31` uses a custom `<h1 className="text-2xl font-bold text-teal-50">`
  — same classes as `PageHeader` but not the component. Swap to `PageHeader`.
- `portfolio` greeting `<h1>` is `text-3xl font-semibold` — intentional hero (§1.3),
  leave as-is.

---

## 3. Fix list — DONE (2026-06-28)

1. ✅ **Heading sweep** — every §2.1 deviation now routes through `PanelHeader`
   (market/browse, watchlist, universe, smart-money, bulls, options-desk, settings,
   tokens, traffic, reports/day, how-it-works; journal's `<summary>` recoloured).
2. ✅ **Back-nav** — added to `journal` + `how-it-works`; labs-pages rule settled (§2.2).
3. ✅ **`<details>` cards** — wrapped in `Card` on race / bulls / options-desk.
4. ✅ **`Button` component** — added to `components/ui.tsx` (`variant` solid/ghost,
   `rounded-lg px-2.5 py-1 text-xs`); migrated the `market/browse` outlier. Wider
   migration of the remaining inline buttons is left as opportunistic follow-up.
5. ✅ **Theme-safe chart colours** — `options-desk` `#5eead4` → `var(--spark-up)`.
6. ◻︎ **In-card captions** (`accounts` / `journal` list-item headers) → align to
   `PanelHeader` when next touched. Low priority; deferred.

These were presentation-only — no behaviour, money rules, or agent paths touched.
