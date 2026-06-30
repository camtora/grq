import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { USERS, isOwner } from "@/lib/users";
import { getSession } from "@/lib/session";
import { soakStatus } from "@/lib/soak";
import { ACCOUNT_TYPE } from "@/agent/policy";
import Link from "next/link";
import { Card, PageHeader, Chip } from "@/components/ui";
import PanelHeader from "@/components/PanelHeader";
import RiskDial from "@/components/RiskDial";
import FeeBudget from "@/components/FeeBudget";
import KillSwitch from "@/components/KillSwitch";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationSettings from "@/components/NotificationSettings";
import DailyQuotesManager from "@/components/DailyQuotesManager";
import FxPanel, { type FxRequestRow } from "@/components/FxPanel";
import { prefsFromRow } from "@/lib/push/categories";
import { getPortfolio } from "@/lib/portfolio";
import { listFxRequests } from "@/lib/fx-requests";

const ROADMAP = [
  { n: 0, label: "Skeleton — site live behind SSO", done: true },
  { n: 1, label: "Mock fund — dashboard + sim engine", done: true },
  { n: 2, label: "Sim live-fire — agent trades $25,000 vs real markets", done: true },
  { n: 3, label: "IBKR paper — real broker plumbing proven & live-firing", done: true },
  { n: 4, label: "Live — real money, Cautious dial for week 1", done: false },
];

export default async function Settings() {
  const [settings, session, cookieStore, pf, fxReqs] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    getSession(),
    cookies(),
    getPortfolio(),
    listFxRequests(),
  ]);
  // Admin-only page: Cam & Graham (owners) only. Viewers — and any non-owner
  // member — get a 404; the page does not exist for them.
  if (!session || !isOwner(session.email)) notFound();
  const isMember = session.role === "member";

  // Soak-gate countdown (PROJECT_PLAN §9) — the road to real money, shown in the
  // "Road to real money" panel below. Paper is the binding constraint right now.
  const soak = soakStatus();
  const paperFrac = soak.paperRequired > 0 ? Math.min(1, soak.paperDays / soak.paperRequired) : 0;
  const totalFrac = soak.totalRequired > 0 ? Math.min(1, soak.totalDays / soak.totalRequired) : 0;

  // USD exposure = USD cash (in CAD) + USD positions (in CAD), as a % of NAV.
  const usdCashCadCents = pf.cashCents - pf.cadCashCents;
  const usdPositionsCadCents = pf.positions.filter((p) => p.currency === "USD").reduce((s, p) => s + p.marketValueCadCents, 0);
  const usdPct = pf.navCents > 0 ? ((usdCashCadCents + usdPositionsCadCents) / pf.navCents) * 100 : 0;
  const toFxRow = (r: (typeof fxReqs.pending)[number]): FxRequestRow => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    amountUsdCents: r.amountUsdCents,
    estCadCents: r.estCadCents,
    reason: r.reason,
    symbol: r.symbol,
    status: r.status,
    requestedBy: r.requestedBy,
    decidedBy: r.decidedBy,
    note: r.note,
    executedRate: r.executedRate,
    executedCadCents: r.executedCadCents,
    executedUsdCents: r.executedUsdCents,
    failReason: r.failReason,
  });
  const notifPrefs = prefsFromRow(
    session?.email ? await prisma.notificationPreference.findUnique({ where: { email: session.email } }) : null,
  );

  // Mirror the root layout's theme resolution: cookie override wins, else the
  // member's saved default, else dark.
  const cookieTheme = cookieStore.get("grq-theme")?.value;
  const theme: "light" | "dark" =
    cookieTheme === "light" || cookieTheme === "dark" ? cookieTheme : (session?.user?.theme ?? "dark");

  return (
    <main>
      <PageHeader
        title="Settings"
        sub="The dials you control. The agent controls nothing on this page — and never can."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/how-it-works"
              className="rounded-lg border border-[color:var(--card-border)] px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-teal-200/70 transition-colors hover:bg-teal-400/10 hover:text-teal-100"
            >
              How GRQ works
            </Link>
            <Link
              href="/traffic"
              className="rounded-lg border border-[color:var(--card-border)] px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-teal-200/70 transition-colors hover:bg-teal-400/10 hover:text-teal-100"
            >
              Traffic
            </Link>
            <Link
              href="/tokens"
              className="rounded-lg border border-[color:var(--card-border)] px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-teal-200/70 transition-colors hover:bg-teal-400/10 hover:text-teal-100"
            >
              Tokens
            </Link>
          </div>
        }
      />

      <div className="space-y-8">
        {/* Quick controls — kill switch · fee budget · appearance, three across. */}
        <div className="grid items-stretch gap-6 md:grid-cols-3">
          <KillSwitch
            engaged={settings?.killSwitch ?? false}
            engagedBy={settings?.killSwitchBy ?? null}
            canToggle={isMember}
          />

          <Card className="p-5">
            <FeeBudget
              riskLevel={settings?.riskLevel ?? "BALANCED"}
              feeBudgetCentsMonth={settings?.feeBudgetCentsMonth ?? 2000}
              feeSpentMonthCents={pf.feeSpentMonthCents}
              readOnly={!isMember}
            />
          </Card>

          <Card className="p-5">
            <div className="flex h-full flex-col justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">Appearance</div>
                <p className="mt-1 text-sm text-teal-200/50">Light or dark — remembered on this device.</p>
              </div>
              <ThemeToggle current={theme} />
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <RiskDial
            riskLevel={settings?.riskLevel ?? "BALANCED"}
            feeBudgetCentsMonth={settings?.feeBudgetCentsMonth ?? 2000}
            readOnly={!isMember}
          />
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <div className="mb-3"><PanelHeader>System</PanelHeader></div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-teal-200/50">Broker</dt>
                <dd className="font-semibold text-teal-50">
                  {(process.env.BROKER ?? "sim").toUpperCase()} — real delayed quotes
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-teal-200/50">Trading account</dt>
                <dd className="font-semibold text-teal-50">
                  {process.env.IBKR_ACCOUNT_ID ?? "—"}
                  {(process.env.BROKER ?? "").includes("paper") && (
                    <span className="ml-1 text-[11px] font-normal text-teal-200/40">(paper)</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-teal-200/50">Agent</dt>
                <dd className="text-teal-50">{settings?.agentVersion ?? "—"} — on duty</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-teal-200/50">Account &amp; tax</dt>
                <dd className="text-right text-teal-100/70">
                  {ACCOUNT_TYPE === "TFSA"
                    ? "TFSA — gains tax-free"
                    : ACCOUNT_TYPE === "RRSP"
                      ? "RRSP — tax-deferred"
                      : "Non-registered (taxable) — gains are capital gains"}
                  <span className="block text-[11px] text-teal-200/40">the agent factors this in · set via GRQ_ACCOUNT_TYPE</span>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-teal-200/50">Reset sim</dt>
                <dd className="text-teal-100/70">
                  <code className="rounded bg-teal-400/10 px-1.5 py-0.5 text-xs">
                    npx tsx prisma/seed.ts
                  </code>
                </dd>
              </div>
            </dl>
            <div className="mt-4 border-t border-teal-400/10 pt-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-teal-200/40">Members</div>
              <ul className="space-y-2">
                {Object.entries(USERS).map(([email, u]) => (
                  <li key={email} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="font-semibold text-teal-50">{u.name}</span>
                    <span className="text-teal-200/50">{email}</span>
                    <Chip tone="teal">{u.role}</Chip>
                    <span className="ml-auto text-xs text-teal-200/40">holds kill switch</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3"><PanelHeader>Road to real money</PanelHeader></div>
            <ol className="space-y-2">
              {ROADMAP.map((p) => (
                <li key={p.n} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      p.done ? "bg-teal-400 text-teal-950" : "border border-teal-400/30 text-teal-200/60"
                    }`}
                  >
                    {p.done ? "✓" : p.n}
                  </span>
                  <span className={p.done ? "text-teal-200/50 line-through" : "text-teal-50"}>{p.label}</span>
                </li>
              ))}
            </ol>

            {/* Soak-gate clock — the ≥4 weeks total / ≥2 on IBKR paper that must pass
                before step 4 (real money). Moved here from the Portfolio header. */}
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-teal-400/10 pt-4">
              <div className="rounded-xl border border-teal-400/20 bg-teal-400/[0.04] px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-200/50">IBKR paper soak</div>
                <div className="text-sm font-semibold tabular-nums text-teal-50">
                  {soak.paperDays} / {soak.paperRequired}
                  <span className="ml-1 text-[10px] font-normal text-teal-200/40">days</span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-teal-400/10">
                  <span className="block h-full rounded-full bg-teal-400/70" style={{ width: `${paperFrac * 100}%` }} />
                </div>
              </div>
              <div className="rounded-xl border border-teal-400/20 bg-teal-400/[0.04] px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-200/50">Total soak</div>
                <div className="text-sm font-semibold tabular-nums text-teal-50">
                  {soak.totalDays} / {soak.totalRequired}
                  <span className="ml-1 text-[10px] font-normal text-teal-200/40">days</span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-teal-400/10">
                  <span className="block h-full rounded-full bg-teal-400/70" style={{ width: `${totalFrac * 100}%` }} />
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Currency & FX beside Notifications (notifications half-width). */}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <FxPanel
              cadCashCents={pf.cadCashCents}
              usdCashCents={pf.usdCashCents}
              usdPct={usdPct}
              fxUsdCad={pf.fxUsdCad}
              dials={{
                fxMaxPerRequestCents: settings?.fxMaxPerRequestCents ?? 0,
                fxMaxPerWeekCents: settings?.fxMaxPerWeekCents ?? 0,
                usdAllocationCapPct: settings?.usdAllocationCapPct ?? 100,
              }}
              pending={fxReqs.pending.map(toFxRow)}
              recent={fxReqs.recent.map(toFxRow)}
              readOnly={!isMember}
            />
          </Card>

          <div id="notifications" className="scroll-mt-24">
            <Card className="p-5">
              <NotificationSettings initial={notifPrefs} readOnly={!isMember} />
            </Card>
          </div>
        </div>

        {isMember && (
          <div id="quotes" className="scroll-mt-24">
            <Card className="p-5">
              <DailyQuotesManager />
            </Card>
          </div>
        )}

      </div>
    </main>
  );
}
