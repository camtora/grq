import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { fmtWhen } from "@/lib/money";
import { Card, PageHeader, EmptyState } from "@/components/ui";
import MarketTabs from "@/components/MarketTabs";
import NoteForm from "@/components/NoteForm";
import Md from "@/components/Md";

export const dynamic = "force-dynamic";

// The human research desk (Graham 2026-06-16): Cam & Graham's OWN notes and
// analysis — NOT the agent's auto-research queue (that lives behind the scenes
// on the Watchlist). Tag a ticker to pin a note to that stock's page.
export default async function ResearchDesk() {
  const [session, notes] = await Promise.all([
    getSession(),
    prisma.note.findMany({ orderBy: { at: "desc" }, take: 100 }),
  ]);
  const isMember = session?.role === "member";

  return (
    <main>
      <PageHeader title="Market" sub="Your research desk — your own notes, theses, and analysis." />
      <MarketTabs />

      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Your research notes</h2>
          <p className="text-xs text-teal-200/40">Your own analysis — tag a ticker to pin a note to that stock&apos;s page.</p>
        </div>

        {isMember && (
          <div className="mb-4">
            <NoteForm />
          </div>
        )}

        {notes.length > 0 ? (
          <div className="space-y-3">
            {notes.map((n) => (
              <Card key={n.id} className="p-4">
                <div className="mb-1 flex items-center gap-2 text-xs text-teal-200/40">
                  {n.symbol && (
                    <Link href={`/stocks/${n.symbol}`} className="font-bold text-teal-300 hover:underline">
                      {n.symbol}
                    </Link>
                  )}
                  <span>{n.author}</span>
                  <span className="ml-auto">{fmtWhen(n.at)}</span>
                </div>
                <Md text={n.body} />
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No research notes yet"
            body={isMember ? "Jot your first thesis above — what you're looking at and why." : "Cam & Graham's research notes appear here."}
          />
        )}
      </section>
    </main>
  );
}
