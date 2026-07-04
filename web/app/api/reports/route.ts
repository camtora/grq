import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sessionFromRequest } from "@/lib/session";
import { reportsResponse } from "@/lib/feed";
import { parseStats } from "@/components/ReportStats";
import { etDateStr } from "@/agent/calendar";
import { HARD } from "@/agent/policy";

// Mobile read endpoint (A10) — now the web Reports HUB (app/reports/page.tsx):
// ?tab=daily|weekly|diary|smart|retros|lessons|conviction returns that tab's
// content plus every tab's count (for the chip badges). No ?tab keeps the old
// flat list (back-compat for the installed bundle). The full body of one report
// stays /api/reports/[id]; the EOD-by-date stays /api/reports/day/[date].
export const dynamic = "force-dynamic";
export const maxDuration = 20;

function preview(body: string, n = 130): string {
  const t = body
    .replace(/[#*`_>]/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric" });
}

async function counts() {
  const [daily, weekly, diary, smart, retros, lessons, conviction] = await Promise.all([
    prisma.report.count({ where: { kind: "EOD" } }),
    prisma.report.count({ where: { kind: "WEEKLY" } }),
    prisma.report.count({ where: { kind: "CHANGE" } }),
    prisma.journalEntry.count({ where: { kind: "RESEARCH", title: { startsWith: "Smart money" } } }),
    prisma.journalEntry.count({ where: { kind: "RETRO" } }),
    prisma.journalEntry.count({ where: { kind: "LESSON" } }),
    prisma.tradeProposal.count({ where: { side: "BUY" } }),
  ]);
  return { daily, weekly, diary, smart, retros, lessons, conviction };
}

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });

  const tab = new URL(req.url).searchParams.get("tab");
  if (!tab) return NextResponse.json(await reportsResponse());

  if (tab === "daily") {
    // Each day = morning game plan + pre-market read + EOD close previews + the
    // intraday-update count (the web's Daily day-cards).
    const [eods, plans, premorns, intradayEntries, c] = await Promise.all([
      prisma.report.findMany({ where: { kind: "EOD" }, orderBy: { date: "desc" }, take: 40 }),
      prisma.journalEntry.findMany({
        where: { kind: "RESEARCH", title: { startsWith: "Game plan" } },
        orderBy: { at: "desc" },
        take: 40,
      }),
      prisma.journalEntry.findMany({
        where: { kind: "RESEARCH", title: { startsWith: "Pre-morning read" } },
        orderBy: { at: "desc" },
        take: 40,
      }),
      prisma.journalEntry.findMany({
        where: {
          kind: "RESEARCH",
          OR: [
            { title: { startsWith: "Intraday Check-in" } },
            { title: { startsWith: "Position Note" } },
            { title: { startsWith: "Midday brief" } },
            { title: { startsWith: "Check-in" } }, // legacy naming
          ],
        },
        orderBy: { at: "desc" },
        take: 400,
        select: { at: true },
      }),
      counts(),
    ]);
    const intradayBy = new Map<string, number>();
    for (const e of intradayEntries) {
      const k = etDateStr(e.at);
      intradayBy.set(k, (intradayBy.get(k) ?? 0) + 1);
    }
    type Day = { date: Date; eodId?: number; plan?: string; premarket?: string; close?: string };
    const days = new Map<string, Day>();
    for (const e of eods) days.set(etDateStr(e.date), { date: e.date, eodId: e.id, close: preview(e.body) });
    for (const p of plans) {
      const k = etDateStr(p.at);
      const cur = days.get(k) ?? days.set(k, { date: p.at }).get(k)!;
      cur.plan = preview(p.body);
    }
    for (const pm of premorns) {
      const k = etDateStr(pm.at);
      const cur = days.get(k) ?? days.set(k, { date: pm.at }).get(k)!;
      cur.premarket = preview(pm.body);
    }
    for (const k of intradayBy.keys()) {
      if (!days.has(k)) days.set(k, { date: new Date(`${k}T12:00:00Z`) });
    }
    return NextResponse.json({
      counts: c,
      days: [...days.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .slice(0, 30)
        .map(([k, v]) => ({
          dateISO: k,
          dayLabel: dayLabel(v.date),
          plan: v.plan ?? null,
          premarket: v.premarket ?? null,
          close: v.close ?? null,
          intraday: intradayBy.get(k) ?? 0,
          eodId: v.eodId != null ? String(v.eodId) : null,
        })),
    });
  }

  if (tab === "weekly" || tab === "diary") {
    const [rows, c] = await Promise.all([
      prisma.report.findMany({ where: { kind: tab === "weekly" ? "WEEKLY" : "CHANGE" }, orderBy: { date: "desc" }, take: 30 }),
      counts(),
    ]);
    return NextResponse.json({
      counts: c,
      reports: rows.map((r) => ({
        id: String(r.id),
        title: r.title,
        dateISO: etDateStr(r.date),
        summary: preview(r.body, 180),
        stats: parseStats(r.statsJson) ?? null, // {label: value} — the weekly stat strip
      })),
    });
  }

  if (tab === "smart" || tab === "retros" || tab === "lessons") {
    const where: Prisma.JournalEntryWhereInput =
      tab === "smart"
        ? { kind: "RESEARCH", title: { startsWith: "Smart money" } }
        : tab === "retros"
          ? { kind: "RETRO" }
          : { kind: "LESSON" };
    const [entries, c] = await Promise.all([
      prisma.journalEntry.findMany({ where, orderBy: { at: "desc" }, take: 50 }),
      counts(),
    ]);
    return NextResponse.json({
      counts: c,
      entries: entries.map((j) => ({
        id: String(j.id),
        kind: j.kind,
        symbol: j.symbol,
        title: j.title,
        body: j.body,
        at: j.at.toISOString(),
        agentVersion: j.agentVersion,
        confidence: j.confidence,
      })),
    });
  }

  if (tab === "conviction") {
    const [proposals, c] = await Promise.all([
      prisma.tradeProposal.findMany({ orderBy: { at: "desc" }, take: 120 }),
      counts(),
    ]);
    // The REAL gate from policy (D95: 75→70) — the web page's hardcoded 75 is stale.
    const gatePct = HARD.minBuyConfidence;
    const buys = proposals.filter((p) => p.side === "BUY");
    const withBoth = buys.filter((p) => p.tradeConfidence != null && p.dossierConfidence != null);
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
    const avgTrade = avg(withBoth.map((p) => p.tradeConfidence as number));
    const avgDossier = avg(withBoth.map((p) => p.dossierConfidence as number));
    return NextResponse.json({
      counts: c,
      gatePct,
      summary: {
        buys: buys.length,
        clearedGate: buys.filter((p) => (p.tradeConfidence ?? 0) >= gatePct).length,
        filled: buys.filter((p) => p.accepted).length,
        avgTrade,
        avgDossier,
        avgGap: avgTrade != null && avgDossier != null ? avgTrade - avgDossier : null,
      },
      proposals: proposals.map((p) => ({
        at: p.at.toISOString(),
        symbol: p.symbol,
        side: p.side,
        tradeConfidence: p.tradeConfidence,
        dossierConfidence: p.dossierConfidence,
        dossierStance: p.dossierStance,
        accepted: p.accepted,
        status: p.status,
        convictionBlocked: !p.accepted && (p.rejectReason ?? "").includes("Conviction gate"),
      })),
    });
  }

  return NextResponse.json({ error: "Unknown tab." }, { status: 400 });
}
