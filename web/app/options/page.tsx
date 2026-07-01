import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";
import { getSession } from "@/lib/session";
import { loadDesk } from "@/lib/options-desk/desk";
import OptionsLearn from "@/components/options/OptionsLearn";
import OptionsCalculator from "@/components/options/OptionsCalculator";
import ExperimentOptions from "@/components/options/ExperimentOptions";
import AskOptions from "@/components/options/AskOptions";

// The Options education portal (docs/OPTIONS-PORTAL.md) — learn / play / watch / ask, in one place.
// Education-first, modeled-only, never executable. Top-level destination; tabs are a ?tab= query so
// chat / the experiment can deep-link a pre-filled calculator. Phase 1: Learn + Calculator are full;
// Experiment + Ask are wired to the existing desk + chat (fuller treatment in Phases 3–4).
export const dynamic = "force-dynamic";

type Tab = "learn" | "calculator" | "experiment" | "ask";
const TABS: { key: Tab; label: string }[] = [
  { key: "learn", label: "Learn" },
  { key: "calculator", label: "Calculator" },
  { key: "experiment", label: "The Experiment" },
  { key: "ask", label: "Ask" },
];

export default async function OptionsPage({ searchParams }: { searchParams: Promise<{ tab?: string; sym?: string; strat?: string; strike?: string; exp?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "learn") as Tab;
  const session = await getSession();
  const isMember = session?.role === "member";
  // Only pay the desk's live-quote valuation when the Experiment tab is actually being viewed.
  const deskView = tab === "experiment" ? await loadDesk().catch(() => null) : null;

  return (
    <main>
      <PageHeader
        title="Options"
        sub="Learn how options actually work, play with any strategy on a live payoff calculator, and watch the experiment's fake options move over time. Education only — the fund never trades options."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.key === tab;
          const href = t.key === "calculator" && sp.sym ? `/options?tab=calculator&sym=${encodeURIComponent(sp.sym)}` : `/options?tab=${t.key}`;
          return (
            <Link
              key={t.key}
              href={href}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                active ? "border-teal-400/40 bg-teal-400/10 text-teal-100" : "border-teal-400/10 bg-teal-400/[0.03] text-teal-300/70 hover:bg-teal-400/10"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab === "learn" ? <OptionsLearn /> : null}
      {tab === "calculator" ? <OptionsCalculator initial={{ strat: sp.strat, sym: sp.sym, strike: sp.strike, exp: sp.exp }} /> : null}
      {tab === "experiment" ? <ExperimentOptions view={deskView} /> : null}
      {tab === "ask" ? (
        <Card className="p-5">
          <AskOptions isMember={isMember} />
        </Card>
      ) : null}
    </main>
  );
}
