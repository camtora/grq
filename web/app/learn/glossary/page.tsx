import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";
import GlossaryBrowser from "@/components/learn/GlossaryBrowser";

// The browsable glossary (docs/LEARN-PORTAL.md, D110) — every term the app can explain,
// on one searchable page. The same entries power the <Term> popovers everywhere else;
// this is just the front door. Related terms cross-link within the page.
export const dynamic = "force-dynamic";

export default function GlossaryPage() {
  const entries = Object.entries(GLOSSARY)
    .map(([slug, e]) => ({
      slug,
      term: e.term,
      def: e.def,
      example: e.example ?? null,
      related: (e.related ?? [])
        .filter((r) => GLOSSARY[r])
        .map((r) => ({ slug: r, term: GLOSSARY[r].term })),
    }))
    .sort((a, b) => a.term.localeCompare(b.term));

  return (
    <main>
      <Link href="/learn" className="text-xs text-teal-300 hover:underline">
        ← learn
      </Link>
      <div className="mt-4">
        <PageHeader
          title="Glossary"
          sub={`Every term GRQ can explain — ${entries.length} and counting. These are the same definitions behind every underlined term in the app.`}
        />
        <GlossaryBrowser entries={entries} />
      </div>
    </main>
  );
}
