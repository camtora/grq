import Link from "next/link";
import { PageHeader } from "@/components/ui";
import JournalSection from "@/components/JournalSection";

// The journal is its own page again (Cam 2026-06-25). It was briefly redirected into
// Settings (2026-06-16), but the JournalSection stopped being rendered there — which
// orphaned every "journal →" link (they dead-ended on Settings with nothing). This is
// the full filterable record of every entry the agent writes, plus the order ledger.
export default async function Journal({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams;
  return (
    <main>
      <Link href="/portfolio" className="text-xs text-teal-300 hover:underline">← portfolio</Link>
      <PageHeader
        title="Journal"
        sub="The agent's working memory — every thesis, decision, trade, retro, and lesson, including the decisions not to trade. The full order ledger is at the bottom."
      />
      <JournalSection kind={sp.kind} />
    </main>
  );
}
