"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, Chip } from "@/components/ui";
import { money } from "@/lib/money";
import type { ReportRow } from "@/lib/report-card/load";

// The "every call" ledger, filterable client-side (Cam 2026-07-02) — the raw table dumped all
// ~1000+ rows, which is unreadable. Filters + scoring don't change; this only narrows what renders.
const SOURCE_TONE: Record<string, "teal" | "green" | "red" | "dim"> = { chess: "teal", call: "green", hunt: "dim" };
const SOURCE_LABEL: Record<string, string> = { call: "Alfred's calls", hunt: "Hunt leads", chess: "Chess plays" };

const fmtBps = (bps: number | null): string => (bps == null ? "—" : `${bps >= 0 ? "+" : ""}${(bps / 100).toFixed(1)}%`);
const retClass = (bps: number | null): string =>
  bps == null ? "text-teal-200/30" : bps > 0 ? "text-emerald-400" : bps < 0 ? "text-red-400" : "text-amber-300/70";

type SourceFilter = "all" | "call" | "hunt" | "chess";
type VerdictFilter = "all" | "right" | "wrong" | "pending";

const pill = (active: boolean) =>
  `rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
    active ? "bg-teal-400/15 text-teal-200" : "text-teal-200/45 hover:bg-teal-400/10 hover:text-teal-200/80"
  }`;

export default function ReportCardTable({ rows }: { rows: ReportRow[] }) {
  const [source, setSource] = useState<SourceFilter>("all");
  const [verdict, setVerdict] = useState<VerdictFilter>("all");
  const [q, setQ] = useState("");
  const [latestOnly, setLatestOnly] = useState(false);

  const counts = useMemo(() => {
    const c = { all: rows.length, call: 0, hunt: 0, chess: 0 } as Record<string, number>;
    for (const r of rows) c[r.source]++;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    let rs = rows;
    if (source !== "all") rs = rs.filter((r) => r.source === source);
    if (verdict === "right") rs = rs.filter((r) => r.isGreen === true);
    else if (verdict === "wrong") rs = rs.filter((r) => r.isGreen === false);
    else if (verdict === "pending") rs = rs.filter((r) => r.isGreen == null);
    const term = q.trim().toUpperCase();
    if (term) rs = rs.filter((r) => r.symbol.toUpperCase().includes(term));
    if (latestOnly) {
      // rows arrive newest-first, so the first row per name+source is the latest call of that kind.
      const seen = new Set<string>();
      rs = rs.filter((r) => {
        const k = `${r.symbol}|${r.source}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    return rs;
  }, [rows, source, verdict, q, latestOnly]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Source */}
        <div className="flex items-center gap-1">
          {(["all", "call", "hunt", "chess"] as SourceFilter[]).map((s) => (
            <button key={s} type="button" onClick={() => setSource(s)} className={pill(source === s)}>
              {s === "all" ? "All" : SOURCE_LABEL[s]}
              <span className="ml-1 opacity-50 tabular-nums">{s === "all" ? counts.all : counts[s] ?? 0}</span>
            </button>
          ))}
        </div>
        {/* Verdict */}
        <div className="flex items-center gap-1">
          {(["all", "right", "wrong", "pending"] as VerdictFilter[]).map((v) => (
            <button key={v} type="button" onClick={() => setVerdict(v)} className={pill(verdict === v)}>
              {v === "all" ? "Any" : v === "right" ? "✓ right" : v === "wrong" ? "✗ wrong" : "pending"}
            </button>
          ))}
        </div>
        {/* Symbol search */}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search ticker…"
          className="w-32 rounded-md border border-teal-400/15 bg-teal-400/[0.03] px-2.5 py-1 text-[11px] text-teal-100 placeholder:text-teal-200/30 focus:border-teal-400/40 focus:outline-none"
        />
        {/* Latest per name */}
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-teal-200/60">
          <input type="checkbox" checked={latestOnly} onChange={(e) => setLatestOnly(e.target.checked)} className="accent-teal-400" />
          Latest per name
        </label>
        <span className="ml-auto text-[11px] tabular-nums text-teal-200/40">
          {filtered.length === rows.length ? `${rows.length} calls` : `${filtered.length} of ${rows.length}`}
        </span>
      </div>

      <Card className="overflow-x-auto p-0">
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-teal-200/40">
                  No calls match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-teal-400/5 last:border-0 hover:bg-teal-400/[0.03]">
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
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
