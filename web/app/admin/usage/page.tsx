import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { isOwner } from "@/lib/users";
import { Card, StatCard, PageHeader, Chip, EmptyState } from "@/components/ui";
import { getUsageDashboard, fmtTokens, fmtUsd, fmtDuration } from "@/lib/usage";
import UsageWindowControl from "@/components/UsageWindowControl";

export const dynamic = "force-dynamic";

function timeAgo(d: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function etTime(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

const tabClass = (active: boolean) =>
  `rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
    active ? "bg-teal-400/15 text-teal-200" : "text-teal-200/50 hover:bg-teal-400/10 hover:text-teal-100"
  }`;

export default async function AdminUsagePage() {
  const session = await getSession();
  // Same lock as /admin — owner only; everyone else gets a 404.
  if (!session || !isOwner(session.email)) notFound();

  const { today, rolling5h, recent, maxFiveH, windowResetAt, generatedAt } = await getUsageDashboard();

  const dayTotal = today.totals.total || 1; // avoid /0
  const fivePct = maxFiveH ? Math.min(100, Math.round((rolling5h.total / maxFiveH) * 100)) : null;
  const remaining = maxFiveH ? Math.max(0, maxFiveH - rolling5h.total) : null;

  return (
    <main>
      <PageHeader
        title="Admin · Token usage"
        sub="What the autonomous agent spends of Cam's shared Claude Max quota."
        right={
          <div className="flex items-center gap-1 rounded-xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-1">
            <Link href="/admin" className={tabClass(false)}>
              Traffic
            </Link>
            <Link href="/admin/usage" className={tabClass(true)}>
              Tokens
            </Link>
          </div>
        }
      />

      {today.totals.calls === 0 ? (
        <EmptyState
          title="No agent sessions logged yet today"
          body="Token logging records one row per Claude session. Once the agent runs a session today (or after the next deploy), totals appear here. Times are Eastern."
        />
      ) : (
        <div className="space-y-8">
          {/* Today's headline numbers */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Tokens today" value={fmtTokens(today.totals.total)} note={`${today.totals.calls} sessions`} />
            <StatCard label="Fresh input" value={fmtTokens(today.totals.input)} />
            <StatCard label="Output" value={fmtTokens(today.totals.output)} />
            <StatCard
              label="Cache (write / read)"
              value={`${fmtTokens(today.totals.cacheWrite)} / ${fmtTokens(today.totals.cacheRead)}`}
              note="reads are cheap, still count"
            />
            <StatCard
              label="Est. cost"
              value={today.totals.costMicroUsd > 0 ? fmtUsd(today.totals.costMicroUsd) : "—"}
              note={today.totals.costMicroUsd > 0 ? "if metered" : "Max token: unmetered"}
            />
            <StatCard label="Last 5h" value={fmtTokens(rolling5h.total)} note={`${rolling5h.calls} sessions`} />
          </div>

          {/* Rolling 5-hour window — the thing that trips the Max limit */}
          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">
                Rolling 5-hour window
              </h2>
              <span className="text-xs text-teal-200/40">
                the Max plan resets on a ~5h sliding window · {fmtTokens(rolling5h.total)} burned
                {maxFiveH ? ` of ~${fmtTokens(maxFiveH)} est.` : ""}
              </span>
            </div>
            {fivePct !== null ? (
              <>
                <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-teal-400/10">
                  <div
                    className={`h-full rounded-full ${fivePct >= 90 ? "bg-red-400/70" : fivePct >= 70 ? "bg-amber-400/70" : "bg-teal-400/60"}`}
                    style={{ width: `${fivePct}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-teal-200/50">
                  ~{fmtTokens(remaining ?? 0)} estimated headroom left ({fivePct}% used). This bar is GRQ&apos;s own
                  measured burn against a configurable estimate (<code className="text-teal-200/40">GRQ_MAX_5H_TOKENS</code>),
                  not a number Anthropic reports.
                </div>
              </>
            ) : (
              <div className="mt-2 text-sm text-teal-200/50">
                Anthropic doesn&apos;t expose true remaining quota for a Max subscription, so we track our own measured
                burn: <span className="font-semibold text-teal-100">{fmtTokens(rolling5h.total)} tokens</span> across{" "}
                {rolling5h.calls} sessions in the last 5 hours. Set{" "}
                <code className="text-teal-200/40">GRQ_MAX_5H_TOKENS</code> to show a remaining-headroom bar.
              </div>
            )}
            <UsageWindowControl resetAt={windowResetAt ? windowResetAt.toISOString() : null} />
          </Card>

          {/* Where the day's tokens went, by session type */}
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-teal-200/50">
              By session type · today
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-teal-200/40">
                    <th className="pb-2 font-semibold">Session</th>
                    <th className="pb-2 text-right font-semibold">Sessions</th>
                    <th className="pb-2 text-right font-semibold">Tokens</th>
                    <th className="pb-2 text-right font-semibold">Avg / session</th>
                    <th className="pb-2 pl-4 font-semibold">Share of day</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-400/5">
                  {today.byGroup.map((g) => {
                    const pct = Math.round((g.total / dayTotal) * 100);
                    return (
                      <tr key={g.group}>
                        <td className="py-2 font-medium text-teal-100">{g.group}</td>
                        <td className="py-2 text-right tabular-nums text-teal-100/70">{g.calls}</td>
                        <td className="py-2 text-right tabular-nums text-teal-50">{fmtTokens(g.total)}</td>
                        <td className="py-2 text-right tabular-nums text-teal-100/60">
                          {fmtTokens(Math.round(g.total / Math.max(1, g.calls)))}
                        </td>
                        <td className="py-2 pl-4">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-28 overflow-hidden rounded-full bg-teal-400/10">
                              <div className="h-full rounded-full bg-teal-400/50" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-8 text-right text-xs tabular-nums text-teal-200/50">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Every logged call */}
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-teal-200/50">
              Recent sessions <span className="text-teal-200/30">({recent.length})</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-teal-200/40">
                    <th className="pb-2 font-semibold">Time (ET)</th>
                    <th className="pb-2 font-semibold">Session</th>
                    <th className="pb-2 text-right font-semibold">Turns</th>
                    <th className="pb-2 text-right font-semibold">In</th>
                    <th className="pb-2 text-right font-semibold">Out</th>
                    <th className="pb-2 text-right font-semibold">Cache R</th>
                    <th className="pb-2 text-right font-semibold">Total</th>
                    <th className="pb-2 pl-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-400/5">
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 whitespace-nowrap text-teal-100/60" title={timeAgo(r.at)}>
                        {etTime(r.at)}
                      </td>
                      <td className="py-2 font-medium text-teal-100">
                        {r.label}
                        {r.durationMs ? <span className="ml-2 text-xs text-teal-200/30">{fmtDuration(r.durationMs)}</span> : null}
                      </td>
                      <td className="py-2 text-right tabular-nums text-teal-100/60">{r.numTurns}</td>
                      <td className="py-2 text-right tabular-nums text-teal-100/60">{fmtTokens(r.inputTokens)}</td>
                      <td className="py-2 text-right tabular-nums text-teal-100/60">{fmtTokens(r.outputTokens)}</td>
                      <td className="py-2 text-right tabular-nums text-teal-100/40">{fmtTokens(r.cacheReadTokens)}</td>
                      <td className="py-2 text-right tabular-nums font-semibold text-teal-50">{fmtTokens(r.total)}</td>
                      <td className="py-2 pl-3">
                        <Chip tone={r.status === "success" ? "green" : "red"}>{r.status}</Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-xs text-teal-200/30">
            One row per Claude session, summed across subagent fan-out. Generated {timeAgo(generatedAt)} · times Eastern ·
            the agent shares Cam&apos;s Claude Max token, so this burn competes with interactive Claude Code usage.
          </p>
        </div>
      )}
    </main>
  );
}
