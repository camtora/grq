// One-time backfill (D51): existing "Hunt dossier" entries were stored with a BARE
// ticker and no exchange, so the Hunt board resolved them to a same-ticker US company
// (AII→American Integrity Insurance instead of Almonty; LGN→Legence instead of Logan
// Energy) — wrong price, chart, momentum, heat, logo. New finds carry the exchange going
// forward; this fills in the recent backlog by NAME-GROUNDING: pick the fmpSearch listing
// whose company name actually appears in the dossier body, then store its exchange +
// FMP company name. It also clears the orphaned wrong bare Quote/Bar rows for any find we
// move to a Canadian listing (so the stale wrong-company cache can't linger).
//
//   npx tsx scripts/backfill-hunt-exchange.ts        # dry-run (print proposals)
//   npx tsx scripts/backfill-hunt-exchange.ts apply  # write them

import { prisma } from "../lib/db";
import { fmpSearch } from "../lib/fmp";
import { bareTicker, allUniverse } from "../lib/universe";

const APPLY = process.argv.includes("apply");

// FMP exchange shortName → our write_journal enum (the venues EXCHANGE_SUFFIX maps).
function normExchange(ex: string): string | null {
  const e = ex.trim().toUpperCase();
  if (["NYSE"].includes(e)) return "NYSE";
  if (["NASDAQ"].includes(e)) return "NASDAQ";
  if (["AMEX", "NYSE AMERICAN", "NYSEAMERICAN"].includes(e)) return "AMEX";
  if (["TSX", "TSE", "TORONTO"].includes(e)) return "TSX";
  if (["TSXV", "TSX VENTURE", "VENTURE"].includes(e)) return "TSXV";
  if (["CSE", "CNSX", "CNQ"].includes(e)) return "CSE";
  if (["NEO", "CBOE CA", "CBOE CANADA", "AEQUITAS NEO"].includes(e)) return "NEO";
  return null; // a listing we don't show/trade (LSE, OTC, etc.) → leave as monogram
}

// Distinctive (≥4-char, non-boilerplate) words of a company name.
const SKIP = new Set([
  "the", "inc", "corp", "ltd", "company", "group", "holdings", "common", "stock", "class",
  "limited", "corporation", "plc", "incorporated", "technologies", "industries", "resources",
]);
function nameTokens(name: string): string[] {
  return [
    ...new Set(
      name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length >= 4 && !SKIP.has(t)),
    ),
  ];
}
// How many of a candidate's distinctive name-words appear (whole-word) in the dossier body
// — the corroboration score. Multi-token beats a single coincidental substring, so on a
// same-ticker collision (AII: "Almonty Industries" vs "American Integrity Insurance") the
// company the dossier is actually ABOUT wins.
function corroboration(body: string, name: string): number {
  return nameTokens(name).filter((t) => new RegExp(`\\b${t}\\b`).test(body)).length;
}

async function main() {
  const tracked = new Set((await allUniverse()).map((u) => u.symbol.toUpperCase()));
  const rows = await prisma.journalEntry.findMany({
    where: { kind: "RESEARCH", title: { startsWith: "Hunt dossier" }, exchange: null, symbol: { not: null } },
    orderBy: { at: "desc" },
    take: 60,
  });

  console.log(`${APPLY ? "APPLY" : "DRY-RUN"} — ${rows.length} hunt finds with no exchange\n`);
  console.log("ticker\tlisting\texchange\tcompany (name-grounded in body)");
  console.log("------\t-------\t--------\t-------------------------------");

  let written = 0;
  for (const r of rows) {
    const sym = bareTicker(r.symbol!).toUpperCase();
    const body = r.body.toLowerCase();
    const matches = await fmpSearch(sym).catch(() => []);

    // Same-ticker listings, ranked by how strongly the dossier body corroborates each
    // company's name; keep only the corroborated ones, best first.
    const grounded = matches
      .filter((m) => bareTicker(m.symbol).toUpperCase() === sym)
      .map((m) => ({ m, score: corroboration(body, m.name) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    // The best-corroborated listing that's on a venue we actually show/trade.
    const pick = grounded.find(({ m }) => normExchange(m.exchange));
    const ex = pick ? normExchange(pick.m.exchange) : null;

    if (!pick || !ex) {
      console.log(`${sym}\t—\t—\t(no confident name match → leave as monogram)`);
      continue;
    }

    console.log(`${sym}\t${pick.m.symbol}\t${ex}\t${pick.m.name} [${pick.score}]`);
    if (!APPLY) continue;

    await prisma.journalEntry.update({ where: { id: r.id }, data: { exchange: ex, companyName: pick.m.name } });
    written++;

    // If we moved it to a Canadian listing, the bare-ticker Quote/Bar cache is a DIFFERENT
    // (US) company's data — purge it so nothing reads stale wrong-company prices. Never
    // touch a bare symbol that's a tracked universe name.
    const suffixed = pick.m.symbol.toUpperCase() !== sym;
    if (suffixed && !tracked.has(sym)) {
      const dq = await prisma.quote.deleteMany({ where: { symbol: sym } });
      const db = await prisma.bar.deleteMany({ where: { symbol: sym } });
      if (dq.count || db.count) console.log(`        ↳ purged stale bare ${sym}: ${dq.count} quote, ${db.count} bars`);
    }
  }

  console.log(`\n${APPLY ? `wrote ${written}` : "dry-run — re-run with 'apply' to write"}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
