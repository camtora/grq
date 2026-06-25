import { prisma } from "@/lib/db";
import { userForEmail, isOwner, roleForEmail } from "@/lib/users";

// Aggregations for the owner-only /admin usage dashboard. All read-only over the
// PageView table. Everything is bounded to a trailing window so the page stays
// fast as the log grows. We pivot in JS (small data — ~9 humans) rather than
// firing many grouped queries.

// Canonical display order — mirrors the header nav so the dashboard reads
// top-to-bottom like the site does. Anything unseen is just omitted.
const SECTION_ORDER = [
  "Today",
  "Portfolio",
  "Watchlist",
  "Smart Money",
  "Universe",
  "The Hunt",
  "Browse",
  "Stock",
  "Research",
  "Reports",
  "Settings",
  "Chat",
  "Journal",
  "Activity",
  "Ideas",
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

export type Usage = {
  days: number;
  totalViews: number;
  uniqueUsers: number;
  bySection: SectionStat[];
  byUser: UserStat[];
  matrix: UsageMatrix;
  recent: RecentView[];
};

export async function getUsage(days: number): Promise<Usage> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const where = { at: { gte: since } };

  const [byUserRole, bySectionUser, recentRows] = await Promise.all([
    prisma.pageView.groupBy({
      by: ["email", "role"],
      where,
      _count: { _all: true },
      _max: { at: true },
    }),
    prisma.pageView.groupBy({
      by: ["section", "email"],
      where,
      _count: { _all: true },
    }),
    prisma.pageView.findMany({
      where,
      orderBy: { at: "desc" },
      take: 60,
      select: { at: true, email: true, section: true, path: true },
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
  // top section — all from the one (section,email) grouping.
  const sectionTotals = new Map<string, { views: number; users: Set<string> }>();
  const matrixCounts = new Map<string, Record<string, number>>();
  const userTop = new Map<string, { section: string; views: number }>();
  for (const g of bySectionUser) {
    const n = g._count._all;
    const st = sectionTotals.get(g.section) ?? { views: 0, users: new Set<string>() };
    st.views += n;
    st.users.add(g.email);
    sectionTotals.set(g.section, st);

    const row = matrixCounts.get(g.email) ?? {};
    row[g.section] = n;
    matrixCounts.set(g.email, row);

    const top = userTop.get(g.email);
    if (!top || n > top.views) userTop.set(g.email, { section: g.section, views: n });
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
    section: r.section,
    path: r.path,
  }));

  return {
    days,
    totalViews: byUser.reduce((s, u) => s + u.views, 0),
    uniqueUsers: userMap.size,
    bySection,
    byUser,
    matrix,
    recent,
  };
}
