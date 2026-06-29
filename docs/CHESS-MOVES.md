# Chess Moves — thematic / supply-chain reasoning (experiment)

**Status:** shipped 2026-06-29 (web + agent). Lives in the **Experiments** dropdown at
`/chess`. Decision: `docs/DECISIONS.md` D94.

## What it is

David Touchette's pitch: pick a board — an industry or an interrelated chain of companies —
*grok* how the pieces depend on each other, name the **force already in motion**, and trace
the **2nd/3rd-order plays** (the names that move *because* of it) before the market fully
reprices them. Two skills: **map the board** + **predict the next move**.

A member briefs a theme/chain in plain English ("uranium supply squeeze", "the GLP-1
chain"); the agent (Alfred) maps the value chain, writes the thesis + "what would change our
mind" levers, and enumerates 8–12 ripple-effect **plays** — each tagged beneficiary/victim
and by effect order, heat-ranked. Plus a **weekly self-picked "board of the week"** (Sunday
~12:00 ET) where Alfred chooses a timely chain himself.

## The honesty bar (load-bearing)

There is **no supply-chain data feed** — no FMP endpoint, nothing structured. The chain map
is **Alfred's web-researched reasoning, persisted**. So the product frames every play as a
**probabilistic ripple bet with explicit levers**, never imported fact. Same "leads, not
verdicts" discipline as The Hunt (D46): a play is a *lead*, not a Buy/Hold/Sell call.

## The guardrail

Chess Moves **never trades and never touches the §6 order gate** (guardrail #1). A play
becomes tradeable only the normal way: a member opens it / hits **Research** → a full
`runStockDossier` pass → the dossier clears the deterministic gate like everything else.
The agent runs research-only here (`write_journal` + the `save_chess_board` tool).

## Data model (`web/prisma/schema.prisma`)

- **`ChessTheme`** — the board: `title`, `anchor`, `brief` (null for the weekly self-pick),
  `kind` (BRIEF|WEEKLY), `status` (PENDING|RUNNING|READY|FAILED|RETIRED), `thesis` (md),
  `bottomLine`, `boardJson` (the chain map), `confidenceLeversJson`, `requestedBy`,
  `completedAt`, `agentVersion`.
- **`ChessPlay`** — one ranked piece: `symbol`/`yahoo`/`exchange`/`companyName`, `role`,
  `direction` (BENEFICIARY|VICTIM|NEUTRAL), `effectOrder` (1/2/3), `thesis`, `conviction`,
  `obscurity`, `rank`. `change30d`/heat are derived at render (not stored).

## Flow

1. **Brief:** `ChessBar` → `POST /api/chess` (member-guarded; one board in flight at a time;
   `CHESS.maxThemesPerDay` cap) → creates a `PENDING ChessTheme`.
2. **Run:** the agent runner picks up the oldest PENDING theme (off-schedule, any time; rate-
   guarded) → marks RUNNING → `runChessMoves(theme)` (Opus, research toolset) → the agent
   calls `save_chess_board` once → theme flips READY (+ plays + KG chain edges). Quiet-fail →
   FAILED. Restart-safe (orphaned RUNNING themes requeue to PENDING on boot).
3. **Weekly:** Sunday ~12:00 ET the runner enqueues a `kind:WEEKLY` theme (brief null) →
   same run path; Alfred self-picks the chain.
4. **Poll:** `ChessStatus` watches `GET /api/chess/status` and refreshes when the board lands.

## Knowledge-graph tie-in (Slice 2 persist, delivered here)

`save_chess_board` persists the board's **chain links** into `KnowledgeEdge` (new `chain`
source, `lib/graph/edges.ts → upsertChainEdges`), both directions, keyed on the bare ticker.
`relatedFor` (`lib/graph/related.ts`) merges persisted `chain` edges, so each play's
stock-page **Related names** panel surfaces the relationship with its provenance. Only links
between real play/board tickers are persisted (stage-label links are dropped). The
deterministic graph scan never wipes `chain` edges.

## Config (`web/agent/policy.ts → CHESS`)

`enabled` (`GRQ_CHESS_ENABLED`), `maxThemesPerDay` (3), `maxPlaysPerTheme` (12),
`weeklyEnabled` (`GRQ_CHESS_WEEKLY`), `weeklyWeekday` (0=Sun), `weeklyStartMin` (720=12:00 ET).

## Files

- Agent: `agent/sessions.ts` (`runChessMoves`), `agent/tools.ts` (`save_chess_board`),
  `agent/runner.ts` (on-demand pickup + weekly enqueue + boot requeue), `agent/policy.ts` (`CHESS`).
- Web: `lib/chess.ts` (board parse + `buildPlayViews`), `app/chess/{page,[id]/page}.tsx`,
  `app/api/chess/{route,status/route,research/route}.ts`, `components/chess/*`.
- KG: `lib/graph/{edges,related}.ts` (`chain` source).
- Manual run: `web/scripts/run-chess.ts` (`docker exec grq-agent npx tsx scripts/run-chess.ts <id|"brief">`).

## Out of scope (follow-ups)

- iOS (no `shared/contract.ts` change this pass).
- Force-directed SVG graph (v1 is lanes + a links list).
- A per-stock "in play — part of the X board" badge (easy now that `ChessPlay` rows exist).
