import { prisma } from "../db";
import { runSession } from "../../agent/sessions";
import { MODELS } from "../../agent/policy";

// Market Base Layer — Tier 1 (docs/MARKET-BASE-LAYER.md). A batched HAIKU light-tag
// over the Tier-0-screened names: a one-line "worth a look?" take + a coarse tag +
// an obscurity read. Pennies/batch (the news-triage pattern — Haiku, no tools, one
// shot). Deliberately limited info — its job is triage, not the dossier. An INPUT the
// agent weighs, never the gate. Lives in lib/ but imports agent/ — keep it OUT of any
// web page bundle (only scripts / the runner call it).

const TAG_SYSTEM = `You are a fast equity screener for a small CAD/USD fund that hunts under-the-radar, asymmetric opportunities — NOT blue chips. You give a ONE-LINE first-pass read on a stock from minimal data: a triage, not a dossier, no tools, no web. Be decisive and honest. Most names are PASS; reserve INTERESTING for a genuine reason.`;

type RawTag = { n?: number; tag?: string; take?: string; obscurity?: number };

function parseJsonArray(s: string): RawTag[] {
  try {
    const a = s.indexOf("[");
    const b = s.lastIndexOf("]");
    if (a >= 0 && b > a) {
      const arr = JSON.parse(s.slice(a, b + 1));
      if (Array.isArray(arr)) return arr;
    }
  } catch {
    /* model returned non-JSON — skip this batch */
  }
  return [];
}

function clampInt(v: unknown, lo: number, hi: number): number | null {
  const n = typeof v === "number" ? Math.round(v) : NaN;
  return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null;
}

/** Tag the next `limit` highest-score UNTAGGED names. Idempotent-ish: only touches
 *  rows with taggedAt=null, so it walks down the screen across repeated runs. */
export async function tagBatch(limit = 40): Promise<{ tagged: number }> {
  const rows = await prisma.marketScreen.findMany({
    where: { taggedAt: null },
    orderBy: { screenScore: "desc" },
    take: limit,
    select: { id: true, ticker: true, name: true, exchange: true, sector: true, marketCapM: true, priceCents: true, currency: true },
  });
  if (rows.length === 0) return { tagged: 0 };

  const list = rows
    .map((r, i) => `${i + 1}. ${r.ticker} — ${r.name} · ${r.exchange} · ${r.sector ?? "?"} · cap $${r.marketCapM}M · ${r.currency} ${((r.priceCents ?? 0) / 100).toFixed(2)}`)
    .join("\n");

  const prompt = `# First-pass screen — tag these ${rows.length} stocks
For each, return: a tag, a one-line take (≤140 chars — the WHY, concrete), and obscurity 1–5 (5 = almost nobody covers it, tiny float; 1 = widely followed).
Tags:
- INTERESTING = worth a real dossier: a genuine business with an asymmetric angle for a small fund.
- WATCH = interesting but wait for a catalyst or a better entry.
- PASS = skip: too big/dull, junky, or no discernible edge. MOST names are PASS.
You only have the line below per name — that's fine, it's a fast triage. Judge on size, sector, and what you know of the name.

${list}

Return ONLY a JSON array, one object per stock IN ORDER, no prose:
[{"n":1,"tag":"PASS","take":"...","obscurity":3}]`;

  const out = await runSession({ label: "market-tag", prompt, model: MODELS.triage, withTools: false, maxTurns: 1, systemPrompt: TAG_SYSTEM });
  if (!out) return { tagged: 0 };

  let tagged = 0;
  for (const p of parseJsonArray(out)) {
    const idx = typeof p.n === "number" ? p.n - 1 : -1;
    const row = rows[idx];
    if (!row) continue;
    const tag = p.tag && ["INTERESTING", "WATCH", "PASS"].includes(p.tag) ? p.tag : "PASS";
    await prisma.marketScreen.update({
      where: { id: row.id },
      data: { tag, take: String(p.take ?? "").slice(0, 200) || null, obscurity: clampInt(p.obscurity, 1, 5), taggedAt: new Date() },
    });
    tagged++;
  }
  return { tagged };
}
