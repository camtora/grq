import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { seesMeters, userForEmail } from "@/lib/users";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Chip } from "@/components/ui";
import AccessCheck from "@/components/AccessCheck";
import { sanitize, summarize, AUTO_CHECKS, MANUAL_CHECKS } from "@/lib/access-check";

export const dynamic = "force-dynamic";

// /access-check (D135) — a person proves to Cam what their own account can and can't reach.
// Open to every tier on purpose (a USER is who it's for). The page writes only the visitor's
// own row; everyone's results are shown to Cam alone (seesMeters), below his own check.
export default async function AccessCheckPage() {
  const session = await getSession();
  if (!session) notFound();

  const all = seesMeters(session.email)
    ? await prisma.accessCheck.findMany({ orderBy: { updatedAt: "desc" } }).catch(() => [])
    : [];

  return (
    <main>
      <Link href="/" className="text-xs text-teal-300 hover:underline">
        ← today
      </Link>
      <PageHeader
        title="Access check"
        sub="About five minutes. It confirms your account opens what it should, and nothing it shouldn't."
      />

      {all.length > 0 && (
        <Card className="mb-8 overflow-x-auto">
          <div className="border-b border-teal-400/10 px-4 py-3 text-sm font-bold uppercase tracking-wider text-teal-200/70">
            Results so far <span className="font-normal normal-case tracking-normal text-teal-200/40">· only you see this</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-teal-200/40">
                <th className="px-4 py-2 font-semibold">Who</th>
                <th className="px-4 py-2 font-semibold">Account</th>
                <th className="px-4 py-2 font-semibold">Automatic</th>
                <th className="px-4 py-2 font-semibold">By eye</th>
                <th className="px-4 py-2 font-semibold">Verdict</th>
                <th className="px-4 py-2 font-semibold">Last saved</th>
              </tr>
            </thead>
            <tbody>
              {all.map((r) => {
                let s: ReturnType<typeof summarize> | null = null;
                let overall = "";
                try {
                  const d = sanitize(JSON.parse(r.dataJson));
                  s = summarize(d);
                  overall = d.overall;
                } catch {
                  /* unreadable row */
                }
                const isUser = r.role === "user";
                const complete = !!s && s.autoRight + s.autoWrong.length === s.autoTotal && s.pass + s.fail.length === s.manualTotal;
                const clean = !!s && s.autoWrong.length === 0 && s.fail.length === 0;
                return (
                  <tr key={r.email} className="border-t border-teal-400/10 align-top">
                    <td className="px-4 py-2.5 text-teal-50">
                      {userForEmail(r.email)?.name ?? r.email}
                      {userForEmail(r.email) ? <div className="text-xs text-teal-200/40">{r.email}</div> : null}
                    </td>
                    <td className="px-4 py-2.5 text-teal-200/60">{r.role}</td>
                    <td className="px-4 py-2.5 tabular-nums text-teal-100/80">
                      {s ? `${s.autoRight} of ${s.autoTotal}` : "—"}
                      {s && s.autoWrong.length > 0 && (
                        <div className={`text-xs ${isUser ? "text-red-400" : "text-teal-200/40"}`}>
                          {isUser ? s.autoWrong.join(" · ") : "not a user account — refused rows open"}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-teal-100/80">
                      {s ? `${s.pass} of ${s.manualTotal}` : "—"}
                      {s && s.fail.length > 0 && <div className="text-xs text-red-400">{s.fail.join(" · ")}</div>}
                      {overall && <div className="mt-1 max-w-[22rem] text-xs text-teal-200/50">&ldquo;{overall}&rdquo;</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      {!isUser ? (
                        <Chip tone="dim">not a user</Chip>
                      ) : !complete ? (
                        <Chip tone="dim">in progress</Chip>
                      ) : clean ? (
                        <Chip tone="green">all correct</Chip>
                      ) : (
                        <Chip tone="red">needs a look</Chip>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-teal-200/50">
                      {r.updatedAt.toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" })}
                      {r.doneAt ? <div>marked done</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-teal-400/10 px-4 py-2 text-xs text-teal-200/40">
            {AUTO_CHECKS.length} automatic checks (the visitor&apos;s own browser, with their sign-in) · {MANUAL_CHECKS.length} by eye.
          </div>
        </Card>
      )}

      <AccessCheck email={session.email} role={session.role} />
    </main>
  );
}
