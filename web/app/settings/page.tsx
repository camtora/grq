import { prisma } from "@/lib/db";
import { USERS } from "@/lib/users";
import { getSession } from "@/lib/session";
import { getBroker } from "@/lib/broker";
import { Card, PageHeader, Chip } from "@/components/ui";
import SettingsForm from "@/components/SettingsForm";
import KillSwitch from "@/components/KillSwitch";
import OrderTicket from "@/components/OrderTicket";

const ROADMAP = [
  { n: 0, label: "Skeleton — site live behind SSO", done: true },
  { n: 1, label: "Mock fund — dashboard + sim engine", done: true },
  { n: 2, label: "Sim live-fire — agent trades $5,000 vs real markets", done: true },
  { n: 3, label: "IBKR paper — real broker plumbing, ≥2 clean weeks", done: false },
  { n: 4, label: "Live — real money, Cautious dial for week 1", done: false },
];

export default async function Settings() {
  const [settings, symbols, session] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    getBroker().listSymbols(),
    getSession(),
  ]);
  const isMember = session?.role === "member";

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
      </div>
    </main>
  );
}
