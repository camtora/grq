# Market Base Layer — researching the whole market, affordably

**Status (2026-06-27):** **Tiers 0 + 1 + 3 SHIPPED.** `MarketScreen` table live; Tier-0 deterministic
screen = 4,788 real companies ranked on Browse; Tier-1 Haiku tagger — **full pass complete (4,788 tagged,
194 INTERESTING)** — joined into the knowledge-graph Related-names panel. **Nightly automation** wired
(`runMarketScreenNightly` in the runner daily block — re-screen + tag new names). **Tier-3 retrieval**
live in the agent (v2.8-phase4): a "Market screen — fresh finds" context section + hunt anti-saturation
(avoid recently-surfaced names) + a screen seed, behind `MARKET_BASE_RETRIEVAL` (default on; "off" disables).
Remaining: tuning + the A/B evaluation (does retrieval change what the agent finds?). Companion to the
knowledge graph (`docs/KNOWLEDGE-GRAPH.md`), the retrieval half.

**The pitch (Cam, 2026-06-27):** instead of the agent only knowing the ~100 names it tracks, give it a
*base layer of awareness across the whole investable market* (~10,800 NASDAQ + NYSE + TSX companies,
ETFs excluded) — a cheap, always-on "what do we already think about this name?" layer that the expensive
Opus passes build on top of.

---

## The two things that decide whether this is worth building

### 1. Retrieval is the bottleneck, not research

The agent's decision context (`agent/context.ts buildContext`) is scoped to **held positions + focus
names only** — dossier verdicts, earnings, smart-money are all keyed to `bookSyms = positions ∪ focus`.
There is a `get_journal` tool, but it's a **pull** (the agent must already have a ticker in mind to ask).

**Consequence:** a library of 10,800 light dossiers built today would sit unread — the agent never
*walks into* it. So **building the research is necessary but not sufficient**; the value only appears
once something surfaces the right pre-research at the right moment. That "something" is the **knowledge
graph** (`edgesFor`) plus a few targeted context injections. Build the base layer *and* the retrieval, or
don't build it.

### 2. The base layer must be cheap-tiered — never Opus-per-name

An Opus hunt-dossier is ~100k tokens/name; ~10,800 × 100k ≈ **~1.1 billion tokens ≈ ~22 of the 5h Max
windows** — on the *same* quota as interactive Claude Code. That's a non-starter as a base layer. The
base layer has to be deterministic + Haiku; Opus is reserved for the shortlist.

---

## The design — a coverage funnel + a retrieval layer

```
  ALL ~10,800 stocks (ETFs excluded)
        │  Tier 0 — deterministic screen (no LLM, ~free, TOTAL coverage)
        ▼
  ~few thousand that pass a liquidity/quality/momentum floor
        │  Tier 1 — Haiku light tag (pennies/batch, on the interesting subset)
        ▼
  ~few hundred "worth a real look"
        │  Tier 2 — Opus full dossier (the existing runStockDossier; ON DEMAND)
        ▼
  promotion candidates → universe (existing flow)

  ┌─────────────────────────────────────────────────────────────┐
  │  RETRIEVAL (the load-bearing part) — the knowledge graph +    │
  │  context injection surface a name's Tier-0/1 read whenever it │
  │  becomes relevant (peer, co-mention, news, sector move).     │
  └─────────────────────────────────────────────────────────────┘
```

### Tier 0 — deterministic screen (no LLM, total coverage)

A nightly pass over the whole market via `fmpScreener` (already wired; gives symbol, name, price, market
cap, sector, exchange, country, `isEtf`). Compute a **base score** from what's cheaply available —
market cap / liquidity floor, sector, and (where we can afford the bars) momentum from `agent/signals.ts`.
Store one row per name. Near-free, covers everything. This alone gives the agent (and the screener UI) a
ranked, ETF-free map of the whole market.

- **Cost:** a screener call per exchange + storage. Momentum needs price history (bars) per name — that's
  the one non-trivial cost; bound it (top-N by cap/liquidity, or skip momentum at Tier 0 and add it at
  Tier 1). *Open question below.*

### Tier 1 — Haiku light tag (pennies, on the subset Tier 0 flags)

A batched **Haiku** structured call (the `agent/news-triage.ts` pattern — no tools, one shot, ~pennies)
over the names Tier 0 surfaces: a one-line "worth a look?" take + a coarse tag (e.g. interesting / pass /
revisit-on-catalyst) + an obscurity read. This is the cheap analogue of a hunt lead — **limited info by
design**, and that's fine, because its job is triage, not the decision.

### Tier 2 — Opus full dossier (existing, on demand)

Unchanged: `runStockDossier` produces the stance + targets verdict, kicked **on demand** for the shortlist
the cheap tiers surface (or when a member opens the page — the existing D46 path). Opus never touches the
long tail.

### Retrieval — where it plugs into the agent (the part that makes it pay off)

The base layer is dead weight without these. All are **inputs the agent weighs, never gates** (§6
untouched):

1. **Via the knowledge graph:** when the agent researches X, `edgesFor(X)` surfaces related names *with
   their Tier-0/1 read attached* — "you already tag these 4 peers interesting / pass." Turns the graph
   from "related tickers" into "related tickers we already have a view on."
2. **Anti-saturation for the hunt:** feed `runDiscoveryHunt` the names already screened/tagged so it
   hunts for *new or stale* names instead of re-surfacing the same obscure pool every run (fixes the
   saturation ceiling — see `docs/KNOWLEDGE-GRAPH.md` cost notes / the hunt math).
3. **News "also touches":** the Today lane already lights up co-mentioned tracked names; the base layer
   lets it light up *any* screened name with a one-line take.
4. **A compact context line (optional, later):** a Haiku-summarised "names in play near your book" line in
   `buildContext` — only if it proves its worth, and Haiku-summarised to protect the Opus quota.

---

## Schema sketch

A new table **below** the universe (a name can be screened without being a `CANDIDATE`):

```prisma
model MarketScreen {
  symbol        String   @id   // bare ticker (the universal key — strip .US too)
  name          String
  exchange      String        // NASDAQ | NYSE | TSX | TSXV
  sector        String?
  country       String?
  marketCapM    Int?
  // Tier 0 — deterministic
  screenScore   Int?          // 0–100 base rank (liquidity/quality/momentum)
  screenedAt    DateTime?
  // Tier 1 — Haiku light tag
  tag           String?       // INTERESTING | PASS | REVISIT | null (untagged)
  take          String?       // one-line Haiku "worth a look?" note
  obscurity     Int?          // 1–5
  taggedAt      DateTime?
}
```

`UniverseMember` stays the tracked tier; `JournalEntry` stays the Opus-dossier home. `MarketScreen` is the
new wide, cheap base. The knowledge graph joins on the same bare-ticker key, so an edge can carry the
neighbour's `screenScore`/`tag`/`take` for free.

---

## Cost model (order-of-magnitude; Max 5h window ≈ 50M tokens)

| Tier | Coverage | Engine | Rough cost |
|---|---|---|---|
| 0 — screen | all ~10,800 | deterministic | ~free (FMP calls + bars budget) |
| 1 — Haiku tag | ~1–3k subset | Haiku, batched | pennies/batch — well under a window |
| 2 — Opus dossier | ~hundreds, on demand | Opus | ~280k tok each — the existing budget line |

Contrast with the naive version (Opus the whole market): **~1.1B tokens ≈ ~22 windows.** The tiered design
puts total-market coverage within a *fraction* of one idle window for Tiers 0–1, and keeps Opus for the
shortlist.

---

## Guardrail posture

Same as news / smart-money / the graph: every tier is an **input the agent weighs, never the gate**. A
screen score or a Haiku tag can't place, size, block, or **auto-promote** anything — promotion still needs
the liquidity screen + the ≥Buy/75 conviction bar + the §6 order gate, all humans-only.

---

## Milestone ladder

- **Slice 1 — Tier 0 screen + UI.** `MarketScreen` table + a nightly deterministic screen (`fmpScreener`,
  ETF-excluded) + surface it on **Browse** (the whole market, ranked). Web-only-ish; the nightly batch is
  agent-runner-coupled (AGENT_VERSION bump) OR a standalone script first. **No agent context change** —
  pure data + a human surface to validate the screen quality, exactly like KG Slice 1.
- **Slice 2 — Tier 1 Haiku tag + graph join.** Haiku light-tag the Tier-0 subset; teach `edgesFor` to
  carry the neighbour's tag/take so the KG retrieval surfaces "related names we have a read on."
- **Slice 3 — retrieval into the agent.** Anti-saturation feed for the hunt + (optional) the compact
  context line. Agent-coupled; measure that it improves check-in quality before keeping it.

---

## Open questions

- **Tier 0 momentum** — bars for 10,800 names aren't free. Skip momentum at Tier 0 (cap/sector/liquidity
  only) and add it at Tier 1 on the smaller subset? Or batch-fetch bars nightly within an FMP budget?
- **Refresh cadence** — Tier 0 weekly, Tier 1 only on change/catalyst? The market doesn't re-rank daily.
- **Tier 1 trigger** — what promotes a name from Tier 0 to a Haiku tag: top-N by score, a catalyst (news/
  earnings/insider), or a graph edge to a name we care about?
- **Does it measurably help?** Slice 3 must be A/B-able — does surfacing pre-research actually change what
  the agent finds/buys, or is the hunt's live WebSearch already good enough? Build Tiers 0–1 first; let the
  human surfaces prove the screen is good before wiring the agent.
