import Link from "next/link";
import type { ReactNode } from "react";
import { money, pct, fmtWhen } from "@/lib/money";
import { Card, Chip, Pnl } from "@/components/ui";
import { stanceMeta } from "@/lib/stance";
import RatingBar from "@/components/RatingBar";
import type { Signals, Recommendation } from "@/agent/signals";
import SignalStrip from "@/components/SignalStrip";
import StockLogo from "@/components/StockLogo";
import Term from "@/components/Term";
import { capTier } from "@/lib/fundamentals";
import UniverseActions from "@/components/UniverseActions";

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
    case "last":
      return <td className="px-4 py-2.5 text-right tabular-nums text-teal-100/80">{r.lastCents !== null ? money(r.lastCents, r.currency) : "—"}</td>;
    case "day":
      return (
        <td
          className={`px-4 py-2.5 text-right tabular-nums ${
            (r.dayBps ?? 0) > 0 ? "text-emerald-400" : (r.dayBps ?? 0) < 0 ? "text-red-400" : "text-teal-200/50"
          }`}
        >
          {r.dayBps !== null ? pct(r.dayBps / 10_000, 2) : "—"}
        </td>
      );
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

export default function StockTable({
  rows,
  columns,
  isMember,
  currentUser,
}: {
  rows: StockRow[];
  columns: StockColumn[];
  isMember: boolean;
  currentUser: string;
}) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-teal-200/40">
            <th className="px-4 py-3">Symbol</th>
            <th className="px-4 py-3">Name</th>
            {columns.map((c) => (
              <th key={c} className={`px-4 py-3 ${HEADERS[c].align ? "text-right" : ""}`}>
                {HEADERS[c].label}
              </th>
            ))}
            {isMember && <th className="px-4 py-3 text-right">Manage</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.symbol}
              className={`stock-row border-t border-teal-400/10 ${r.held || r.pinnedBy ? "bg-teal-400/[0.05]" : ""}`}
              data-country={r.country ?? ""}
              data-exchange={r.exchange ?? ""}
              data-sector={r.sector ?? ""}
              data-cap={capTier(r.marketCapM) ?? ""}
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
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
                {r.note && <div className="mt-0.5 text-xs italic text-teal-200/40">{r.note}</div>}
              </td>
              {columns.map((c) => (
                <Cell key={c} col={c} r={r} />
              ))}
              {isMember && (
                <td className="px-4 py-2.5">
                  {r.manageStatus ? (
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
                      />
                    </div>
                  ) : null}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
