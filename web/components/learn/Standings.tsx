import Link from "next/link";
import { prisma } from "@/lib/db";
import { memberEmails } from "@/lib/users";
import { personByEmail } from "@/lib/people";
import Avatar from "@/components/Avatar";
import { Card } from "@/components/ui";
import { COURSES } from "@/lib/learn/content";
import { EXAMS } from "@/lib/learn/exams";

// The class standings (docs/LEARN-FRAMEWORK.md D111 §8) — published scores on the hub.
// Best score stands; the ATTEMPT COUNT is printed beside it (honesty the GRQ way, D71:
// scores are facts, not celebrations). Members only appear here — viewers read, don't sit
// exams (Cam 2026-07-04). Server component; viewer-visible like every read.

export default async function Standings() {
  const emails = memberEmails();
  let attempts: { email: string; courseSlug: string; scorePct: number; passed: boolean }[] = [];
  let dones: { email: string; courseSlug: string; lessonSlug: string }[] = [];
  try {
    [attempts, dones] = await Promise.all([
      prisma.learnExamAttempt.findMany({ select: { email: true, courseSlug: true, scorePct: true, passed: true } }),
      prisma.learnLessonDone.findMany({ select: { email: true, courseSlug: true, lessonSlug: true } }),
    ]);
  } catch {
    // schema not pushed yet / db hiccup — the hub must not fall over on homework
  }

  const totalLessons = COURSES.reduce((n, c) => n + c.lessons.length, 0);
  const byCourse = new Map(COURSES.map((c) => [c.slug, c]));

  const rows = emails.map((email) => {
    const person = personByEmail(email);
    const name = person?.name ?? email.split("@")[0];
    const mine = attempts.filter((a) => a.email === email);
    const perCourse = EXAMS.map((e) => {
      const sat = mine.filter((a) => a.courseSlug === e.courseSlug);
      const best = sat.length ? Math.max(...sat.map((a) => a.scorePct)) : null;
      return {
        courseSlug: e.courseSlug,
        n: byCourse.get(e.courseSlug)?.n ?? 0,
        best,
        count: sat.length,
        passed: sat.some((a) => a.passed),
      };
    });
    return {
      email,
      name,
      photo: person?.photo ?? null,
      lessonsDone: dones.filter((d) => d.email === email).length,
      coursesPassed: perCourse.filter((c) => c.passed).length,
      perCourse,
    };
  });

  return (
    <Card className="p-5">
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.email} className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex w-44 items-center gap-2.5">
              <Avatar src={r.photo} name={r.name} />
              <div>
                <div className="text-sm font-semibold text-teal-50">{r.name}</div>
                <div className="text-[11px] text-teal-200/50">
                  {r.coursesPassed}/{EXAMS.length} courses · {r.lessonsDone}/{totalLessons} lessons
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {r.perCourse.map((c) => (
                <Link
                  key={c.courseSlug}
                  href={`/learn/${c.courseSlug}`}
                  title={byCourse.get(c.courseSlug)?.title}
                  className={`rounded-md border px-1.5 py-0.5 text-[11px] tabular-nums transition-colors hover:bg-teal-400/10 ${
                    c.best === null
                      ? "border-teal-400/10 text-teal-200/35"
                      : c.passed
                        ? "border-emerald-400/30 text-emerald-300"
                        : "border-amber-400/30 text-amber-300"
                  }`}
                >
                  C{c.n}
                  {c.best !== null ? (
                    <>
                      {" "}
                      {c.best}%{c.count > 1 ? <span className="text-[9px] align-super">{c.count}×</span> : null}
                    </>
                  ) : (
                    " —"
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
        <p className="text-[11px] text-teal-200/40">
          Pass is 80%. Retakes are unlimited and the best score stands — but the attempt count is part of the record. Exams are
          open-book; the market is too.
        </p>
      </div>
    </Card>
  );
}
