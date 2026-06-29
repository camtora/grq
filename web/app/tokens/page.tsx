import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { isOwner } from "@/lib/users";
import { Card, StatCard, PageHeader, Chip, EmptyState } from "@/components/ui";
import PanelHeader from "@/components/PanelHeader";
import { getUsageDashboard, fmtTokens, fmtUsd, fmtDuration } from "@/lib/usage";
import RollingWindowPanel from "@/components/RollingWindowPanel";
import DateNav from "@/components/DateNav";
import { etDateStr } from "@/agent/calendar";
import { modelLabel } from "@/lib/race/models";

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

export default async function AdminUsagePage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const session = await getSession();
  // Same lock as /admin — owner only; everyone else gets a 404.
  if (!session || !isOwner(session.email)) notFound();

  const sp = await searchParams;
  const valid = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d);
  const viewAnchor = valid ? new Date(`${sp.d}T12:00:00Z`) : undefined;
  const { today, byModel, rolling5h, recent, maxFiveH, window, anchorResetAt, generatedAt, isToday } = await getUsageDashboard(60, viewAnchor);
  const dateStr = etDateStr(viewAnchor ?? new Date());

  const dayTotal = today.totals.total || 1; // avoid /0

  return (
    <main>
      <Link href="/settings" className="text-xs text-teal-300 hover:underline">
        ← settings
      </Link>
      <PageHeader
        title="Token usage"
        sub={isToday ? "What the autonomous agent spends of Cam's shared Claude Max quota." : `Agent token burn for ${dateStr}.`}
        right={<DateNav date={dateStr} basePath="/tokens" mode="query" />}
      />

      {today.totals.calls === 0 ? (
        <EmptyState
          title={isToday ? "No agent sessions logged yet today" : `No agent sessions logged on ${dateStr}`}
          body="One row per Claude session (logging started 2026-06-25). Pick another day above, or wait for the agent's next session. Times are Eastern."
        />
      ) : (
        <div className="space-y-8">
          {/* Today's headline numbers */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label={isToday ? "Tokens today" : "Tokens that day"} value={fmtTokens(today.totals.total)} note={`${today.totals.calls} sessions`} />
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
            {isToday && (
              <StatCard
                label="This 5h window"
                value={fmtTokens(rolling5h.total)}
                note={`${rolling5h.calls} sessions${window ? "" : " · sliding"}`}
              />
            )}
          </div>

          {/* Rolling 5-hour window — the thing that trips the Max limit. Auto-rolls every 5h from
              the owner-set anchor; the panel shows token burn beside time elapsed so you can see
              whether the agent is spending ahead of the clock. Live-only — a past day has no
              "current" window, so it shows just that day's totals below. */}
          {isToday && (
          <Card className="p-5">
            <PanelHeader
              right={
                <span className="text-xs text-teal-200/40">
                  {window
                    ? "auto-rolling 5h window · burn vs the clock"
                    : "sliding ~5h window · anchor a reset to track the clock"}
                </span>
              }
            >
              Rolling 5-hour window
            </PanelHeader>
            <RollingWindowPanel
              anchorAt={anchorResetAt ? anchorResetAt.toISOString() : null}
              serverWindowStart={window ? window.start.toISOString() : null}
              tokensBurned={rolling5h.total}
              maxFiveH={maxFiveH}
            />
            <p className="mt-3 text-xs text-teal-200/40">
              The token bar is GRQ&apos;s own measured burn against a configurable estimate
              (<code className="text-teal-200/40">GRQ_MAX_5H_TOKENS</code>), not a number Anthropic reports for a Max
              subscription.
            </p>
          </Card>
          )}

          {/* Where the day's tokens went, by session type */}
          <Card className="p-5">
            <div className="mb-3"><PanelHeader>By session type · {isToday ? "today" : dateStr}</PanelHeader></div>
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

          {/* Per-model — which models ate the tokens (and $). Real spend = OpenRouter challengers;
              claude-* are on the Max flat fee so their $ is the metered-equivalent, not a charge. */}
          <Card className="p-5">
            <div className="mb-1">
              <PanelHeader
                right={(() => {
                  const realSpend = byModel.filter((m) => m.group.includes("/")).reduce((s, m) => s + m.costMicroUsd, 0);
                  return realSpend > 0 ? (
                    <span className="text-xs text-teal-200/50">
                      real OpenRouter spend: <span className="font-semibold tabular-nums text-teal-100">{fmtUsd(realSpend)}</span>
                    </span>
                  ) : null;
                })()}
              >
                By model · {isToday ? "today" : dateStr}
              </PanelHeader>
            </div>
            <p className="mb-3 text-xs text-teal-200/40">
              Claude models run on the shared Max subscription (a flat monthly fee), so their $ is the metered-EQUIVALENT, not
              a charge. The slash-named challengers (gpt-5.1, gemini…) are billed per token on OpenRouter — that $ is real spend.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-teal-200/40">
                    <th className="pb-2 font-semibold">Model</th>
                    <th className="pb-2 text-right font-semibold">Calls</th>
                    <th className="pb-2 text-right font-semibold">Tokens</th>
                    <th className="pb-2 text-right font-semibold">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-400/5">
                  {byModel.map((m) => {
                    const real = m.group.includes("/"); // OpenRouter challenger → real $; claude-* → Max flat fee
                    return (
                      <tr key={m.group}>
                        <td className="py-2 font-medium text-teal-100">
                          {modelLabel(m.group)}
                          <span className="ml-2 text-[10px] uppercase tracking-wider text-teal-200/30">{real ? "OpenRouter" : "Max"}</span>
                        </td>
                        <td className="py-2 text-right tabular-nums text-teal-100/70">{m.calls}</td>
                        <td className="py-2 text-right tabular-nums text-teal-50">{fmtTokens(m.total)}</td>
                        <td className={`py-2 text-right tabular-nums ${real ? "text-teal-50" : "text-teal-200/40"}`}>
                          {m.costMicroUsd > 0 ? fmtUsd(m.costMicroUsd) : "—"}
                          {!real && m.costMicroUsd > 0 ? <span className="ml-1 text-[10px] text-teal-200/30">if metered</span> : null}
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
            <div className="mb-3"><PanelHeader>Recent sessions <span className="text-teal-200/30">({recent.length})</span></PanelHeader></div>
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
