# Knowledge Graph — company relationships, made visible

**Status (2026-06-26):** **Slice 1 SHIPPED** (web deploy) — the on-the-fly "Related names" panel is
live on the stock page. Slices 2–3 (persist + Today lane + agent input) remain planned. Follow-on to
the News & events layer (D81, `docs/NEWS-AND-EVENTS.md`).

**The vision (D81 discussion):** a relationship graph over the names GRQ tracks, so an event on one
name *lights up everything connected to it* — "a TSMC headline lights up everything with an edge to
TSMC." The news/events pipeline is the event stream; this graph is the propagation layer that turns a
single-name signal into a set of related-name signals.

This doc records the design decisions (the four questions below) and the milestone ladder. It is the
companion to `docs/NEWS-AND-EVENTS.md` (the prerequisite, shipped) and `docs/DECISIONS.md` D81.

---

## The four design decisions

### 1. Edge source → a **blend of three real edges + a weak sector floor**, all from data we already pay for

No new data source for v1. The signal hierarchy (and the research that backs it) maps onto data that is
already in the DB or one cached FMP call away:

| Edge | Source (already live) | Cost | Strength | Coverage |
|---|---|---|---|---|
| **`peer`** | `fmpPeerComparison()` (`lib/fmp.ts`) — already fetched on every stock page | 1 cached FMP call | **Strong** — a connected-firm / shared-analyst-coverage proxy (~1.68%/mo alpha in the literature) | US-strong, TSX-thin |
| **`coheld`** | Prisma join over `PortfolioHolding` → `PortfolioSnapshot.cik` (the 5 roster filers) | 0 — pure DB | **Strong but sparse** — only fires on names a marquee filer holds; crowding cuts both ways | US-centric |
| **`comention`** | `NewsArticle.symbolsJson` (Haiku already tags co-mentioned tickers; **nothing reads it today**) | 0 — pure DB | **Strong & dynamic** — co-mention momentum spillover is a documented, distinct factor | CA + US, news-driven |
| **`sector`** | `UniverseMember.sector` / `.industry` (stored, refreshed by the runner) | 0 — pure DB | **Weakest** — research: lead-lag pairs "did not always form along industry lines"; floor only | dense, both |
| ~~`supplychain`~~ | **no FMP endpoint** — would need Bloomberg/Refinitiv/Alpaca + ETL | $$$ | strong but unavailable | — |

**Why a blend, not one source:** the three real edges are complementary — `peer` is the broad always-on
backbone, `coheld` is a sparse high-conviction overlay, `comention` is the live layer that actually
delivers the "headline lights up its neighbors" use case. `sector` is the cheapest *and the weakest*
signal, so it is a low-weight fallback, never used alone.

**Why not curated:** hand-maintained edges go stale and don't scale; the literacy pillar wants
provenance, not a human's guess.

**Why skip supply chain:** it is the only edge requiring new spend, and the graph delivers ~80% of its
value without it. Revisit only if a clear need emerges.

**Honest caveat (bake into the UI copy):** `peer` + `coheld` are US-strong; for pure-TSX names,
`comention` + `sector` carry more weight. The panel must degrade gracefully, not pretend.

### 2. Edge typing & weight → **type by provenance, symmetric v1, an explainable 0–100 weight**

- **Type edges by their SOURCE** (`peer` · `coheld` · `comention` · `sector`), NOT by invented semantics
  (competitor / supplier / subsidiary). We have no data to derive those honestly; provenance typing keeps
  every edge explainable — a figure the app can't explain is a bug (CLAUDE.md).
- **Symmetric (undirected) for v1.** Lead-lag *direction* is real (co-mention momentum leads/lags) but
  needs return-timing analysis we don't have cheaply. Mark directional co-mention as a future
  enhancement; don't fake it now.
- **Weight = a derived 0–100 score** (same instinct as `lib/heat.ts` — a web-side derived score, no
  schema/agent change), blending a per-source base weight with evidence strength:

  | Source | Base | Evidence bonus |
  |---|---|---|
  | `comention` | 70 | `+min(25, mentions × 5)` with **recency decay** (older co-mentions fade) |
  | `peer` | 65 | `+` FMP rank closeness (nearer peer ranks higher) |
  | `coheld` | 60 | `+min(25, overlappingFilers × 10)`, weighted by each filer's `pctOfPort` |
  | `sector` | 25 | flat floor, no bonus |

  When a related name has **multiple sources**, its final score = `max(sourceScores) + 10` corroboration
  bonus (≥2 distinct sources), clamped to 100. Keep every contributing source for the "why".
- **Every edge carries a human-readable `why`** — e.g. `"FMP peer · co-held by Buffett, Ackman · 4
  stories together (30d)"`. This is the literacy pillar applied to relationships.

### 3. What it powers → **stock-page panel first; Today lane second; agent last; never the gate**

The binding constraint in this project is Cam's shared Claude Max quota — every Opus token competes with
interactive Claude Code. So the order is cheapest-and-most-validatable first:

1. **Stock-page "Related names" panel (Slice 1).** Zero Opus cost, pure web read, validates edge quality
   with human eyes before any agent spend. Mirrors how Smart Money and News shipped — human surface
   first, agent input second, never the gate.
2. **Today "this story also touches…" lane (Slice 2).** Driven by `comention` edges; still web-only.
   This is the slice where precomputing edges into a table pays off.
3. **Agent context input (Slice 3, maybe).** The agent already hunts peers via WebSearch each check-in,
   so this is the highest-cost / lowest-marginal-value move. If done, feed a **Haiku-summarised compact
   line**, not raw edges, to protect the quota.

### 4. Guardrail posture → **an input the agent weighs, NEVER the gate** (settled by CLAUDE.md rule 1)

Identical to news / smart-money / The Race. The graph may surface related names, propagate relevance,
and *at most* schedule a check-in (the same ceiling as the news wakeup). It can **never** place, size,
block, or **auto-promote a neighbour into the tradeable universe** — promotion still requires the
liquidity screen + conviction bar + the §6 order gate, all humans-only. The §6 validator is untouched.

---

## UI placement (locked with Cam, 2026-06-26)

On the stock page (`app/stocks/[symbol]/page.tsx`), the "Valuation vs peers" row is reworked:

- **Before:** a 3-col grid — `Valuation vs peers` (2/3) + `Scoreboard` (1/3).
- **After:** a 2-col grid — **`Valuation vs peers` (½) | `Related names` (½)**. The peers table drops to
  half width (it was wasting space at 2/3), and the new panel fills the other half.
- **Scoreboard relocates** out of that row, down into the right rail **below the Trades panel** (it's a
  compact panel that fits the 1/3 rail).

The Related-names panel shows the **top ~8** related names by weight (capped to fit half width), each
with logo + ticker + name, GRQ's call (`RatingBar`, if tracked), the weight, and the `why` provenance
line. Untracked related names still render (as leads) and link to their stock page, which auto-creates a
research request on open (D46) — consistent with existing behaviour.

---

## Milestone ladder

### Slice 1 — the panel, computed on-the-fly (web-only, no schema, no agent change)

The leanest validation surface. **No `KnowledgeEdge` table yet** — computing per stock-page view is
cheap (2 humans, low traffic; peers is already fetched on the page) and, crucially, **avoids an
agent-runner rebuild** that would re-trigger the ~3.8M-token startup universe scan and force an
`AGENT_VERSION` bump for zero slice-1 benefit. Deploy = `web` only.

- `lib/graph/related.ts` — `relatedFor(symbol, { limit })`:
  - **peer** edges from `fmpPeerComparison(yahoo)` (already on the page — pass it in, don't re-fetch).
  - **coheld** edges from a `PortfolioHolding` self-join (filers holding `symbol` → their other holdings).
  - **comention** edges from a bounded scan of recent `NewsArticle` where `symbol = X OR symbolsJson
    LIKE %X%`, tallying co-occurring tickers with recency decay.
  - **sector** floor from `UniverseMember.sector` peers in-universe.
  - Merge by **bare ticker** (`stripSuffix(yahoo)` / `bareTicker(symbol)` — the universe join key, per
    the symbol-conventions note), score 0–100, attach `why`, resolve each to its `UniverseMember` row
    (logo / call / upside) when tracked, else mark as an untracked lead. Return top-N.
- `components/RelatedNames.tsx` — the half-width panel (server-rendered; client wrapper only if needed
  for a tooltip). Empty/thin state with the honest TSX caveat.
- `app/stocks/[symbol]/page.tsx` — compute `related = await relatedFor(symbol, { peers, limit: 8 })`;
  rework the peers row to the 2-col layout; move the Scoreboard JSX below the Trades panel.
- **No** schema, runner, agent, or `AGENT_VERSION` change. `tsc` + web deploy.

### Slice 2 — persist + Today lane

**Backbone PREPPED (2026-06-26, not yet wired/deployed):**
- `KnowledgeEdge` table — `(fromSymbol, toTicker, toSymbol?, weight, sources, why, computedAt)`, one row
  per directed edge (the scan visits every node, so symmetric pairs persist both ways). Stored, not
  canonical `a<b` — it matches `relatedFor`'s per-node output and makes `edgesFor(symbol)` a trivial
  read. **Pushed to live (additive); the running containers ignore it until deploy.**
- `lib/graph/edges.ts` — `runGraphScan()` (deterministic batch: calls `relatedFor` per tracked name,
  `STORE_LIMIT=20`, upserts + prunes stale; no LLM) + `edgesFor(symbol)` (the read side) +
  `buildEdgesForSymbol()`. Verified: 104 nodes → 1258 DB-only edges in 3.6s.
- `scripts/build-graph.ts` — manual populate (`npx tsx scripts/build-graph.ts [--peers] [--limit=N]`).
  ⚠️ host tsx doesn't load `FMP_API_KEY` (root `.env`), so `--peers` is a no-op standalone; peer edges
  populate when the scan runs in-container.

**Remaining (gated):**
- **Nightly runner hook** — call `runGraphScan({ withPeers: true })` on a daily guard in `agent/runner.ts`.
  Agent-coupled: forces a rebuild → `AGENT_VERSION` bump + startup-scan window + the 10:00–15:00 ET
  check-in blackout. Batch with the Slice-3 agent work.
- **Today "also touches" lane** — web-only, lives in `app/page.tsx`; reads `comention`/the edge table.
  Deferred while that file is under concurrent edit.

### Slice 3 — agent input (maybe)

- A compact, Haiku-summarised "related names in play" line in `buildContext()` — only if check-in quality
  demonstrably needs it. Input only; §6 untouched.

---

## Open questions

- **Recency window** for `comention` — 30d? 90d? (start 30d, tune by eyeballing the panel.)
- **Weight base values** — the table above is a first guess; the on-the-fly panel is the tuning surface.
- **Cap** — top 8 in the half-width panel; revisit if it reads thin/dense.
- **Cross-currency edges** — peers/co-mentions may surface US tickers from a CA name and vice-versa;
  fine (they're leads), but the panel should label the listing.

---

## References

- News co-mention momentum spillover — Diamond Cuts Diamond (PKU, 2023).
- Connected-firm / shared-analyst-coverage momentum (~1.68%/mo) — Firm Linkages from the Wisdom of
  Crowds (EFMA 2023); Network Momentum (arXiv 2501.07135).
- FMP exposes **peers** but **no supply-chain endpoint** (site.financialmodelingprep.com/developer/docs).
