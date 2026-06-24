import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { USERS } from "@/lib/users";
import { getSession } from "@/lib/session";
import { ACCOUNT_TYPE } from "@/agent/policy";
import { getBroker } from "@/lib/broker";
import { Card, PageHeader, Chip } from "@/components/ui";
import SettingsForm from "@/components/SettingsForm";
import KillSwitch from "@/components/KillSwitch";
import ThemeToggle from "@/components/ThemeToggle";
import OrderTicket from "@/components/OrderTicket";
import JournalSection from "@/components/JournalSection";
import NotificationSettings from "@/components/NotificationSettings";
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

export default async function Settings({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const [sp, settings, symbols, session, cookieStore, pf, fxReqs] = await Promise.all([
    searchParams,
    prisma.settings.findUnique({ where: { id: 1 } }),
    getBroker().listSymbols(),
    getSession(),
    cookies(),
    getPortfolio(),
    listFxRequests(),
  ]);
  const isMember = session?.role === "member";

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
      />

      <div className="space-y-8">
        <SettingsForm
          riskLevel={settings?.riskLevel ?? "BALANCED"}
          feeBudgetCentsMonth={settings?.feeBudgetCentsMonth ?? 2000}
          readOnly={!isMember}
        />

        <KillSwitch
          engaged={settings?.killSwitch ?? false}
          engagedBy={settings?.killSwitchBy ?? null}
          canToggle={isMember}
        />

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

        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">Appearance</div>
              <p className="mt-1 text-sm text-teal-200/50">Light or dark — remembered on this device.</p>
            </div>
            <ThemeToggle current={theme} />
          </div>
        </Card>

        <div id="notifications" className="scroll-mt-24">
          <Card className="p-5">
            <NotificationSettings initial={notifPrefs} readOnly={!isMember} />
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-teal-200/50">
              Members
            </div>
            <ul className="space-y-2">
              {Object.entries(USERS).map(([email, u]) => (
                <li key={email} className="flex items-center gap-3 text-sm">
                  <span className="font-semibold text-teal-50">{u.name}</span>
                  <span className="text-teal-200/50">{email}</span>
                  <Chip tone="teal">{u.role}</Chip>
                  <span className="ml-auto text-xs text-teal-200/40">holds kill switch</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-teal-200/50">
              System
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-teal-200/50">Broker</dt>
                <dd className="font-semibold text-teal-50">
                  {(process.env.BROKER ?? "sim").toUpperCase()} — real delayed quotes
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
                <dt className="text-teal-200/50">Universe ({symbols.length})</dt>
                <dd className="text-right text-teal-100/70">{symbols.join(" · ")}</dd>
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
          </Card>
        </div>

        {isMember && <OrderTicket symbols={symbols} />}

        <Card className="p-5">
          <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-teal-200/50">
            Road to real money
          </div>
          <ol className="space-y-2">
            {ROADMAP.map((p) => (
              <li key={p.n} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    p.done
                      ? "bg-teal-400 text-teal-950"
                      : "border border-teal-400/30 text-teal-200/60"
                  }`}
                >
                  {p.done ? "✓" : p.n}
                </span>
                <span className={p.done ? "text-teal-200/50 line-through" : "text-teal-50"}>
                  {p.label}
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <JournalSection kind={sp.kind} />
      </div>
    </main>
  );
}
