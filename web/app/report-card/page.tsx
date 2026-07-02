import { PageHeader, StatCard, EmptyState } from "@/components/ui";
import PanelHeader from "@/components/PanelHeader";
import { fmtWhen } from "@/lib/money";
import { loadReportCard } from "@/lib/report-card/load";
import type { Tally } from "@/lib/report-card/score";
import ReportCardTable from "@/components/report-card/ReportCardTable";

// Report Card (docs/REPORT-CARD.md) — a forward-test ledger that grades the fund's dated,
// directional predictions (Chess plays · Alfred's calls · Hunt leads) against actual price
// action. Graded on ABSOLUTE DIRECTION: an UP call is right when the price rose, a DOWN call
// when it fell. Read-only — it never edits or trades the source experiments.
export const dynamic = "force-dynamic";

const fmtBps = (bps: number | null): string => (bps == null ? "—" : `${bps >= 0 ? "+" : ""}${(bps / 100).toFixed(1)}%`);
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
              Every call <span className="font-normal normal-case text-teal-200/40">· newest first · green = the call paid · filter below</span>
            </PanelHeader>
            <div className="mt-2">
              <ReportCardTable rows={rows} />
            </div>
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
