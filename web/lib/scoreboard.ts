import { prisma } from "./db";

// Source scoreboard (2.6a): aggregate retro grades into hit-rates so the fund
// learns which inputs deserve trust. Signal families compete with news outlets
// on equal terms.

export type SourceScore = {
  source: string;
  grades: number;
  hits: number;
  misses: number;
  neutral: number;
  hitRate: number | null; // null until minGrades reached
  lastAt: Date;
};

export const MIN_GRADES_TO_RANK = 3;

export async function getScoreboard(symbol?: string): Promise<SourceScore[]> {
  const rows = await prisma.sourceGrade.findMany({
    where: symbol ? { symbol: symbol.toUpperCase() } : undefined,
  });
  const by = new Map<string, SourceScore>();
  for (const r of rows) {
    const key = r.source.trim().toLowerCase();
    const s =
      by.get(key) ??
      ({ source: key, grades: 0, hits: 0, misses: 0, neutral: 0, hitRate: null, lastAt: r.at } as SourceScore);
    s.grades++;
    if (r.grade > 0) s.hits++;
    else if (r.grade < 0) s.misses++;
    else s.neutral++;
    if (r.at > s.lastAt) s.lastAt = r.at;
    by.set(key, s);
  }
  const out = [...by.values()];
  for (const s of out) {
    const decisive = s.hits + s.misses;
    s.hitRate = s.grades >= MIN_GRADES_TO_RANK && decisive > 0 ? s.hits / decisive : null;
  }
  return out.sort((a, b) => {
    if (a.hitRate !== null && b.hitRate !== null) return b.hitRate - a.hitRate || b.grades - a.grades;
    if (a.hitRate !== null) return -1;
    if (b.hitRate !== null) return 1;
    return b.grades - a.grades;
  });
}

export function scoreboardText(rows: SourceScore[], max = 15): string {
  if (rows.length === 0) return "(no source grades yet)";
  return rows
    .slice(0, max)
    .map(
      (s) =>
        `${s.source}: ${s.hitRate !== null ? `${Math.round(s.hitRate * 100)}% hit-rate` : "unranked"} (${s.hits}✓ ${s.misses}✗ ${s.neutral}· over ${s.grades})`,
    )
    .join("\n");
}
