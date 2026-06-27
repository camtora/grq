# Data Sources — Tiered Taxonomy & Source Scoring

Proposed by Cam & Graham, 2026-06-12. This is the long-range map of every data category
the agent could consume, with a GRQ-specific read on each tier, and the **source scoring
system** that decides which of them earn the agent's trust. Individual tiers get built
incrementally — the scoring system is what makes adding them safe.

## The source scoring system (the core idea)

GRQ already requires source attribution on every thesis (`sources[]`, AGENT-SPEC learning
loop). The scoring system closes the loop:

1. **Cite** — every thesis lists its sources, each taggable with a tier (`tier1:price`,
   `tier7:news`, `signal:rsi`…).
2. **Grade** — every retro scores each cited source: `+1` pointed the right way, `−1`
   misleading, `0` neutral/unused.
3. **Score** — rolling hit-rate per source and per tier, computed at the weekly review and
   journaled as a **source scoreboard** (visible on the dashboard eventually).
4. **Act** — the agent's context includes the scoreboard's top and bottom performers.
   Persistently weak sources get demoted ("distrust this"); strong ones get promoted into
   the morning routine. Adds/drops of whole tiers are proposed in weekly reviews and
   approved by humans, like any strategy change.

Storage: structured `SourceGrade` table + `grade_sources` agent tool — **build plan lives in
`docs/PHASES.md` → Phase 2.6a** (planned 2026-06-12). Signal families
from the signals layer enter the same scoreboard — an RSI signal competes for trust with
the Wall Street Journal on equal terms.

## The ten tiers

_Status updated 2026-06-17 — most of this is LIVE on **FMP Ultimate** (the paid backbone) +
free Bank-of-Canada **and FRED** feeds. Tiers feed both the stock pages and the agent's
decision context (so they move calls, not just displays). **US/CA asymmetry to know:** the
stack is SEC/FMP-centric, so US names have RICHER structured coverage than pure-TSX ones
(insider Form 4, 13F, fuller fundamentals/earnings); the remaining gaps are pure-TSX
structured insider (free sources are walled — Tier 4) and US macro (closed 2026-06-17 via
FRED). The fund now trades CAD **and** USD (see `docs/DECISIONS.md` D34)._

| Tier | Category | GRQ priority | Status |
|---|---|---|---|
| 1 | Price/volume (OHLCV) | **Now** | **Live** — delayed Yahoo quotes + 1y bars (signals) + a **real-time on-page ticker** via FMP Ultimate (`<LiveQuote>` polls `/api/quotes` ~2.5s; stock page). FMP TSX real-time vs delayed = verify at market open |
| 2 | Fundamentals | **Now** | **Live** — FMP profile/cap/sector + analyst price-target consensus + buy/hold/sell grades + peer comparison |
| 6 | Earnings intelligence | **Now** | **Live** — FMP next-earnings date + EPS/rev estimates, on the stock page **and** injected into the agent's context (catalyst awareness) |
| 7 | News | **Now** | **Live** — FMP per-stock + market news, plus the agent's web research |
| 9 | Macroeconomic | **Now** | **Live (CA + US)** — **Bank of Canada Valet** (overnight rate / 5y GoC / CPI / USD-CAD) **+ US via FRED** (Fed funds `DFF` / 10y Treasury `DGS10` / US CPI YoY `CPIAUCNS`); both in the agent context + macro strip (`lib/macro.ts`, `FRED_API_KEY`) |
| 5 | Institutional ownership | Mid | **Live (US-listed)** — FMP 13F summary on the stock page; empty for pure-TSX issuers |
| 4 | Insider activity | Mid | **Live (US) / web-research (CA)** — FMP Form 4 + nightly **OpenInsider** scrape cover US **and cross-listed CA** names (Smart Money board + the stock-page coverage map go green when buys exist). **Pure-TSX has no free structured feed** — canadianinsider = Cloudflare-walled, SEDI = session-gated (confirmed 2026-06-17) — so the agent web-researches those per dossier; INK (paid) deferred |
| 3 | Options data (as signal only) | Later | Not wired — never-trade; US-centric flow |
| 8 | Social sentiment | Later | Deliberately late — noisy |
| 10 | Alternative data | Maybe | Mostly paid; revisit at scale |

## Data freshness & refresh cadence

"Live" above means *the feed is wired*, not *how fresh it is on screen*. Freshness varies by data
type — and the most important distinction is **live market data vs. GRQ's research-gated judgment**:
the FMP market panels reflect the market *now*, while GRQ's call only changes when the agent
re-researches the name. The stock page is `dynamic = "force-dynamic"` and `fmpGet` uses
`cache: "no-store"` (`lib/fmp.ts`), so the FMP panels are re-fetched on **every page load**.

| Data on the page | Source | How it refreshes | Research-gated? |
|---|---|---|---|
| **Price ticker** (on-page) | FMP `/api/quotes` | **Streaming** — client polls ~2.5s, badge goes "stale" if it freezes (`<LiveQuote live>`) | no |
| Quote for position math | Yahoo delayed | server, DB-cached (`lib/broker/quotes.ts`) | no |
| **Analyst ratings / price targets** | FMP | **Live — fetched fresh every page load** (no-store) | no |
| **Earnings** (next/last + estimates) | FMP | **Live — every page load** | no |
| **Valuation vs peers** | FMP | **Live — every page load** | no |
| **Institutional / 13F** | FMP | **Live fetch every load**, but 13Fs are filed **quarterly** (~45-day lag) — the *fetch* is live, the *data* is not | no |
| Signals (technical) | computed from bars | per load, but bars refresh **nightly** (tracked) / on-demand | no |
| Recent news | `NewsArticle` store (FMP fallback) | news pipeline **~90 min** (`docs/NEWS-AND-EVENTS.md`) | no |
| Smart money board | FMP 13F/insider/congress + OpenInsider | runner ingest **daily** (13F only on a new filing) | no |
| Macro strip | BoC Valet + FRED | **30-min** poll + delta→event (`lib/macro.ts`) | no |
| Stored fundamentals (sector / industry / cap / exchange) | FMP profile | runner backfill, **stale after 7 days**, rolling (`lib/fundamentals.ts`) | no |
| Market Base Layer (screen + Haiku tag) | FMP screener + Haiku | batch (manual now → nightly planned; `docs/MARKET-BASE-LAYER.md`) | no |
| **GRQ's call / stance / targets / bottom line** | agent dossier (`JournalEntry`) | **only when (re-)researched** — a new dossier | **YES** |
| Related names (knowledge graph) | derived from the DB | per load (DB-derived; `docs/KNOWLEDGE-GRAPH.md`) | no |

**UI convention (the live dot):** the pulsing emerald dot — first used beside the price ticker —
marks panels whose data is **pulled fresh from FMP on each page load** (analyst ratings, price
targets, earnings, valuation vs peers, institutional). It is *not* placed on research-gated panels
(GRQ's call / bottom line), historical panels (the record, trades), or store-backed panels (news,
smart money) — those carry their own dated timestamps so the freshness is honest either way. The
13F panel's dot is qualified in-tooltip (live fetch, quarterly source data). `components/LiveDot.tsx`.

### Tier 1 — Price & volume (the foundation)
Open/high/low/close/volume → trend, momentum, technical indicators (feeds the signals layer).
**Sources:** [Polygon.io](https://polygon.io), [Alpha Vantage](https://www.alphavantage.co),
[NASDAQ Data Link](https://data.nasdaq.com). ~~IEX Cloud~~ (shut down Aug 2024).
**GRQ lens:** we already have delayed quotes via Yahoo's chart endpoint, which also serves
historical OHLCV for free — that's the signals-layer data source before any paid API.
Polygon/Alpha Vantage are US-focused; TSX coverage is the constraint to check before paying.

### Tier 2 — Fundamentals ("what is this company worth?")
Revenue/earnings growth, margins, FCF, debt, insider ownership → long-term holds, growth
identification. **Sources:** [SEC EDGAR](https://www.sec.gov/edgar.shtml), Financial
Modeling Prep. **GRQ lens:** EDGAR is US filings — TSX issuers file on
**SEDAR+** (sedarplus.ca); cross-listed names (SHOP, ABX…) appear in both. Yahoo's
quoteSummary modules expose basic fundamentals free as a starting point.

### Tier 3 — Options market data
Open interest, implied volatility, put/call ratio, unusual activity, gamma exposure →
institutional positioning, volatility expectations. Graham's example names (NVDA, PLTR,
AMD) are US-listed. **GRQ lens:** the fund will *never trade options* (hard guardrail) —
but options flow as a *signal about the underlying* is legitimate input, entering through
the signals layer like everything else. Relevant mostly once the US market unlocks (Phase 5);
Canadian single-name options markets are thin.

### Tier 4 — Insider activity
Insider buying/selling, director purchases; **clusters of buying** are the strong signal.
**Sources:** SEC Form 4, [OpenInsider](https://openinsider.com). **GRQ lens:** the Canadian
equivalent is **SEDI** (sedi.ca) — clunky but public; canadianinsider.com aggregates it
usably. High value-per-effort for a TSX fund; good mid-term add.

### Tier 5 — Institutional ownership
13F filings, fund holdings, new/increased positions → smart-money tracking. **GRQ lens:**
13Fs are quarterly and ~45 days stale — fine for swing context, useless for timing. They
cover US-traded securities including TSX cross-listings.

### Tier 6 — Earnings intelligence
Dates, guidance changes, analyst revisions, call transcripts — *stocks often move more on
guidance than results*. **Sources:** [Seeking Alpha](https://seekingalpha.com),
[Motley Fool transcripts](https://www.fool.com/earnings-call-transcripts/). **GRQ lens:**
already promoted into the Phase 2 spec (earnings awareness): calendar tracking + post-results
transcript summaries journaled for retros.

### Tier 7 — News
Company news, launches, M&A, regulatory — summarize, score sentiment, detect themes.
**Sources:** [Reuters](https://www.reuters.com), [Bloomberg](https://www.bloomberg.com),
plus GRQ's seed list (BNN, CBC, NYT, Toronto Star, WSJ, MSNBC). **GRQ lens:** live today
via web search; the scoring system is what separates the outlets that earn their place.

### Tier 8 — Social sentiment
[Reddit](https://www.reddit.com), [X](https://x.com), [Stocktwits](https://stocktwits.com) —
mention volume, sentiment, velocity. **GRQ lens:** deliberately late-tier: noisy, easily
gamed, and mostly US-name-centric. If added, velocity-of-mentions on *holdings* (risk
signal) before any buy signal.

### Tier 9 — Macroeconomic
Rates, inflation, unemployment, GDP, money supply. **Sources:**
[FRED](https://fred.stlouisfed.org), [BLS](https://www.bls.gov). **GRQ lens:** for a TSX
fund add **Bank of Canada** (rates, CAD) and **Statistics Canada** (CPI, GDP, jobs). The
morning macro sweep covers this qualitatively today; FRED/BoC valet APIs are free and easy
when we want it structured.

### Tier 10 — Alternative data
App rankings, web traffic, job postings, Glassdoor, shipping, card spending.
**Sources:** [Similarweb](https://www.similarweb.com), [Sensor Tower](https://sensortower.com).
**GRQ lens:** where funds find unique edges — and where they spend real money. Mostly paid,
mostly US-coverage. Revisit if the fund ever has an overhead budget that makes a data edge
rational; until then the agent can approximate slices of it through web research when a
thesis demands.

## Build order recommendation

1. **Tier 1 history** (free, unblocks Graham's signals layer) → 2. **Tier 9 structured**
(BoC/FRED, free) → 3. **Tier 6** (already spec'd) → 4. **Tier 4 via SEDI** → 5. Tier 2
fundamentals → 6. the rest on merit, each entering through the scoreboard on probation.
