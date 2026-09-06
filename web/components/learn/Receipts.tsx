import { prisma } from "@/lib/db";
import { PAPER_INCEPTION } from "@/lib/portfolio";
import { HARD, DIALS, SELF_INVEST } from "@/agent/policy";
import { money, signedMoney, pnlClass } from "@/lib/money";
import type { LearnReceiptKey } from "@/lib/learn/content";
import { settledSnapshotsBetween, latestSettledSnapshot } from "@/lib/nav-history";
import { getSession, seesBook } from "@/lib/session";

// "Receipts" — live-fund example blocks inside Learn lessons (docs/LEARN-PORTAL.md, D110
// Phase 3). Each pulls the fund's OWN numbers from the same sources the app trades with
// (the how-it-works pattern: live values, so lesson claims can't drift from reality).
// Server-only. Every query is scoped to PAPER_INCEPTION — the current soak's honest
// inception — so "the fund's numbers" never mix in pre-reset history (validator rule).
// Any receipt that can't produce honest data renders an honest empty state instead.

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });
const NICE_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" });
const pct = (bps: number) => `${(bps / 100).toFixed(1)}%`;

function Shell({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-teal-400/10 bg-teal-400/[0.02] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Receipts · {title}</div>
        <div className="text-[10px] text-teal-200/35">the fund&apos;s own live numbers, not an illustration</div>
      </div>
      <div className="mt-2.5">{children}</div>
      {footer ? <p className="mt-2.5 text-[11px] leading-relaxed text-teal-200/50">{footer}</p> : null}
    </div>
  );
}

function Empty({ title, note }: { title: string; note: string }) {
  return (
    <Shell title={title}>
      <p className="text-xs text-teal-200/50">{note}</p>
    </Shell>
  );
}

function Stat({ label, value, cls = "text-teal-50" }: { label: string; value: React.ReactNode; cls?: string }) {
  return (
    <div className="rounded-lg border border-teal-400/10 p-2">
      <div className="text-[10px] uppercase tracking-wider text-teal-200/45">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

/* ---------- the individual receipts ---------- */

async function RealFills() {
  const [fills, agg] = await Promise.all([
    prisma.trade.findMany({ where: { at: { gte: PAPER_INCEPTION }, secType: "STK" }, orderBy: { at: "desc" }, take: 3 }),
    prisma.trade.aggregate({ where: { at: { gte: PAPER_INCEPTION }, secType: "STK" }, _count: true, _sum: { commissionCents: true } }),
  ]);
  if (!fills.length) return <Empty title="real fills" note="No trades yet this soak — the moment the fund pays its first toll, it shows up here." />;
  return (
    <Shell
      title="real fills"
      footer={
        <>
          {agg._count} fills this soak, {money(agg._sum.commissionCents ?? 0)} in commissions — and that&apos;s only the <em>visible</em> toll.
          The spread was paid invisibly on top of every single one, exactly as above.
        </>
      }
    >
      <ul className="space-y-1 text-xs tabular-nums text-teal-100/80">
        {fills.map((t) => (
          <li key={t.id} className="flex flex-wrap items-baseline gap-x-2">
            <span className={`font-bold ${t.side === "BUY" ? "text-emerald-300" : "text-amber-300"}`}>{t.side}</span>
            <span className="font-mono text-teal-200">
              {t.qty} {t.symbol}
            </span>
            <span>@ {money(t.priceCents)}</span>
            <span className="text-teal-200/50">· {money(t.commissionCents)} commission</span>
            <span className="text-teal-200/35">· {NICE_DAY.format(t.at)}</span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

async function Drawdown() {
  const snaps = await settledSnapshotsBetween(PAPER_INCEPTION);
  if (snaps.length < 2) return <Empty title="the fund's drawdown" note="Not enough NAV history yet this soak to chart a drawdown — check back after a few sessions." />;
  let hwm = 0;
  let worstBps = 0;
  for (const s of snaps) {
    if (s.navCents > hwm) hwm = s.navCents;
    if (hwm > 0) worstBps = Math.min(worstBps, Math.round(((s.navCents - hwm) / hwm) * 10_000));
  }
  const nav = snaps[snaps.length - 1].navCents;
  const nowBps = hwm > 0 ? Math.round(((nav - hwm) / hwm) * 10_000) : 0;
  return (
    <Shell
      title="the fund's drawdown"
      footer={
        <>
          The tripwires are live code, not intentions: a day at {pct(HARD.dailyLossPauseBps)} pauses all new buys; {pct(HARD.drawdownKillBps)} from
          the high-water mark trips the kill switch automatically.
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="NAV now" value={money(nav)} />
        <Stat label="high-water mark" value={money(hwm)} />
        <Stat label="drawdown now" value={pct(nowBps)} cls={nowBps < 0 ? "text-red-300" : "text-emerald-300"} />
        <Stat label="worst this soak" value={pct(worstBps)} cls={worstBps < 0 ? "text-red-300" : "text-teal-50"} />
      </div>
    </Shell>
  );
}

async function VsXic() {
  const [snap, contrib] = await Promise.all([
    latestSettledSnapshot(),
    prisma.contribution.aggregate({ _sum: { amountCents: true } }),
  ]);
  const put = contrib._sum.amountCents ?? 0;
  if (!snap || !put) return <Empty title="the fund vs the couch" note="No scoreboard yet — contributions and NAV snapshots have to exist before anyone can lose to a couch." />;
  const gapVsBench = snap.benchmarkCents !== null ? snap.navCents - snap.benchmarkCents : null;
  return (
    <Shell
      title="the fund vs the couch"
      footer={
        gapVsBench === null ? (
          <>The XIC benchmark is momentarily unavailable — the honest cells stay blank rather than guessing.</>
        ) : (
          <>
            Same dollars, two universes: everything GRQ actually did, versus shoving every contribution into XIC and going for a nap. Right
            now the fund is <span className={pnlClass(gapVsBench)}>{signedMoney(gapVsBench)}</span> {gapVsBench >= 0 ? "ahead of" : "behind"} the couch.
            Measured from this soak&apos;s inception ({NICE_DAY.format(PAPER_INCEPTION)}).
          </>
        )
      }
    >
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="put in" value={money(put)} />
        <Stat label="NAV now" value={money(snap.navCents)} />
        <Stat label="if it were all XIC" value={snap.benchmarkCents !== null ? money(snap.benchmarkCents) : "—"} />
        <Stat
          label="total P&L"
          value={signedMoney(snap.navCents - put)}
          cls={pnlClass(snap.navCents - put)}
        />
      </div>
    </Shell>
  );
}

async function Fees() {
  const parts = ET_DAY.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const monthStart = new Date(Date.UTC(y, m - 1, 1, 4)); // ~midnight ET
  const [settings, month, soak] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.trade.aggregate({ where: { at: { gte: monthStart } }, _sum: { commissionCents: true }, _count: true }),
    prisma.trade.aggregate({ where: { at: { gte: PAPER_INCEPTION } }, _sum: { commissionCents: true }, _count: true }),
  ]);
  const budget = settings?.feeBudgetCentsMonth ?? 0;
  const spent = month._sum.commissionCents ?? 0;
  return (
    <Shell
      title="what the fund pays in fees"
      footer={
        <>
          Two of the defenses from this lesson, live: the monthly budget above is enforced by the order gate (a trade that would bust it is
          rejected), and no trade is taken unless its thesis clears ≥{HARD.feeEdgeMultiple}× the round-trip commission.
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="commissions this month" value={money(spent)} />
        <Stat label="monthly budget" value={budget ? money(budget) : "—"} cls={spent > budget * 0.8 && budget ? "text-amber-300" : "text-teal-50"} />
        <Stat label="this soak, total" value={money(soak._sum.commissionCents ?? 0)} />
        <Stat label="across" value={`${soak._count} trades`} />
      </div>
    </Shell>
  );
}

async function Guardrails() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const dialName = settings?.riskLevel ?? "BALANCED";
  const dial = DIALS[dialName];
  return (
    <Shell
      title="the live dials"
      footer={
        <>
          These are code, not vibes. Members set the dial and edit the rules; Alfred can&apos;t touch either — it can only propose orders
          that survive them. Also live: buys need ≥{HARD.minBuyConfidence}% conviction, ≤{HARD.maxOrdersPerDay} orders/day,
          ≤{HARD.maxOrdersPerHour}/hour, none in the first or last {HARD.noEntriesFirstMin} minutes of the session, and a self-promotion
          ceiling of {SELF_INVEST.maxPerRollingWeek}/week into a max-{SELF_INVEST.maxUniverseSize}-name universe.
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="risk dial" value={dialName} />
        <Stat label="max position" value={`${dial.maxPositionPct}% of NAV`} />
        <Stat label="cash floor" value={`${dial.cashFloorPct}% per currency`} />
        <Stat label="stop-loss" value={`−${dial.stopPct}%`} />
        <Stat label="take-profit" value={`+${dial.takeProfitPct}%`} />
        <Stat label="new buys / week" value={`≤${dial.maxNewTradesPerWeek}`} />
        <Stat label="day-loss pause" value={pct(HARD.dailyLossPauseBps)} />
        <Stat label="auto kill switch" value={pct(HARD.drawdownKillBps)} cls={settings?.killSwitch ? "text-red-300" : "text-teal-50"} />
        <Stat label="kill switch now" value={settings?.killSwitch ? "ENGAGED" : "armed, off"} cls={settings?.killSwitch ? "text-red-300" : "text-emerald-300"} />
        <Stat label="margin / shorting" value="banned" />
        <Stat label="options" value={settings?.allowOptions ? "enabled" : "OFF (toggle, off)"} />
        <Stat label="rule changes" value="humans only" />
      </div>
    </Shell>
  );
}

async function Soak() {
  const [settings, snaps] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    settledSnapshotsBetween(PAPER_INCEPTION),
  ]);
  const days = new Set(snaps.map((s) => ET_DAY.format(s.at))).size;
  const broker = process.env.BROKER ?? "sim";
  return (
    <Shell
      title="where the soak stands"
      footer={
        <>
          The gate to real money: at least 4 clean weeks total, at least 2 of them on IBKR paper — clean meaning no blown guardrails and
          honest reconciliation against the broker every day. Until it passes, not one real dollar trades. The soak has already earned its
          keep once: it caught a broker account reset masquerading as a crash before real money could have been hurt.
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="broker" value={broker} />
        <Stat label="soak inception" value={NICE_DAY.format(PAPER_INCEPTION)} />
        <Stat label="market days logged" value={days || "—"} />
        <Stat
          label="kill switch"
          value={settings?.killSwitch ? "ENGAGED" : "armed, off"}
          cls={settings?.killSwitch ? "text-red-300" : "text-emerald-300"}
        />
      </div>
    </Shell>
  );
}

/* ---------- dispatcher ---------- */

export default async function ReceiptBlock({ k }: { k: LearnReceiptKey }) {
  // The fund's own numbers ARE the book — members' and viewers' only (D122). A user gets the
  // lesson without the receipt and an honest line about why, never a silent gap. One check
  // here covers every receipt kind, present and future.
  if (!seesBook(await getSession())) {
    return <Empty title="members only" note="This receipt is the fund's own live numbers, and the book stays with its members. The lesson stands on its own." />;
  }
  try {
    switch (k) {
      case "real-fills":
        return await RealFills();
      case "drawdown":
        return await Drawdown();
      case "vs-xic":
        return await VsXic();
      case "fees":
        return await Fees();
      case "guardrails":
        return await Guardrails();
      case "soak":
        return await Soak();
    }
  } catch {
    // A lesson must never fall over because a receipt couldn't load — teach on, quietly.
    return <Empty title="unavailable" note="The live numbers for this receipt couldn't be loaded right now — the lesson stands on its own." />;
  }
}
