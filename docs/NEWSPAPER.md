# The Daily — the Today page as a newspaper

Cam, 2026-06-13: the Today page was "boring." The remit: a **daily paper you want to come
back to every day**, built for **~10-minute consumption** — a headline, the day's NAV story,
the top movers, names worth a look, a picture, and a quote or joke. *"Don't remove the
information — it should be there if I want to read it."* So: progressive disclosure, digest
up top, full detail one expand away.

## Editions — one page, three faces (by ET clock)

One living daily edition, **auto-selected by time of day**, not separate modes to toggle —
like a real paper that updates morning → midday → evening:

| Edition | When (ET) | Lead | Voice |
|---|---|---|---|
| **Morning** | pre-9:30 | the game plan, watchlist, overnight/macro, earnings due today | forward — "here's the plan" |
| **Midday** | 9:30–16:00 | intraday NAV so far, today's movers, trades as they land | live — "here's what's happening" |
| **Evening** | 16:15+ | the close: day P&L, NAV start→finish, top hitters, tomorrow | recap — "here's what happened" |

Weekend/holiday → a recap **"Weekend Edition."** The edition maps onto the agent's existing
session cadence (9:00 research · midday check-ins · 16:15 EOD), so the content is mostly
*already generated* — the newspaper is an editorial layer over it, not new agent work.

## Sections

- **Masthead** — *GRQ Daily* wordmark, edition + date, NAV headline + day P&L, a daily
  quote/joke (`lib/dailyquote.ts`, deterministic per day).
- **The Tape** — the day's NAV, opened → finished, vs-XIC (`NavSnapshot`, `Sparkline`).
- **Lead story** — the agent's wrap (EOD `Report`) or the morning plan if pre-close.
- **Market Movers** — biggest moves across the tracked universe (the "5 that made/lost the
  most"). Universe-scoped in v1; a whole-market movers feed is a later upgrade.
- **Top Hitters** — your holdings by day move.
- **On the Radar** — watchlist + freshly-researched names; **expected upside %** lights up
  once the agent sets price targets (i.e. once it trades).
- **The day as it happened** — the full journal timeline, preserved.

## Imagery roadmap

Cam OK'd **logos-first, editorial photos later** (2026-06-13).

- **v1 (shipped):** monogram avatars (`components/StockAvatar.tsx`) — colored ticker discs,
  zero external dependency.
- **v2:** real company logos (a logo service by domain, monogram as the fallback).
- **v3:** editorial photography — an agent-chosen keyword image with a **human veto**;
  deferred because auto-picked photos fail in funny-then-not-funny ways.

## Status

**Evening Edition MVP — shipped 2026-06-13** (`web/app/today/page.tsx`): masthead, The Tape,
lead story, Market Movers, Top Hitters, On the Radar, daily quote, full timeline preserved.
All soak-safe — zero order-path changes.

**Next:** Morning/Midday faces · company logos · expected-return on On-the-Radar (needs
trade targets) · whole-market movers feed · the literacy glossary + agent explainers
(`docs/LITERACY.md`).
