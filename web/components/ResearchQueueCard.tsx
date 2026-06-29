import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui";
import PanelHeader from "@/components/PanelHeader";

// The agent's research pipeline — what Alfred is auto-researching right now (QUEUED/RUNNING)
// plus recently finished/failed. Self-fetching server component so it can be dropped onto any
// page (Portfolio, Today) without prop threading (Cam 2026-06-29 — moved off the Watchlist).
// Always renders (shows a "nothing queued" state) so it can sit as an always-on strip.
export default async function ResearchQueueCard({ heading = true }: { heading?: boolean }) {
  const requests = await prisma.researchRequest.findMany({
    where: { OR: [{ status: { in: ["QUEUED", "RUNNING"] } }, { at: { gte: new Date(Date.now() - 24 * 60 * 60_000) } }] },
    orderBy: { at: "desc" },
    take: 80,
  });
  const running = requests.filter((r) => r.status === "RUNNING");
  const queued = requests.filter((r) => r.status === "QUEUED");
  const recentDone = requests.filter((r) => r.status === "DONE").slice(0, 8);
  const recentFailed = requests.filter((r) => r.status === "FAILED").slice(0, 4);

  const tickerLink = (sym: string) => (
    <Link key={sym} href={`/stocks/${encodeURIComponent(sym)}`} className="hover:text-teal-200 hover:underline">
      {sym}
    </Link>
  );
  const joinLinks = (syms: string[]) => syms.map((s, i) => <span key={s}>{i > 0 && ", "}{tickerLink(s)}</span>);

  return (
    <div className="space-y-2">
      {heading && (
        <PanelHeader>
          Pending research <span className="font-normal normal-case text-teal-200/40">· what Alfred&apos;s auto-researching</span>
        </PanelHeader>
      )}
      <Card className="border-teal-400/30 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Research queue</span>
          {running.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-400/15 px-2.5 py-0.5 text-sm font-semibold text-teal-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" />
              researching {joinLinks(running.map((r) => r.symbol))}…
            </span>
          )}
          {queued.length > 0 ? (
            <span className="text-sm text-teal-100/70">
              <b className="text-teal-50">{queued.length}</b> queued: {joinLinks(queued.slice(0, 12).map((r) => r.symbol))}
              {queued.length > 12 ? ` +${queued.length - 12}` : ""}
            </span>
          ) : running.length === 0 ? (
            <span className="text-sm text-teal-200/40">Nothing queued — watch a name, or hit &ldquo;research now&rdquo; on any stock page.</span>
          ) : null}
          <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-teal-200/40">
            {recentDone.length > 0 && <span>recent: {joinLinks(recentDone.map((r) => r.symbol))}</span>}
            {recentFailed.length > 0 && <span className="text-red-300/70">failed: {joinLinks(recentFailed.map((r) => r.symbol))}</span>}
          </span>
        </div>
      </Card>
    </div>
  );
}
