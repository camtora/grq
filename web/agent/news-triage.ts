// News triage (D81, M2) — the cheap Haiku pass that turns raw captured articles into a
// relevance-scored, summarized, entity-tagged digest. ONE batched single-shot Haiku call
// per cycle over un-triaged rows (no tools, no PERSONA) — Opus never sees raw news, so the
// expensive model is never spent on it. (It still draws on the same Max token, just at
// Haiku rates.) An INPUT the agent weighs, never the gate.
//
// The optional news-driven WAKEUP (NEWS_WAKEUP_ENABLED, default OFF) lets a high-relevance
// adverse headline on a HELD name fire a check-in — the agent reacts to price + the clock
// today, but is blind to news between sessions. Kept behind a flag for the soak.
import { prisma } from "../lib/db";
import { runSession } from "./sessions";
import { MODELS } from "./policy";
import { newsTargets, bareTicker } from "../lib/news/ingest";

const TRIAGE_SYSTEM =
  "You are a financial-news triage classifier for a small Canadian investment fund. For each " +
  "article, judge how MATERIAL it is to the fund's tracked names or its macro thesis, summarize " +
  "it in one short sentence, and tag sentiment, category, and any tickers it concerns. Be strict: " +
  "most headlines are noise (relevance < 40); reserve 80+ for news that could move a position. " +
  "Output ONLY a valid JSON array, no prose, no markdown fences.";

const SENTIMENTS = new Set(["POS", "NEU", "NEG"]);
const CATEGORIES = new Set(["EARNINGS", "GUIDANCE", "MNA", "MACRO", "LEGAL", "PRODUCT", "RATING", "OTHER"]);

function clampInt(v: unknown, lo: number, hi: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function parseJsonArray(text: string | null): Array<Record<string, unknown>> {
  if (!text) return [];
  const a = text.indexOf("[");
  const b = text.lastIndexOf("]");
  if (a < 0 || b <= a) return [];
  try {
    const parsed = JSON.parse(text.slice(a, b + 1));
    return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }
}

/** Triage up to `maxBatch` un-triaged articles in one Haiku call. Every row we SEND is
 *  marked triaged afterwards (even if the model omitted it) so we never re-send forever. */
export async function triageNews(maxBatch = 25): Promise<{ triaged: number }> {
  // Newest-first: the digest surfaces the last ~36h, so the freshest, most decision-relevant
  // news must be triaged first. (Oldest-first would bury fresh news behind a stale backlog.)
  const rows = await prisma.newsArticle.findMany({
    where: { triagedAt: null },
    orderBy: { publishedAt: "desc" },
    take: maxBatch,
    select: { id: true, title: true, publisher: true, symbol: true },
  });
  if (!rows.length) return { triaged: 0 };

  const tracked = (await newsTargets().catch(() => [])).map((t) => t.fmp);
  const prompt =
    `Tracked names (relevance is materiality to these or the fund's macro thesis): ${tracked.join(", ") || "(none)"}\n\n` +
    `Classify each article by id:\n` +
    rows.map((r) => `${r.id}. "${r.title}" — ${r.publisher}${r.symbol ? ` [${r.symbol}]` : ""}`).join("\n") +
    `\n\nReturn a JSON array, one object per id:\n` +
    `[{"id": <id>, "relevance": 0-100, "sentiment": "POS|NEU|NEG", "category": "EARNINGS|GUIDANCE|MNA|MACRO|LEGAL|PRODUCT|RATING|OTHER", "summary": "<=140 chars", "symbols": ["TICKER", ...]}]\n` +
    `Output ONLY the JSON array.`;

  // maxTurns 8 (1 → 3 in D114 → 8 here). This cap has never been a token-saving measure — it was
  // raised the first time for exactly the reason it's raised now: error_max_turns was killing an
  // otherwise-fine Haiku pass and returning null. Extra turns are only consumed by a cut-off and
  // cost nothing when the model finishes in one, so a generous cap is free; the failure it prevents
  // is not (a null discards the pass and the batch waits a cycle).
  //
  // 8 is a band-aid, though, and worth remembering as one: this call is TOOL-LESS over <=25
  // headlines, so it should finish in ONE turn and never see a second. It's been emitting 5k-11k
  // output tokens for a JSON array that needs ~1.5k, and the 2026-07-16 failure hit the cap on a
  // TWO-ROW batch — two headlines cannot need three turns. Something is generating far more than the
  // task asks for (Haiku 4.5 thinking tokens are the obvious suspect: they'd explain the volume AND
  // the continuations). Raising the ceiling hides that; it doesn't answer it.
  const out = await runSession({
    label: "news-triage",
    model: MODELS.triage,
    withTools: false,
    maxTurns: 8,
    systemPrompt: TRIAGE_SYSTEM,
    prompt,
  });

  // A failed/empty session (null — error_max_turns, an API error, quiet mode) must NOT mark this
  // batch triaged: the query only ever re-pulls triagedAt=null, so marking-on-failure would
  // silently discard ~maxBatch articles forever. Leave them untouched so the next cycle retries.
  if (out == null) {
    console.warn(`[news] triage produced no output for ${rows.length} row(s) — leaving untriaged for retry`);
    return { triaged: 0 };
  }

  const byId = new Map<number, Record<string, unknown>>();
  for (const p of parseJsonArray(out)) {
    const id = clampInt(p.id, 0, Number.MAX_SAFE_INTEGER);
    if (id != null) byId.set(id, p);
  }

  const now = new Date();
  for (const r of rows) {
    const p = byId.get(r.id);
    if (!p) {
      await prisma.newsArticle.update({ where: { id: r.id }, data: { triagedAt: now } });
      continue;
    }
    const sentiment = typeof p.sentiment === "string" && SENTIMENTS.has(p.sentiment) ? p.sentiment : "NEU";
    const category = typeof p.category === "string" && CATEGORIES.has(p.category) ? p.category : "OTHER";
    const symbols = Array.isArray(p.symbols) ? p.symbols.filter((s) => typeof s === "string").slice(0, 8) : [];
    await prisma.newsArticle.update({
      where: { id: r.id },
      data: {
        triagedAt: now,
        relevance: clampInt(p.relevance, 0, 100),
        sentiment,
        category,
        summary: typeof p.summary === "string" ? p.summary.slice(0, 200) : null,
        symbolsJson: symbols.length ? JSON.stringify(symbols) : null,
      },
    });
  }

  await maybeNewsWakeup(rows.map((r) => r.id)).catch((e) =>
    console.error("[news] wakeup check failed:", e instanceof Error ? e.message : e),
  );
  return { triaged: rows.length };
}

// ---- News-driven wakeup (default OFF) ---------------------------------------

const NEWS_WAKEUP_ENABLED = (process.env.NEWS_WAKEUP_ENABLED ?? "false").toLowerCase() === "true";
const WAKEUP_MIN_RELEVANCE = 85;

function tagSet(symbol: string | null, symbolsJson: string | null): Set<string> {
  const out = new Set<string>();
  if (symbol) out.add(bareTicker(symbol));
  if (symbolsJson) {
    try {
      const arr = JSON.parse(symbolsJson);
      if (Array.isArray(arr)) for (const s of arr) if (typeof s === "string") out.add(bareTicker(s));
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** Conservative interrupt: if a just-triaged article scores ≥85 and is adverse/material on a
 *  HELD name (money at risk), enqueue ONE AgentWakeup so the next tick fires a check-in. The
 *  existing scheduler fires it and it draws on the bounded ad-hoc decision budget. Never stacks
 *  (skips if a news wakeup is already pending). Watched/focus news still reaches the agent via
 *  the context digest at the next scheduled check-in — only held + high-severity interrupts. */
async function maybeNewsWakeup(ids: number[]): Promise<void> {
  if (!NEWS_WAKEUP_ENABLED || !ids.length) return;

  const positions = await prisma.position.findMany({ select: { symbol: true } });
  if (!positions.length) return;
  const heldBare = new Map(positions.map((p) => [bareTicker(p.symbol), p.symbol]));

  const pending = await prisma.agentWakeup.count({ where: { status: "PENDING", createdBy: "news-trigger" } });
  if (pending > 0) return;

  const rows = await prisma.newsArticle.findMany({
    where: { id: { in: ids }, relevance: { gte: WAKEUP_MIN_RELEVANCE } },
    orderBy: { relevance: "desc" },
    select: { symbol: true, symbolsJson: true, title: true, sentiment: true, relevance: true, category: true },
  });

  for (const r of rows) {
    // Adverse OR a material corporate-action category — not just any high-relevance item.
    const material = r.sentiment === "NEG" || ["GUIDANCE", "MNA", "LEGAL", "EARNINGS"].includes(r.category ?? "");
    if (!material) continue;
    const tags = tagSet(r.symbol, r.symbolsJson);
    const hit = [...heldBare.keys()].find((b) => tags.has(b));
    if (!hit) continue;
    const held = heldBare.get(hit)!;
    await prisma.agentWakeup.create({
      data: {
        dueAt: new Date(),
        reason: `news on ${held} (rel ${r.relevance}, ${r.sentiment}): ${r.title.slice(0, 120)}`,
        createdBy: "news-trigger",
      },
    });
    return; // one interrupt per cycle
  }
}
