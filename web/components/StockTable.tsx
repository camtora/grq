import Link from "next/link";
import type { ReactNode } from "react";
import { money, signedMoney, pct, fmtWhen } from "@/lib/money";
import { Card, Chip, Pnl } from "@/components/ui";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";
import RatingBar from "@/components/RatingBar";
import type { Signals, Recommendation } from "@/agent/signals";
import SignalStrip from "@/components/SignalStrip";
import StockLogo from "@/components/StockLogo";
import Md from "@/components/Md";
import Term from "@/components/Term";
import { capTier } from "@/lib/fundamentals";
import UniverseActions from "@/components/UniverseActions";
import ExpandableRow from "@/components/ExpandableRow";
import RowExtras from "@/components/RowExtras";
import Avatar from "@/components/Avatar";
import { personByName, ownerKeyFor } from "@/lib/people";

// One table for both the Universe (the tradeable set) and the Watchlist (candidates)
// — same look, different column list + manage buttons (Cam 2026-06-16). Columns are
// chosen per page; Symbol/Name lead and Manage trails. Server component: the only
// interactive cell is <UniverseActions>, itself a client component.
export type StockManageStatus = "ACTIVE" | "CANDIDATE" | "RETIRED";

export type StockRow = {
  symbol: string;
  name: string;
  logoUrl: string | null;
  currency: string | null;
  note: string | null;
  tier: string | null;
  country: string | null;
  exchange: string | null;
  sector: string | null;
  marketCapM: number | null;
  addedBy?: string | null; // who watched it (watchlist only; null on legacy/agent rows)
  lastCents: number | null;
  dayBps: number | null;
  signals: Signals | null;
  rec: Recommendation | null;
  stance: string | null;
  pinnedBy: string | null;
  blocked: boolean;
  journal: number;
  upsidePct: number | null; // 12-mo target upside
  nearPct: number | null; // near-term target upside (tooltip)
  nearDays: number | null;
  confidence: number | null;
  bottomLine: string | null; // the dossier's plain-English "why" (row expansion)
  held: { qty: number } | null;
  mvCents: number;
  upnlCents: number;
  lastResearchedAt: Date | null;
  manageStatus: StockManageStatus | null;
  promotionRequestedBy: string | null;
  proposedTier: string | null;
  researchInFlight: boolean;
};

export type StockColumn =
  | "tier"
  | "watcher"
  | "last"
  | "day"
  | "signals"
  | "call"
  | "upside"
  | "conf"
  | "position"
  | "unrealized"
  | "journal"
  | "researched";

function StanceCell({ stance, rec }: { stance: string | null; rec: Recommendation | null }) {
  // The slider shows GRQ's CALL (so headline + needle agree). With no dossier yet,
  // fall back to the technical signal — clearly tagged so it reads as an input.
  const m = stance ? stanceMeta(stance) : null;
  if (m) return <RatingBar label={m.label} tone={m.tone} pos={m.pos} note="GRQ's call" title={`GRQ's call: ${m.blurb}`} />;
  const sm = rec ? stanceMeta(rec.label) : null;
  if (sm) return <RatingBar label={sm.label} tone={sm.tone} pos={sm.pos} note="technical lean" title="No GRQ call yet — technical signal only (an input, not a verdict)" />;
  return <span className="text-xs text-teal-200/25">— no read yet</span>;
}

const HEADERS: Record<StockColumn, { label: ReactNode; align: boolean }> = {
  tier: { label: "Tier", align: false },
  watcher: { label: "Added by", align: false },
  last: { label: "Last", align: true },
  day: { label: "Day", align: true },
  signals: { label: "Signals", align: false },
  call: { label: <>GRQ&apos;s call</>, align: false },
  upside: {
    label: (
      <Term k="expected-return" align="right">
        12-mo
      </Term>
    ),
    align: true,
  },
  conf: {
    label: (
      <Term k="confidence" align="right">
        Conf
      </Term>
    ),
    align: true,
  },
  position: { label: "Position", align: true },
  unrealized: { label: "Unrealized", align: true },
  journal: { label: "Journal", align: true },
  researched: { label: "Researched", align: true },
};

function Cell({ col, r }: { col: StockColumn; r: StockRow }) {
  switch (col) {
    case "tier":
      return (
        <td className="px-4 py-2.5">
          <Chip tone="dim">{r.tier ?? "—"}</Chip>
        </td>
      );
    case "watcher": {
      const p = personByName(r.addedBy);
      // Cam/Graham → their photo; everything else (the agent, hunt finds, seed/legacy
      // adds) → the GRQ bull. Every row gets a face — no empty "—" (Cam 2026-06-18).
      return (
        <td className="px-4 py-2.5">
          <div className="flex justify-center">
            <Avatar src={p?.photo ?? "/bull-splash.png"} name={p?.name ?? "Agent"} />
          </div>
        </td>
      );
    }
    case "last":
      return <td className="px-4 py-2.5 text-right tabular-nums text-teal-100/80">{r.lastCents !== null ? money(r.lastCents, r.currency) : "—"}</td>;
    case "day": {
      // Today's move in dollars alongside the percent: derive the $ change from the
      // last price and the day % (prevClose = last / (1 + day%)), since the quote
      // cache only carries the bps. (Cam 2026-06-18)
      const f = (r.dayBps ?? 0) / 10_000;
      const chgCents =
        r.lastCents !== null && r.dayBps !== null && 1 + f !== 0 ? Math.round(r.lastCents - r.lastCents / (1 + f)) : null;
      return (
        <td
          className={`px-4 py-2.5 text-right tabular-nums ${
            (r.dayBps ?? 0) > 0 ? "text-emerald-400" : (r.dayBps ?? 0) < 0 ? "text-red-400" : "text-teal-200/50"
          }`}
        >
          {r.dayBps !== null ? (
            <span className="inline-flex items-baseline justify-end gap-1.5">
              {chgCents !== null && <span className="text-xs opacity-70">{signedMoney(chgCents, r.currency)}</span>}
              <span>{pct(r.dayBps / 10_000, 2)}</span>
            </span>
          ) : (
            "—"
          )}
        </td>
      );
    }
    case "signals":
      return (
        <td className="px-4 py-2.5">
          <SignalStrip signals={r.signals} />
        </td>
      );
    case "call":
      return (
        <td className="px-4 py-2.5">
          <StanceCell stance={r.stance} rec={r.rec} />
        </td>
      );
    case "upside":
      return (
        <td
          className={`px-4 py-2.5 text-right tabular-nums ${
            r.upsidePct == null ? "text-teal-200/30" : r.upsidePct > 0 ? "text-emerald-400" : "text-red-400"
          }`}
          title={
            r.nearPct != null
              ? `near-term ${r.nearPct > 0 ? "+" : ""}${pct(r.nearPct, 0)}${r.nearDays ? ` (~${Math.max(1, Math.round(r.nearDays / 5))}w)` : ""}`
              : undefined
          }
        >
          {r.upsidePct != null ? `${r.upsidePct > 0 ? "+" : ""}${pct(r.upsidePct, 0)}` : "—"}
        </td>
      );
    case "conf":
      return <td className="px-4 py-2.5 text-right tabular-nums text-teal-200/50">{r.confidence != null ? `${r.confidence}%` : "—"}</td>;
    case "position":
      return <td className="px-4 py-2.5 text-right tabular-nums text-teal-50">{r.held ? `${r.held.qty} sh · ${money(r.mvCents)}` : ""}</td>;
    case "unrealized":
      return <td className="px-4 py-2.5 text-right">{r.held ? <Pnl cents={r.upnlCents} className="text-sm" /> : ""}</td>;
    case "journal":
      return <td className="px-4 py-2.5 text-right tabular-nums text-teal-200/50">{r.journal > 0 ? r.journal : ""}</td>;
    case "researched":
      return (
        <td className="px-4 py-2.5 text-right text-xs tabular-nums text-teal-200/40" title="Last completed research">
          {r.lastResearchedAt ? fmtWhen(r.lastResearchedAt) : "—"}
        </td>
      );
  }
}

// A row only expands if there's something worth showing under it.
function hasDetail(r: StockRow): boolean {
  return !!(r.stance || r.rec || r.bottomLine || r.upsidePct != null || r.nearPct != null);
}

// The expansion panel: GRQ's call + its one-line blurb, the plain-English "why"
// (the dossier's bottomLine), the targets, and a link to the full dossier. Server-
// rendered and handed to <ExpandableRow> as a prop (Cam 2026-06-17).
function RowDetail({ r }: { r: StockRow }) {
  const m = r.stance ? stanceMeta(r.stance) : null;
  const tech = !m && r.rec ? stanceMeta(r.rec.label) : null;
  return (
    <div className="rounded-xl border border-teal-400/10 bg-teal-400/[0.03] p-4">
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-3">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-teal-200/50">
          <Term k="agent-call">GRQ&apos;s call</Term>
        </div>
        {m ? (
          <>
            <span className={`text-3xl font-black leading-tight ${STANCE_TONE_CLASSES[m.tone].text}`}>{m.label}</span>
            <p className="mt-1 text-sm text-teal-200/65">{m.blurb}</p>
          </>
        ) : tech ? (
          <>
            <span className={`text-3xl font-black leading-tight ${STANCE_TONE_CLASSES[tech.tone].text}`}>{tech.label}</span>
            <p className="mt-1 text-xs text-teal-200/45">technical lean only — GRQ hasn&apos;t filed a call yet</p>
          </>
        ) : (
          <p className="mt-0.5 text-sm text-teal-200/40">Not yet rated by GRQ.</p>
        )}
        {(r.nearPct != null || r.upsidePct != null || r.confidence != null) && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-teal-200/55">
            {r.nearPct != null && (
              <span>
                near{r.nearDays ? ` ~${Math.max(1, Math.round(r.nearDays / 5))}w` : ""}{" "}
                <b className={r.nearPct > 0 ? "text-emerald-400" : "text-red-400"}>
                  {r.nearPct > 0 ? "+" : ""}
                  {pct(r.nearPct, 0)}
                </b>
              </span>
            )}
            {r.upsidePct != null && (
              <span>
                <Term k="expected-return">12-mo</Term>{" "}
                <b className={r.upsidePct > 0 ? "text-emerald-400" : "text-red-400"}>
                  {r.upsidePct > 0 ? "+" : ""}
                  {pct(r.upsidePct, 0)}
                </b>
              </span>
            )}
            {r.confidence != null && (
              <span>
                <Term k="confidence">conf</Term> {r.confidence}%
              </span>
            )}
          </div>
        )}
        <RowExtras symbol={r.symbol} />
      </div>
      <div className="md:col-span-2">
        <div className="text-[10px] uppercase tracking-wider text-teal-200/50">Why</div>
        {r.bottomLine ? (
          <div className="mt-1 text-sm text-teal-100/80">
            <Md text={r.bottomLine} />
          </div>
        ) : (
          <p className="mt-1 text-sm text-teal-200/40">
            No plain-English summary on file yet — open the dossier for the full write-up.
          </p>
        )}
        <Link href={`/stocks/${r.symbol}`} className="mt-2 inline-block text-xs text-teal-300 hover:underline">
          full dossier →
        </Link>
      </div>
      </div>
    </div>
  );
}

export default function StockTable({
  rows,
  columns,
  isMember,
  currentUser,
  inUniverseLink = false,
}: {
  rows: StockRow[];
  columns: StockColumn[];
  isMember: boolean;
  currentUser: string;
  inUniverseLink?: boolean; // Watchlist: render ACTIVE rows as an "In universe" link, not the Demote action (which stays on the Universe page).
}) {
  const colSpan = 2 + columns.length + (isMember ? 1 : 0);
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-teal-200/40">
            <th className="px-4 py-3">Symbol</th>
            <th className="px-4 py-3">Name</th>
            {columns.map((c) => (
              <th key={c} className={`px-4 py-3 ${c === "watcher" ? "text-center" : HEADERS[c].align ? "text-right" : ""}`}>
                {HEADERS[c].label}
              </th>
            ))}
            {isMember && <th className="px-4 py-3 text-right">Manage</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const expandable = hasDetail(r);
            return (
            <ExpandableRow
              key={r.symbol}
              className={`stock-row border-t border-teal-400/10 ${r.held || r.pinnedBy ? "bg-teal-400/[0.05]" : ""}`}
              data={{
                "data-country": r.country ?? "",
                "data-exchange": r.exchange ?? "",
                "data-sector": r.sector ?? "",
                "data-cap": capTier(r.marketCapM) ?? "",
                "data-owner": ownerKeyFor(r.addedBy),
              }}
              colSpan={colSpan}
              detail={expandable ? <RowDetail r={r} /> : null}
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`-mr-1 w-3 shrink-0 text-center text-[10px] text-teal-200/30 transition-transform group-aria-expanded:rotate-90 ${
                      expandable ? "" : "opacity-0"
                    }`}
                    aria-hidden
                  >
                    ▸
                  </span>
                  <StockLogo symbol={r.symbol} logoUrl={r.logoUrl} className="h-6 w-6 text-[9px]" />
                  <Link href={`/stocks/${r.symbol}`} className="font-semibold text-teal-300 hover:underline">
                    {r.symbol}
                  </Link>
                  {r.pinnedBy && (
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-teal-400/20 text-[9px] font-black text-teal-200"
                      title={`Priority — pinned by ${r.pinnedBy}`}
                    >
                      {r.pinnedBy.charAt(0)}
                    </span>
                  )}
                  {r.blocked && <span title="No-fly: the agent may not buy this">🚫</span>}
                  {r.currency && r.currency !== "CAD" && <Chip tone="dim">{r.currency}</Chip>}
                </div>
              </td>
              <td className="px-4 py-2.5 text-teal-100/70">
                {r.name}
                {r.note && <div title={r.note} className="mt-0.5 line-clamp-1 text-xs italic text-teal-200/40">{r.note}</div>}
              </td>
              {columns.map((c) => (
                <Cell key={c} col={c} r={r} />
              ))}
              {isMember && (
                <td className="px-4 py-2.5" data-no-expand>
                  {inUniverseLink && r.manageStatus === "ACTIVE" ? (
                    <div className="flex justify-end">
                      <Link
                        href="/universe"
                        title="Already in the tradeable Universe — manage it there"
                        className="rounded-md border border-emerald-400/25 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300/70 hover:bg-emerald-400/10"
                      >
                        In universe
                      </Link>
                    </div>
                  ) : r.manageStatus ? (
                    <div className="flex justify-end">
                      <UniverseActions
                        symbol={r.symbol}
                        status={r.manageStatus}
                        pendingBy={r.promotionRequestedBy}
                        proposedTier={r.proposedTier}
                        currentUser={currentUser}
                        researchInFlight={r.researchInFlight}
                        hideTierSelect
                        hideResearch
                        nowrap
                      />
                    </div>
                  ) : null}
                </td>
              )}
            </ExpandableRow>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
