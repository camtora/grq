import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { isOwner } from "@/lib/users";
import { getUsage } from "@/lib/admin";
import { Card, StatCard, PageHeader, Chip, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const WINDOWS: { days: number; label: string }[] = [
  { days: 1, label: "24h" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

function timeAgo(d: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function roleTone(role: string): "teal" | "green" | "dim" {
  if (role === "owner") return "teal";
  if (role === "member") return "green";
  return "dim";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await getSession();
  // The lock. Members (Graham) and viewers get a 404 — the page does not exist
  // for them. Hiding the nav link is cosmetic; THIS is the enforcement.
  if (!session || !isOwner(session.email)) notFound();

  const sp = await searchParams;
  const days = WINDOWS.some((w) => String(w.days) === sp.days) ? Number(sp.days) : 7;
  const windowLabel = WINDOWS.find((w) => w.days === days)?.label ?? `${days} days`;
  const usage = await getUsage(days);

  const maxSection = Math.max(1, ...usage.bySection.map((s) => s.views));

  return (
    <main>
      <PageHeader
        title="Admin · Usage"
        sub="Who's using GRQ, and which sections get the traffic."
        right={
          <div className="flex items-center gap-1 rounded-xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-1">
            {WINDOWS.map((w) => (
              <Link
                key={w.days}
                href={`/admin?days=${w.days}`}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                  w.days === days
                    ? "bg-teal-400/15 text-teal-200"
                    : "text-teal-200/50 hover:bg-teal-400/10 hover:text-teal-100"
                }`}
              >
                {w.label}
              </Link>
            ))}
          </div>
        }
      />

      {usage.totalViews === 0 ? (
        <EmptyState
          title="No traffic logged yet"
          body={
            <>
              Page views are recorded as people navigate the site (last{" "}
              <span className="text-teal-200/70">{windowLabel}</span> shown). Come back once there&rsquo;s
              activity — or widen the window above.
            </>
          }
        />
      ) : (
        <div className="space-y-8">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Page views" value={usage.totalViews.toLocaleString()} note={`last ${windowLabel}`} />
            <StatCard label="Active people" value={String(usage.uniqueUsers)} note="distinct signed-in users" />
            <StatCard
              label="Top section"
              value={usage.bySection[0]?.section ?? "—"}
              note={usage.bySection[0] ? `${usage.bySection[0].views.toLocaleString()} views` : undefined}
            />
          </div>

          {/* Most-used sections */}
          <Card className="p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-teal-200/60">Most-used sections</h2>
            <div className="mt-4 space-y-2.5">
              {usage.bySection.map((s) => (
                <div key={s.section} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 truncate text-sm text-teal-100/80">{s.section}</div>
                  <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-teal-400/5">
                    <div
                      className="absolute inset-y-0 left-0 rounded-md bg-teal-400/25"
                      style={{ width: `${Math.round((s.views / maxSection) * 100)}%` }}
                    />
                  </div>
                  <div className="w-24 shrink-0 text-right text-xs tabular-nums text-teal-200/60">
                    {s.views.toLocaleString()}{" "}
                    <span className="text-teal-200/35">· {s.users}p</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* By person */}
          <Card className="p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-teal-200/60">By person</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-teal-200/40">
                    <th className="pb-2 pr-4 font-medium">User</th>
                    <th className="pb-2 pr-4 font-medium">Role</th>
                    <th className="pb-2 pr-4 text-right font-medium">Views</th>
                    <th className="pb-2 pr-4 font-medium">Top section</th>
                    <th className="pb-2 font-medium">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-400/5">
                  {usage.byUser.map((u) => (
                    <tr key={u.email}>
                      <td className="py-2 pr-4">
                        <span className="text-teal-50">{u.name ?? u.email.split("@")[0]}</span>
                        {u.name && <span className="ml-2 text-xs text-teal-200/40">{u.email}</span>}
                      </td>
                      <td className="py-2 pr-4">
                        <Chip tone={roleTone(u.role)}>{u.role}</Chip>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-teal-100/80">
                        {u.views.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-teal-200/70">{u.topSection ?? "—"}</td>
                      <td className="py-2 text-teal-200/50">{timeAgo(u.lastSeen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Person × section matrix */}
          <Card className="p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-teal-200/60">
              Who uses what
            </h2>
            <p className="mt-1 text-xs text-teal-200/40">Views per person, per section.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-teal-200/40">
                    <th className="sticky left-0 bg-[var(--card-bg)] pb-2 pr-4 text-left font-medium">User</th>
                    {usage.matrix.sections.map((s) => (
                      <th key={s} className="px-2 pb-2 text-right font-medium whitespace-nowrap">
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-400/5">
                  {usage.matrix.rows.map((row) => {
                    const name = usage.byUser.find((u) => u.email === row.email)?.name;
                    return (
                      <tr key={row.email}>
                        <td className="sticky left-0 bg-[var(--card-bg)] py-2 pr-4 text-teal-50 whitespace-nowrap">
                          {name ?? row.email.split("@")[0]}
                        </td>
                        {usage.matrix.sections.map((s) => {
                          const n = row.counts[s] ?? 0;
                          return (
                            <td
                              key={s}
                              className={`px-2 py-2 text-right tabular-nums ${
                                n ? "text-teal-100/80" : "text-teal-200/15"
                              }`}
                            >
                              {n || "·"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Recent activity */}
          <Card className="p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-teal-200/60">Recent activity</h2>
            <div className="mt-4 space-y-1.5">
              {usage.recent.map((r, i) => (
                <div key={i} className="flex items-baseline gap-3 text-sm">
                  <span className="w-16 shrink-0 text-xs tabular-nums text-teal-200/40">{timeAgo(r.at)}</span>
                  <span className="w-24 shrink-0 truncate text-teal-100/80">
                    {r.name ?? r.email.split("@")[0]}
                  </span>
                  <span className="w-28 shrink-0 text-teal-200/70">{r.section}</span>
                  <span className="truncate text-xs text-teal-200/35">{r.path}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
