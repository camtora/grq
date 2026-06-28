import { prisma } from "@/lib/db";

// The GRQ Daily masthead's quote/joke. Lives in the DailyQuote table so members can
// add / edit / reorder / disable lines from Settings without a deploy. Selection is
// deterministic per Toronto-day (same pattern as greetings.ts) so it's stable through
// the day and turns over each morning — EXCEPT a line pinned to today's date, which
// wins (the "make sure Graham sees THIS today" lever). The SEED_QUOTES below seed an
// empty table on first read and act as a fallback if the table is somehow empty.

export const SEED_QUOTES: string[] = [
  "“The stock market is a device for transferring money from the impatient to the patient.” — Warren Buffett",
  "“In the short run the market is a voting machine; in the long run it is a weighing machine.” — Benjamin Graham",
  "“Be fearful when others are greedy, and greedy when others are fearful.” — Warren Buffett",
  "“The four most dangerous words in investing are: ‘this time it’s different.’” — John Templeton",
  "“Know what you own, and know why you own it.” — Peter Lynch",
  "“Risk comes from not knowing what you’re doing.” — Warren Buffett",
  "“The investor’s chief problem — and even his worst enemy — is likely to be himself.” — Benjamin Graham",
  "Time in the market beats timing the market. Alfred keeps a sticky note to that effect.",
  "Diversification: the art of being wrong in several places at once, comfortably.",
  "A bull market is when your stocks go up; a bear market is when you discover humility.",
  "Why did the trader bring a ladder to work? To buy on the dips.",
  "My portfolio is like my coffee — I like it green, and I get nervous when it isn’t.",
  "“The big money is not in the buying and the selling, but in the waiting.” — Charlie Munger",
  "Compound interest: the eighth wonder of the world, and the only one you can own shares of.",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Toronto calendar date as YYYY-MM-DD — the rotation key + the pin key. */
export function torontoDay(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

/** Seed the table from SEED_QUOTES the first time it's read (idempotent — text is
 *  unique, so skipDuplicates makes concurrent seeds safe). */
async function ensureSeeded(): Promise<void> {
  const n = await prisma.dailyQuote.count();
  if (n > 0) return;
  await prisma.dailyQuote
    .createMany({ data: SEED_QUOTES.map((text, i) => ({ text, sortOrder: i })), skipDuplicates: true })
    .catch(() => {});
}

export type DailyQuoteRow = { id: number; text: string; sortOrder: number; enabled: boolean; pinnedDate: string | null };

/** Which row shows on day `d`: a line pinned to that exact day wins; otherwise the
 *  deterministic hash picks one of the enabled lines (in sortOrder). null if none. */
export async function pickQuoteRow(d = new Date()): Promise<DailyQuoteRow | null> {
  await ensureSeeded();
  const day = torontoDay(d);
  const pinned = await prisma.dailyQuote.findFirst({ where: { enabled: true, pinnedDate: day }, orderBy: { sortOrder: "asc" } });
  if (pinned) return pinned;
  const rows = await prisma.dailyQuote.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } });
  if (rows.length === 0) return null;
  return rows[hash(day) % rows.length];
}

/** The masthead string for day `d` (DB-driven; SEED_QUOTES fallback if the table is empty). */
export async function dailyQuote(d = new Date()): Promise<string> {
  const row = await pickQuoteRow(d);
  if (row) return row.text;
  const day = torontoDay(d);
  return SEED_QUOTES[hash(day) % SEED_QUOTES.length];
}

/** Every line, in display/rotation order — for the Settings manager. */
export async function listQuotes(): Promise<DailyQuoteRow[]> {
  await ensureSeeded();
  return prisma.dailyQuote.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, text: true, sortOrder: true, enabled: true, pinnedDate: true } });
}
