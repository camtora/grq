// Tier 8 — free, keyless social feeds. ApeWisdom aggregates Reddit mention counts + day-over-day
// velocity; Stocktwits carries user-tagged Bullish/Bearish per message. No model, no API key.
// lib/social/store.ts turns these into cached SocialDaily rows. A RISK/CROWDING signal about the
// underlying — never traded, never the gate. docs/DATA-SOURCES.md tier 8, DECISIONS D89.

export type ApeRow = {
  ticker: string;
  name: string;
  mentions: number; // rolling 24h
  upvotes: number;
  rank: number; // lower = more talked-about
  rankPrev: number; // rank 24h ago
  mentionsPrev: number; // mentions 24h ago (vendor velocity baseline; we prefer our own history)
};

/** Pull an ApeWisdom board ("all-stocks", "wallstreetbets", …) into a bare-ticker → row map.
 *  One free call per page; stops at the reported last page. Best-effort — returns what it got. */
export async function fetchApeBoard(filter: string, maxPages = 10): Promise<Map<string, ApeRow>> {
  const map = new Map<string, ApeRow>();
  for (let p = 1; p <= maxPages; p++) {
    const r = await fetch(`https://apewisdom.io/api/v1.0/filter/${filter}/page/${p}`, { signal: AbortSignal.timeout(12_000) }).catch(() => null);
    if (!r || !r.ok) break;
    const j = (await r.json().catch(() => null)) as { results?: Array<Record<string, unknown>>; pages?: number } | null;
    if (!j?.results?.length) break;
    for (const row of j.results) {
      const ticker = String(row.ticker ?? "").toUpperCase();
      if (!ticker) continue;
      map.set(ticker, {
        ticker,
        name: String(row.name ?? ""),
        mentions: Number(row.mentions ?? 0),
        upvotes: Number(row.upvotes ?? 0),
        rank: Number(row.rank ?? 0),
        rankPrev: Number(row.rank_24h_ago ?? 0),
        mentionsPrev: Number(row.mentions_24h_ago ?? 0),
      });
    }
    if (j.pages && p >= j.pages) break;
  }
  return map;
}

type StwMsg = {
  body?: string;
  entities?: { sentiment?: { basic?: string } | null } | null;
  user?: { followers?: number; join_date?: string } | null;
};

// Bot/promo screen (D89 hardening). Stocktwits sentiment is self-tagged and gamed, so we DON'T
// count every tagged message equally. Drop two signatures we can see in the payload:
//   • shotgun posts tagging ≥3 cashtags (copy-paste spam, not a view on THIS name)
//   • accounts that are BOTH thin (<15 followers) AND young (<120 days) — the classic burner
// A legit thin-but-old or young-but-followed account still counts. Tunable here.
const MIN_FOLLOWERS = 15;
const MIN_AGE_DAYS = 120;
const MAX_CASHTAGS = 2;

function isQualityAuthor(m: StwMsg): boolean {
  const body = m.body ?? "";
  const cashtags = (body.match(/\$[A-Za-z]/g) ?? []).length;
  if (cashtags > MAX_CASHTAGS) return false;
  const followers = Number(m.user?.followers ?? 0);
  const joined = m.user?.join_date ? new Date(m.user.join_date).getTime() : 0;
  const ageDays = joined ? (Date.now() - joined) / 86_400_000 : Infinity; // unknown age → don't penalise
  if (followers < MIN_FOLLOWERS && ageDays < MIN_AGE_DAYS) return false;
  return true;
}

/** Stocktwits recent-message sentiment for a US ticker → tagged Bullish/Bearish counts, AFTER the
 *  bot/promo screen (so a brigaded bull% gets discounted). `dropped` = quality-failed tagged msgs,
 *  for transparency. Best-effort (null on failure / no coverage). */
export async function fetchStocktwitsSentiment(ticker: string): Promise<{ bull: number; bear: number; dropped: number } | null> {
  const r = await fetch(`https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(ticker)}.json`, {
    headers: { "User-Agent": "grq/0.1 (+https://grq.camerontora.ca)" },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!r || !r.ok) return null;
  const j = (await r.json().catch(() => null)) as { messages?: StwMsg[] } | null;
  if (!j?.messages) return null;
  let bull = 0;
  let bear = 0;
  let dropped = 0;
  for (const m of j.messages) {
    const s = m.entities?.sentiment?.basic;
    if (s !== "Bullish" && s !== "Bearish") continue; // untagged — no sentiment either way
    if (!isQualityAuthor(m)) {
      dropped++;
      continue;
    }
    if (s === "Bullish") bull++;
    else bear++;
  }
  return { bull, bear, dropped };
}
