# News & Events — capture, triage, serve (the "what moved" layer)

**Status:** M1 + M2-core BUILT & staged (2026-06-26) — code in tree, `tsc` clean, all three tables
pushed to the live DB. **Not yet live:** both run in the agent (tick loop + context), so they activate
on the **next agent rebuild** (Cam: "ride the next rebuild" — no dedicated startup-scan quota burn).
Remaining: flip `NEWS_WAKEUP_ENABLED` on after the digest proves out, and the **mobile** rewire
(feed.ts `wireResponse`/`dossierResponse` + the `shared/contract.ts` NewsItem shape — held off to
avoid the iOS wire-compat decode gotcha). Decision record: `docs/DECISIONS.md` D81.
**Shipped 2026-06-26:** agent **v1.55-phase4** (M1+M2, full startup scan run); **web** (M2b — Today +
stock-page read the store, FMP fallback, triage enrichment shown). Mobile still reads live FMP.
**One-liner:** Stop throwing news away and stop flattening macro to one line. Build a single
persisted, triaged event layer that feeds the agent, the human pages, *and* a news-driven
wakeup — without ever letting raw news near Opus (and so near Cam's Max quota).

---

## The two gaps this closes

1. **News is captured and thrown away.** `fmpNews` (general) + `fmpStockNews` (per-symbol) are
   fetched on-demand for display (Today, The Wire, the stock page) and **never persisted, never
   summarized, never seen by the agent.** The agent only learns "what moved" if it spends a
   `WebSearch` during a session — which it only does for the one name it's researching that hour.
2. **Macro is leveled, never delta'd.** BoC + FRED feed the agent (`lib/macro.ts` → `macroLine()`)
   but only as a single current-level string (`Fed funds 4.50% · UST 10y 4.25% …`). The agent never
   sees the *event* — "rates moved today," "CPI printed hot." No history, no upcoming-event calendar.

## The principle: capture once, serve three

One persisted store, fanned out three ways. This is what makes it cheap and answers "do we surface it":

1. **Agent context** — a bounded "What moved" digest replaces the one-line macro string in `buildContext`.
2. **Humans** — Today ("The Daily") and The Wire stop doing live raw-FMP fetches and read this store:
   faster, deduped, with a literacy-pillar "why this matters" line. Per-stock news panel reads it too.
3. **News-driven wakeup** *(the sleeper win)* — today the agent reacts to **price** (±4% leg) and
   **the clock** only; it is blind to news between sessions. A triaged feed lets a material headline on
   a held/watched name **fire a check-in**, reusing the existing held-position trigger plumbing.

**No new page.** Today + The Wire already exist. This is the plumbing *underneath* them.

## The cost architecture (never let Opus near the firehose)

Three layers, very different cost profiles:

| Layer | What | Model | Cost |
|---|---|---|---|
| **Capture** | Poll FMP news + macro; dedup on URL; persist raw | none (deterministic) | ~free — already paying FMP Ultimate |
| **Triage** | Per *new* cluster: relevance 0–100, 1-line summary, entity tags, sentiment, category | **Haiku 4.5** (existing triage model) | pennies — only on new/changed items |
| **Serve** | Bounded digest → agent context · pages · wakeup check | Opus sees only the digest | **zero new Opus burn** |

The Haiku layer is the linchpin: it turns ~50 raw articles into ~8 tagged, deduped, summarized items.
**Opus never sees raw articles.** This keeps the whole feature off the shared Max quota.

## Cadence / volume / sources

**Cadence** (piggyback the tick loop; capture ≠ triage):
- **News:** general headlines ~3×/day (pre-open ~06:00, midday, post-close); per-symbol news for
  **held + watched + focus only** (~20–30 names) a few times during market hours. Capture is cheap;
  the gate is Haiku triage, which only runs on genuinely *new* (un-triaged) rows.
- **Macro:** keep the 30-min `getMacro()` poll; add **change-detection** — when a tracked series
  (`overnightRate` / `fedFunds` / `cpiYoY` / `usCpiYoY` / `ust10y` / `goc5yr` / `usdcad`) differs from
  the last persisted daily snapshot beyond a threshold, write a discrete `MarketEvent`. The *delta* is
  the signal, not the level.

**Volume** (scope by relevance, not firehose):
- Per-symbol news only for held/watched/focus names — never the whole 60-name universe.
- Hard dedup: FMP repeats the same story across publishers → unique on URL + cluster by title/entity.
- Retention: rolling **~90 days** of news; **indefinite** for `MarketEvent` (tiny, gold for retros).
  News text is trivial DB weight vs the Docker-image disk pressure — the real budget is tokens, bounded
  by the Haiku gate.

**Sources:**
- **FMP** (already paid): `fmpNews` + `fmpStockNews` (have them); **add the FMP economic calendar** if
  the Ultimate tier includes it — *upcoming* FOMC/CPI/jobs dates (the agent can't see these today).
- **Macro:** keep BoC + FRED; add the delta→event transform.
- **WebSearch:** stays the *deep-dive* layer ("go understand THIS catalyst"), never the stream.
- Press releases / earnings transcripts: **deferred** — per-symbol news catches most of it.

## Schema sketch (additive — two new tables; v1)

Both additive, so `prisma db push` is non-destructive. Int-cents rule doesn't apply (these are text/
floats for rates, not money). Mirrors the `InsiderTrade` / `Quote` ingest-table style.

```prisma
model NewsArticle {
  id          Int       @id @default(autoincrement())
  fetchedAt   DateTime  @default(now())
  publishedAt DateTime
  source      String    // "fmp-general" | "fmp-stock"
  publisher   String
  title       String
  url         String    @unique          // natural dedupe key
  imageUrl    String?
  symbol      String?                     // primary tagged ticker (null = general market)
  symbolsJson String?                     // extra entity tags (JSON array), Haiku-assigned
  // --- triage (Haiku; null until triaged) ---
  summary     String?
  sentiment   String?                     // POS | NEU | NEG
  relevance   Int?                        // 0–100 materiality to a tracked name / the macro thesis
  category    String?                     // EARNINGS | GUIDANCE | MNA | MACRO | LEGAL | PRODUCT | OTHER
  triagedAt   DateTime?
  @@index([publishedAt])
  @@index([symbol])
  @@index([triagedAt])
}

model MarketEvent {
  id           Int       @id @default(autoincrement())
  detectedAt   DateTime  @default(now())
  at           DateTime                    // when observed/occurred
  scheduledFor DateTime?                   // set for forward calendar items (FOMC/CPI dates)
  kind         String                      // RATE_DECISION | CPI_PRINT | YIELD_MOVE | FX_MOVE | CALENDAR
  region       String                      // CA | US
  series       String?                     // overnightRate | fedFunds | cpiYoY | ust10y | usdcad | ...
  headline     String
  value        Float?
  prevValue    Float?
  source       String                      // BoC | FRED | FMP
  @@unique([kind, region, series, at])      // idempotent delta detection
  @@index([at])
}
```

Delta detection needs yesterday's levels. Reuse the existing `MacroSnapshot` shape persisted as one
upserted daily row (a tiny `MacroDaily` table, or the latest `MarketEvent` per series as the prior) —
finalize in Milestone 1. The agent never reads the raw tables; it reads the digest builder's output.

## Guardrail posture (non-negotiable)

Same discipline as smart money / The Race: **news and events are an INPUT the agent weighs, NEVER the
gate.** Triage output (relevance, sentiment) cannot place, size, or block an order; the §6 validator is
untouched. A news-driven wakeup only *schedules a check-in* — the agent still reasons and the gate still
disposes. Hallucinated relevance must never move money.

## Milestones

**M1 — Macro → events** ✅ BUILT (staged):
- `MarketEvent` + `MacroDaily` tables (additive; pushed live).
- `runMacroEventScan()` + `recentMacroEvents()` in `lib/macro-events.ts`; per-series thresholds tuned
  to each series' noise floor (FRED daily-effective fed funds needs a wider gate than the BoC target).
- Tick hook: once/ET-day after `getMacro()` (runner.ts, beside the smart-money ingest), `lastMacroEventDay` guard.
- `buildContext`: the macro block now carries **level + "Recent moves"** (the deltas) — context.ts.
- ✅ FMP economic calendar — tier confirmed; `fmpEconomicCalendar()` filters the global firehose to
  **US/CA High-impact** events (FOMC, CPI, jobs, BoC), `refreshEconomicCalendar()` upserts them as
  scheduled `MarketEvent`s once/ET-day, and `buildContext` shows **"Upcoming catalysts."**

**M2 — News capture + triage + serve** ✅ core BUILT (staged):
- `NewsArticle` table (additive; pushed live).
- `lib/news/ingest.ts` (`runNewsIngest()` + `newsTargets()`): general + held/watched/focus per-symbol
  news, bare-ticker resolution off the universe `yahoo` field, dedup on unique URL via `createMany skipDuplicates`.
- `agent/news-triage.ts` (`triageNews()`): ONE batched **Haiku** single-shot call (no tools, no PERSONA,
  maxTurns 1) over un-triaged rows → relevance/summary/sentiment/category/tags; every sent row marked
  triaged so we never re-send. Reuses `runSession` (new `systemPrompt?` override) → AgentUsage logged.
- `lib/news/queries.ts` (`recentNewsDigest()` / `newsForSymbol()`): bounded relevance-ranked readers.
- `buildContext`: a **"What moved"** digest block (top-N triaged, relevance-ranked) — context.ts.
- Tick hook: ingest + triage every ~90 min, background (doesn't block the tick) — runner.ts, `lastNewsRun`.
- **News-driven wakeup** behind `NEWS_WAKEUP_ENABLED` (default **OFF** for the soak): a ≥85-relevance
  adverse/material item on a **HELD** name enqueues ONE `AgentWakeup` (`createdBy:"news-trigger"`); the
  existing scheduler fires it as a check-in, bounded by the ad-hoc decision budget; never stacks.

**M2b — web page rewire** ✅ SHIPPED (web deploy 2026-06-26): `lib/news/queries.ts` gained render-ready
readers (`todayHeadlines`, `stockNewsCards`) that read the store first and **fall back to live FMP** so a
name with no captured news never goes blank; a shared `components/NewsList.tsx` (`NewsRow` + `SentimentDot`)
renders the triage enrichment (one-line summary, sentiment dot, category chip). Wired into `app/page.tsx`
(Today: Headlines + Market pulse) and `app/stocks/[symbol]/page.tsx` (Recent news). Verified live on
`/stocks/ELVA` (real summary + sentiment rendered). **Mobile (feed.ts `wireResponse`/`dossierResponse` +
`shared/contract.ts`) still on live FMP** — deferred to avoid the iOS wire-compat decode gotcha.

## Follow-on (after M1+M2)

The relationship **knowledge graph** (DECISIONS D81 discussion) sits naturally on top: the events
flowing through this pipeline are exactly what a `CompanyEdge` set would propagate ("TSMC headline →
light up everything with an edge to TSMC"). Build the pipeline first; the graph is the multiplier.

## Open questions for review

- **Capture windows** — exactly 3 (pre-open / midday / close) or hourly-during-market for held names?
- **Relevance threshold** for a news-driven wakeup — start conservative (≥80 + NEG) to avoid drumbeat.
- **FMP economic calendar** — confirm it's in the Ultimate tier before wiring M1's calendar half.
- **Retention** — 90 days news confirmed? Indefinite `MarketEvent` confirmed?
