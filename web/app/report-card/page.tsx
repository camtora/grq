import Link from "next/link";
import { PageHeader, Card, Chip, StatCard, EmptyState } from "@/components/ui";
import PanelHeader from "@/components/PanelHeader";
import { money, fmtWhen } from "@/lib/money";
import { loadReportCard, type ReportRow } from "@/lib/report-card/load";
import type { Tally } from "@/lib/report-card/score";

// Report Card (docs/REPORT-CARD.md) — a forward-test ledger that grades the fund's dated,
// directional predictions (Chess plays · Alfred's calls · Hunt leads) against actual price
// action. Graded on ABSOLUTE DIRECTION: an UP call is right when the price rose, a DOWN call
// when it fell. Read-only — it never edits or trades the source experiments.
export const dynamic = "force-dynamic";

const SOURCE_TONE: Record<string, "teal" | "green" | "red" | "dim"> = { chess: "teal", call: "green", hunt: "dim" };

const fmtBps = (bps: number | null): string => (bps == null ? "—" : `${bps >= 0 ? "+" : ""}${(bps / 100).toFixed(1)}%`);
const retClass = (bps: number | null): string =>
  bps == null ? "text-teal-200/30" : bps > 0 ? "text-emerald-400" : bps < 0 ? "text-red-400" : "text-amber-300/70";
const hitRateStr = (t: Tally): string => (t.hitRate == null ? "—" : `${Math.round(t.hitRate * 100)}%`);

function TallyCard({ label, t, note }: { label: string; t: Tally; note?: string }) {
  return (
    <StatCard
      label={label}
      value={hitRateStr(t)}
      valueClassName={t.hitRate == null ? "text-teal-200/40" : t.hitRate >= 0.5 ? "text-emerald-400" : "text-red-400"}
      note={note ?? `${t.green}/${t.graded} right · avg ${fmtBps(t.avgCalledReturnBps)}${t.pending ? ` · ${t.pending} pending` : ""}`}
    />
  );
}

export default async function ReportCardPage() {
  const { rows, overall, bySource, byEffectOrder, asOf } = await loadReportCard();

  return (
    <main>
      <PageHeader
        title="Report Card"
        sub="Were the calls right? Every dated, directional prediction the fund makes — a Chess play, an Alfred call, a Hunt lead — is snapshotted at the price it was made and marked to the live tape. Graded on absolute direction: an UP call scores when the price rose, a DOWN call when it fell. Leads and calls alike, kept honest against what the market actually did."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No predictions on the board yet"
          body="Once Alfred maps a Chess board, sets a call on a dossier, or surfaces a Hunt lead, it lands here and starts getting graded against the tape. Run the next session — or the snapshot script — and check back."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TallyCard label="Overall hit rate" t={overall} />
            {bySource.map((s) => (
              <TallyCard key={s.source} label={s.label} t={s.tally} />
            ))}
          </div>

          {byEffectOrder.length > 0 && (
            <div className="mt-6">
              <PanelHeader>
                Does the ripple pay? <span className="font-normal normal-case text-teal-200/40">· Chess plays by effect-order</span>
              </PanelHeader>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                {byEffectOrder.map((e) => (
                  <TallyCard key={e.order} label={`${e.order}${["", "st", "nd", "rd"][e.order] ?? "th"}-order`} t={e.tally} />
                ))}
              </div>
            </div>
          )}

          <div className="mt-7">
            <PanelHeader>
              Every call <span className="font-normal normal-case text-teal-200/40">· {rows.length}, newest first · green = the call paid</span>
            </PanelHeader>
            <Card className="mt-2 overflow-x-auto p-0">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-teal-400/10 text-left text-[11px] uppercase tracking-wider text-teal-200/40">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-3 py-2.5 font-medium">Call</th>
                    <th className="px-3 py-2.5 text-right font-medium">Entry</th>
                    <th className="px-3 py-2.5 text-right font-medium">Now</th>
                    <th className="px-3 py-2.5 text-right font-medium">Called</th>
                    <th className="px-3 py-2.5 text-right font-medium">Verdict</th>
                    <th className="px-3 py-2.5 text-right font-medium">Filed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Row key={r.id} r={r} />
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <p className="mt-6 text-xs text-teal-200/40">
            Marked to the live quote (or the last close when the market&apos;s shut), as of {fmtWhen(asOf)}. &ldquo;Called&rdquo; is the
            return oriented to the bet — a correct DOWN call shows green. Each prediction is scored on its own from the moment it was
            filed (a re-researched name is a fresh call), entry anchored on the close the market had made at that time. A new prediction
            on an untracked name shows once the snapshot pulls its price history. Grading judgment ≠ trading: a call becomes tradeable
            only after a full dossier clears the same guardrails as everything else.
          </p>
        </>
      )}
    </main>
  );
}

function Row({ r }: { r: ReportRow }) {
  return (
    <tr className="border-b border-teal-400/5 last:border-0 hover:bg-teal-400/[0.03]">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Link href={`/stocks/${encodeURIComponent(r.symbol)}`} className="font-mono text-xs font-semibold text-teal-200 hover:underline">
            {r.symbol}
          </Link>
          <Chip tone={SOURCE_TONE[r.source]}>{r.source}</Chip>
        </div>
        {r.context && <div className="mt-0.5 max-w-[16rem] truncate text-[11px] text-teal-200/40">{r.context}</div>}
      </td>
      <td className="px-3 py-2.5">
        <span className={r.direction === "UP" ? "text-emerald-300/90" : "text-red-300/90"}>
          {r.direction === "UP" ? "▲" : "▼"} {r.label}
        </span>
        {r.conviction != null && <span className="ml-1.5 text-[11px] text-teal-200/40">{r.conviction}</span>}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-teal-100/70">{money(r.entryPriceCents, r.currency)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-teal-100/70">{r.markCents != null ? money(r.markCents, r.currency) : "—"}</td>
      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${retClass(r.calledReturnBps)}`}>{fmtBps(r.calledReturnBps)}</td>
      <td className="px-3 py-2.5 text-right">
        {r.isGreen == null ? (
          <span className="text-[11px] text-teal-200/30">pending</span>
        ) : r.isGreen ? (
          <span className="text-emerald-400">✓ right</span>
        ) : (
          <span className="text-red-400">✗ wrong</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right text-[11px] text-teal-200/40">{r.ageDays}d ago</td>
    </tr>
  );
}
