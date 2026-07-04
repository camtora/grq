import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import { memberEmails } from "@/lib/users";
import { personByEmail } from "@/lib/people";
import { EXAMS } from "@/lib/learn/exams";

// The Learn portal's live state for GRQ Go (D111 L5) — one GET that powers the hub's
// progress lines + standings, the syllabus checkmarks + exam cards, and the lessons'
// living-example blocks. Members only (exams/progress are member surfaces; the app is
// members-only anyway). Web reads the same tables directly in its server components.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  const [allDones, attempts, examples] = await Promise.all([
    prisma.learnLessonDone.findMany({ select: { email: true, courseSlug: true, lessonSlug: true } }),
    prisma.learnExamAttempt.findMany({ select: { email: true, courseSlug: true, scorePct: true, passed: true } }),
    prisma.learnExample.findMany({ select: { key: true, md: true, asOf: true } }),
  ]);
  const dones = allDones.filter((d) => d.email === session.email);

  const exams: Record<
    string,
    {
      questionCount: number;
      passPct: number;
      mine: { best: number; attempts: number; passed: boolean } | null;
      class: { name: string; photo: string | null; best: number; attempts: number; passed: boolean }[];
    }
  > = {};
  for (const e of EXAMS) {
    const forCourse = attempts.filter((a) => a.courseSlug === e.courseSlug);
    const mineRows = forCourse.filter((a) => a.email === session.email);
    exams[e.courseSlug] = {
      questionCount: e.questions.length,
      passPct: e.passPct,
      mine: mineRows.length
        ? { best: Math.max(...mineRows.map((a) => a.scorePct)), attempts: mineRows.length, passed: mineRows.some((a) => a.passed) }
        : null,
      class: memberEmails()
        .map((email) => {
          const rows = forCourse.filter((a) => a.email === email);
          if (!rows.length) return null;
          const person = personByEmail(email);
          return {
            name: person?.name ?? email.split("@")[0],
            photo: person?.photo ?? null,
            best: Math.max(...rows.map((a) => a.scorePct)),
            attempts: rows.length,
            passed: rows.some((a) => a.passed),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
    };
  }

  // The class — one row per member for the hub standings (web Standings parity).
  const standings = memberEmails().map((email) => {
    const person = personByEmail(email);
    const mine = attempts.filter((a) => a.email === email);
    const passedCourses = new Set(mine.filter((a) => a.passed).map((a) => a.courseSlug)).size;
    return {
      name: person?.name ?? email.split("@")[0],
      photo: person?.photo ?? null,
      lessonsDone: allDones.filter((d) => d.email === email).length,
      coursesPassed: passedCourses,
      perCourse: EXAMS.map((e) => {
        const rows = mine.filter((a) => a.courseSlug === e.courseSlug);
        return rows.length
          ? { courseSlug: e.courseSlug, best: Math.max(...rows.map((a) => a.scorePct)), attempts: rows.length, passed: rows.some((a) => a.passed) }
          : { courseSlug: e.courseSlug, best: null, attempts: 0, passed: false };
      }),
    };
  });

  return NextResponse.json({
    done: dones.map((d) => `${d.courseSlug}/${d.lessonSlug}`),
    exams,
    standings,
    examCount: EXAMS.length,
    examples: Object.fromEntries(examples.map((e) => [e.key, { md: e.md, asOf: e.asOf.toISOString() }])),
  });
}
