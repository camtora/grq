import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { seesMeters } from "@/lib/users";
import { displayNameForEmail } from "@/lib/sso-names";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Chip } from "@/components/ui";
import TermsGate from "@/components/TermsGate";
import { TERMS_VERSION, safeNext } from "@/lib/terms";
import { TERMS_SHORT, TERMS_SECTIONS } from "@/lib/terms-content";

export const dynamic = "force-dynamic";

// /terms (D136). The full text for everyone, linked from every footer. For a USER who hasn't
// accepted the current version it is also the gate: the door sends them here with ?next=, and
// the button below writes their row, sets the cookie and sends them on. Cam (seesMeters) sees
// who has agreed, under the text.
export default async function TermsPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session) notFound();
  const next = safeNext(params.next);

  const isUser = session.role === "user";
  const mine = isUser
    ? await prisma.termsAcceptance.findUnique({ where: { email_version: { email: session.email, version: TERMS_VERSION } } }).catch(() => null)
    : null;
  const all = seesMeters(session.email)
    ? await prisma.termsAcceptance.findMany({ orderBy: { at: "desc" }, take: 500 }).catch(() => [])
    : [];
  const when = (d: Date) => d.toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" });

  return (
    <main className="mx-auto max-w-3xl">
      <Link href="/" className="text-xs text-teal-300 hover:underline">
        ← today
      </Link>
      <PageHeader
        title="The terms"
        sub={isUser && !mine ? "Read these once before GRQ opens. Two minutes." : `Version ${TERMS_VERSION}.`}
      />

      <Card className="mb-8 p-6">
        <div className="text-sm font-bold uppercase tracking-wider text-teal-200/70">The short version</div>
        <ul className="mt-3 space-y-2 text-sm text-teal-50">
          {TERMS_SHORT.map((line) => (
            <li key={line} className="flex gap-3">
              <span aria-hidden className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400/70" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        {isUser ? (
          <div className="mt-6 border-t border-teal-400/10 pt-5">
            {mine ? (
              <p className="text-sm text-teal-200/60">
                You agreed to version {mine.version} on {when(mine.at)}.{" "}
                <Link href={next} className="text-teal-300 hover:underline">Carry on →</Link>
              </p>
            ) : (
              <>
                <p className="mb-4 text-xs text-teal-200/50">The full text is below. The button means you have read it.</p>
                <TermsGate next={next} alreadyAccepted={false} />
              </>
            )}
          </div>
        ) : (
          <p className="mt-6 border-t border-teal-400/10 pt-5 text-xs text-teal-200/50">
            These apply to everyone who signs in. Only users are asked to click; you&apos;re a {session.role}.
          </p>
        )}
      </Card>

      <div className="space-y-8">
        {TERMS_SECTIONS.map((s, i) => (
          <section key={s.title}>
            <h2 className="text-base font-bold text-teal-100">
              <span className="mr-2 tabular-nums text-teal-200/40">{i + 1}.</span>
              {s.title}
            </h2>
            {s.body.map((p) => (
              <p key={p} className="mt-2 text-sm leading-relaxed text-teal-100/80">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>

      {isUser && !mine && (
        <Card className="mt-10 p-6">
          <TermsGate next={next} alreadyAccepted={false} />
        </Card>
      )}

      {all.length > 0 && (
        <Card className="mt-12 overflow-x-auto">
          <div className="border-b border-teal-400/10 px-4 py-3 text-sm font-bold uppercase tracking-wider text-teal-200/70">
            Who has agreed <span className="font-normal normal-case tracking-normal text-teal-200/40">· only you see this</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-teal-200/40">
                <th className="px-4 py-2 font-semibold">Who</th>
                <th className="px-4 py-2 font-semibold">Version</th>
                <th className="px-4 py-2 font-semibold">When</th>
                <th className="px-4 py-2 font-semibold">From</th>
              </tr>
            </thead>
            <tbody>
              {all.map((r) => (
                <tr key={r.id} className="border-t border-teal-400/10">
                  <td className="px-4 py-2.5 text-teal-50">{displayNameForEmail(r.email)}</td>
                  <td className="px-4 py-2.5">
                    <Chip tone={r.version === TERMS_VERSION ? "green" : "dim"}>{r.version}</Chip>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-teal-200/60">{when(r.at)}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-teal-200/40">{r.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </main>
  );
}
