import { prisma } from "@/lib/db";
import { userForEmail, isOwner, roleForEmail } from "@/lib/users";
import { sectionForPath } from "@/lib/sections";

// Aggregations for the owner-only /admin usage dashboard. All read-only over the
// PageView table. Everything is bounded to a trailing window so the page stays
// fast as the log grows. We pivot in JS (small data — ~9 humans) rather than
// firing many grouped queries.

// Canonical display order — mirrors the header nav so the dashboard reads
// top-to-bottom like the site does. Anything unseen is just omitted.
const SECTION_ORDER = [
  "Today",
  "Portfolio",
  "Accounts",
  "Watchlist",
  "Smart Money",
  "Universe",
  "The Hunt",
  "Browse",
  "Stock",
  "Research",
  "Reports",
  "Second Opinions",
  "Bull Race",
  "Options Desk",
  "Chess Moves",
  "Settings",
  "Chat",
  "Journal",
  "Activity",
  "Ideas",
  "How it works",
  "Admin",
  "Other",
];

function orderSections(sections: string[]): string[] {
  const seen = new Set(sections);
  const known = SECTION_ORDER.filter((s) => seen.has(s));
  const extra = sections.filter((s) => !SECTION_ORDER.includes(s)).sort();
  return [...known, ...extra];
}

export type SectionStat = { section: string; views: number; users: number };
export type UserStat = {
  email: string;
  name: string | null;
  role: string;
  views: number;
  lastSeen: Date;
  topSection: string | null;
};
export type RecentView = { at: Date; email: string; name: string | null; section: string; path: string };
export type UsageMatrix = { sections: string[]; rows: { email: string; counts: Record<string, number> }[] };
export type ViewerQuestionView = { at: Date; email: string; name: string | null; message: string; symbol: string | null };

export type Usage = {
  days: number;
  totalViews: number;
  uniqueUsers: number;
  bySection: SectionStat[];
  byUser: UserStat[];
  matrix: UsageMatrix;
  recent: RecentView[];
  viewerQuestions: ViewerQuestionView[];
};

export async function getUsage(days: number): Promise<Usage> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const where = { at: { gte: since } };

  const [byUserRole, bySectionUser, recentRows, viewerQ] = await Promise.all([
    prisma.pageView.groupBy({
      by: ["email", "role"],
      where,
      _count: { _all: true },
      _max: { at: true },
    }),
    prisma.pageView.groupBy({
      by: ["path", "email"],
      where,
      _count: { _all: true },
    }),
    prisma.pageView.findMany({
      where,
      orderBy: { at: "desc" },
      take: 60,
      select: { at: true, email: true, path: true },
    }),
    prisma.viewerQuestion.findMany({
      where,
      orderBy: { at: "desc" },
      take: 50,
      select: { at: true, email: true, message: true, symbol: true },
    }),
  ]);

  // Per-user totals: sum across role groups; role + lastSeen come from the most
  // recent group (a user's role could change between visits).
  const userMap = new Map<string, { views: number; role: string; lastSeen: Date }>();
  for (const g of byUserRole) {
    const at = g._max.at ?? since;
    const prev = userMap.get(g.email);
    const views = (prev?.views ?? 0) + g._count._all;
    if (!prev || at > prev.lastSeen) {
      userMap.set(g.email, { views, role: g.role, lastSeen: at });
    } else {
      userMap.set(g.email, { ...prev, views });
    }
  }

  // Per-section totals + unique users, and the person×section matrix + per-user
  // top section. Group by PATH and re-derive the section here (like role + Recent
  // activity below) so a re-categorisation — e.g. adding "Bull Race" or renaming
  // "Race" → "Second Opinions" — reclassifies historical rows too, not only ones
  // logged after the mapping changed. (Multiple paths fold into one section, so
  // accumulate rather than assign.)
  const sectionTotals = new Map<string, { views: number; users: Set<string> }>();
  const matrixCounts = new Map<string, Record<string, number>>();
  for (const g of bySectionUser) {
    const n = g._count._all;
    const section = sectionForPath(g.path);

    const st = sectionTotals.get(section) ?? { views: 0, users: new Set<string>() };
    st.views += n;
    st.users.add(g.email);
    sectionTotals.set(section, st);

    const row = matrixCounts.get(g.email) ?? {};
    row[section] = (row[section] ?? 0) + n;
    matrixCounts.set(g.email, row);
  }

  // Per-user top section, from the accumulated per-section counts above.
  const userTop = new Map<string, { section: string; views: number }>();
  for (const [email, counts] of matrixCounts) {
    let best: { section: string; views: number } | null = null;
    for (const [section, views] of Object.entries(counts)) {
      if (!best || views > best.views) best = { section, views };
    }
    if (best) userTop.set(email, best);
  }

  const sectionOrder = orderSections([...sectionTotals.keys()]);

  const bySection: SectionStat[] = sectionOrder
    .map((section) => {
      const st = sectionTotals.get(section)!;
      return { section, views: st.views, users: st.users.size };
    })
    .sort((a, b) => b.views - a.views);

  const byUser: UserStat[] = [...userMap.entries()]
    .map(([email, u]) => ({
      email,
      name: userForEmail(email)?.name ?? null,
      // Show the CURRENT authoritative role, not the snapshot stored at view time —
      // a promotion (e.g. Graham → owner) should reflect immediately, not wait for
      // their next page view. Owner > member > viewer.
      role: isOwner(email) ? "owner" : (roleForEmail(email) ?? u.role),
      views: u.views,
      lastSeen: u.lastSeen,
      topSection: userTop.get(email)?.section ?? null,
    }))
    .sort((a, b) => b.views - a.views);

  const matrix: UsageMatrix = {
    sections: sectionOrder,
    rows: byUser.map((u) => ({ email: u.email, counts: matrixCounts.get(u.email) ?? {} })),
  };

  const recent: RecentView[] = recentRows.map((r) => ({
    at: r.at,
    email: r.email,
    name: userForEmail(r.email)?.name ?? null,
    // Re-derive the section from the path at read time (like role above) so a
    // re-categorisation — e.g. adding "Race" — reflects on existing rows too,
    // not only ones logged after the change.
    section: sectionForPath(r.path),
    path: r.path,
  }));

  const viewerQuestions: ViewerQuestionView[] = viewerQ.map((q) => ({
    at: q.at,
    email: q.email,
    name: userForEmail(q.email)?.name ?? null,
    message: q.message,
    symbol: q.symbol,
  }));

  return {
    days,
    totalViews: byUser.reduce((s, u) => s + u.views, 0),
    uniqueUsers: userMap.size,
    bySection,
    byUser,
    matrix,
    recent,
    viewerQuestions,
  };
}
