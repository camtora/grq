import Link from "next/link";
import { PageHeader, SectionHeader, Card, Chip } from "@/components/ui";
import { getSession } from "@/lib/session";
import { COURSES, LABS } from "@/lib/learn/content";
import { GLOSSARY } from "@/lib/glossary";
import AskLearn from "@/components/learn/AskLearn";

// The Learn portal hub (docs/LEARN-PORTAL.md, D110) — the front door for the financial-
// literacy pillar: the market-mechanics curriculum, the labs (framed by what each teaches),
// the browsable glossary, and an Ask Alfred entry. Teaches how the market WORKS, not which
// stocks to buy. Viewer-readable; only chat is members-only.
export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const session = await getSession();
  const isMember = session?.role === "member";
  const termCount = Object.keys(GLOSSARY).length;

  return (
    <main>
      <PageHeader
        title="Learn"
        sub="How the market actually works — not which stocks to buy. Courses in plain English, every term tap-to-explain, and live experiments to watch the ideas play out."
      />

      <div className="space-y-10">
        <section>
          <SectionHeader sub="· eight courses, in order — start at the machine">The curriculum</SectionHeader>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {COURSES.map((c) => {
              const inner = (
                <Card
                  className={`flex h-full flex-col p-5 transition-colors ${
                    c.status === "live" ? "hover:border-teal-400/30 hover:bg-teal-400/[0.03]" : "opacity-60"
                  }`}
                >
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Course {c.n}</div>
                  <div className={`mt-1.5 text-base font-semibold text-teal-50 ${c.status === "live" ? "group-hover:underline" : ""}`}>
                    {c.title}
                  </div>
                  <p className="mt-1.5 flex-1 text-xs leading-relaxed text-teal-200/60">{c.tagline}</p>
                  <div className="mt-3 text-xs text-teal-300/70">
                    {c.status === "soon" ? (
                      <Chip tone="dim">soon</Chip>
                    ) : c.external ? (
                      <span>its own portal →</span>
                    ) : (
                      <span>
                        {c.lessons.length} lessons →
                      </span>
                    )}
                  </div>
                </Card>
              );
              if (c.status !== "live") return <div key={c.slug}>{inner}</div>;
              return (
                <Link key={c.slug} href={c.external ? c.external.href : `/learn/${c.slug}`} className="group">
                  {inner}
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <SectionHeader sub="· learn by watching experiments run against the real market">The labs</SectionHeader>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LABS.map((lab) => (
              <Link key={lab.href} href={lab.href} className="group">
                <Card className="h-full p-4 transition-colors hover:border-teal-400/30 hover:bg-teal-400/[0.03]">
                  <div className="text-sm font-semibold text-teal-50 group-hover:underline">{lab.title}</div>
                  <p className="mt-1 text-xs leading-relaxed text-teal-200/60">{lab.teaches}</p>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        <div className="grid items-start gap-x-4 gap-y-10 lg:grid-cols-2">
          <section>
            <SectionHeader sub={`· ${termCount} terms and counting`}>The glossary</SectionHeader>
            <Card className="p-5">
              <p className="text-sm leading-relaxed text-teal-100/75">
                Every piece of jargon GRQ puts on screen, defined in plain English with an example — the same definitions behind every{" "}
                <span className="border-b border-dotted border-teal-400/60">underlined term</span> in the app. A figure the app shows but
                can&apos;t explain is a bug.
              </p>
              <Link
                href="/learn/glossary"
                className="mt-3 inline-block rounded-lg border border-teal-400/30 bg-teal-400/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25"
              >
                Browse the glossary
              </Link>
            </Card>
          </section>

          <section>
            <SectionHeader sub="· any of this, in plain English, on demand">Ask Alfred</SectionHeader>
            <Card className="p-5">
              <AskLearn isMember={isMember} />
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
