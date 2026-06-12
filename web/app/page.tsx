import { headers } from "next/headers";
import { userForEmail } from "@/lib/users";

export const dynamic = "force-dynamic";

const STATS = [
  { label: "Net asset value", value: "$5,000.00", note: "simulated — awaiting Phase 2" },
  { label: "Total P&L", value: "+$0.00", note: "no trades yet" },
  { label: "Contributions", value: "$5,000.00", note: "initial commitment" },
  { label: "Fee budget", value: "$0 / $20", note: "this month" },
];

const PHASES = [
  { n: 0, label: "Skeleton", desc: "Site live behind SSO", state: "live" },
  { n: 1, label: "Mock fund", desc: "Dashboard + paper trading engine", state: "next" },
  { n: 2, label: "Sim — live fire", desc: "$5,000 pseudo-account vs real markets", state: "todo" },
  { n: 3, label: "IBKR paper", desc: "Real broker, fake money, ≥2 clean weeks", state: "todo" },
  { n: 4, label: "Live", desc: "Real money, Cautious dial, receipts", state: "todo" },
] as const;

export default async function Home() {
  const h = await headers();
  const email = h.get("x-forwarded-email") ?? process.env.GRQ_DEV_EMAIL ?? null;
  const user = userForEmail(email);
  const name = user?.name ?? "friend";
  const other = name === "Cam" ? "Graham" : "Cam";

  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="bg-gradient-to-r from-teal-300 to-teal-500 bg-clip-text text-5xl font-black tracking-tight text-transparent">
          GRQ
        </h1>
        <span className="text-xs font-semibold uppercase tracking-[0.35em] text-teal-500/80">
          Get Rich Quick
        </span>
        <p className="w-full text-sm italic text-teal-100/50">
          “Get rich quick, slowly, with receipts.”
        </p>
      </header>

      <section className="mt-12">
        <h2 className="text-3xl font-semibold text-teal-50">
          Welcome back, {name}.
        </h2>
        <p className="mt-2 text-teal-200/60">
          {name} &amp; {other}&rsquo;s autonomous fund. The agent isn&rsquo;t trading yet —
          we&rsquo;re at Phase 0 of 4.
        </p>
      </section>

      <section className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STATS.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-teal-400/15 bg-teal-400/[0.04] p-5"
          >
            <div className="text-xs uppercase tracking-wider text-teal-200/50">{s.label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-teal-50">{s.value}</div>
            <div className="mt-1 text-xs text-teal-200/40">{s.note}</div>
          </div>
        ))}
      </section>

      <section className="mt-12">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">
          Road to real money
        </h3>
        <ol className="mt-4 space-y-3">
          {PHASES.map((p) => (
            <li
              key={p.n}
              className={`flex items-center gap-4 rounded-xl border p-4 ${
                p.state === "live"
                  ? "border-teal-400/40 bg-teal-400/10"
                  : "border-teal-400/10 bg-teal-400/[0.02]"
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  p.state === "live"
                    ? "bg-teal-400 text-teal-950"
                    : "border border-teal-400/30 text-teal-200/60"
                }`}
              >
                {p.n}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-teal-50">{p.label}</span>
                  {p.state === "live" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-300">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-300" />
                      You are here
                    </span>
                  )}
                  {p.state === "next" && (
                    <span className="rounded-full border border-teal-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-200/50">
                      Up next
                    </span>
                  )}
                </div>
                <div className="text-sm text-teal-200/50">{p.desc}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 flex items-center justify-between rounded-2xl border border-red-400/15 bg-red-400/[0.03] p-5">
        <div>
          <div className="font-semibold text-red-200/80">Kill switch</div>
          <div className="text-sm text-red-200/40">
            Arms in Phase 2. Both of you will hold it. Instant, no questions asked.
          </div>
        </div>
        <button
          disabled
          className="cursor-not-allowed rounded-xl border border-red-400/20 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-red-200/30"
        >
          Halt trading
        </button>
      </section>

      <footer className="mt-14 text-xs text-teal-200/30">
        Markets open 9:30–16:00 ET · TSX first · Hard guardrails enforced in code, not vibes ·
        Signed in as {email ?? "unknown"}
      </footer>
    </main>
  );
}
