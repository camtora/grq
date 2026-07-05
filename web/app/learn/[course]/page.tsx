import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import PanelHeader from "@/components/PanelHeader";
import LearnButton from "@/components/learn/LearnButton";
import Avatar from "@/components/Avatar";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COURSES, courseBySlug, readMinutes, lessonChecks } from "@/lib/learn/content";
import { examForCourse } from "@/lib/learn/exams";
import { memberEmails } from "@/lib/users";
import { personByEmail } from "@/lib/people";

// A course SYLLABUS (docs/LEARN-FRAMEWORK.md D111 §3): the overview, the lesson list with
// per-member checkmarks and minutes, and the final-exam card with the class's results.
// Lessons live on their own pages now (/learn/[course]/[lesson]). The external Options
// course renders a landing that points at its portal — its exam still lives here.
export const dynamic = "force-dynamic";

async function classResults(courseSlug: string) {
  try {
    const attempts = await prisma.learnExamAttempt.findMany({
      where: { courseSlug },
      select: { email: true, scorePct: true, passed: true },
    });
    return memberEmails()
      .map((email) => {
        const mine = attempts.filter((a) => a.email === email);
        if (!mine.length) return null;
        const person = personByEmail(email);
        return {
          email,
          name: person?.name ?? email.split("@")[0],
          photo: person?.photo ?? null,
          best: Math.max(...mine.map((a) => a.scorePct)),
          count: mine.length,
          passed: mine.some((a) => a.passed),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  } catch {
    return [];
  }
}

function ExamCard({
  courseSlug,
  isMember,
  results,
  questionCount,
  passPct,
}: {
  courseSlug: string;
  isMember: boolean;
  results: Awaited<ReturnType<typeof classResults>>;
  questionCount: number;
  passPct: number;
}) {
  return (
    <div className="space-y-2">
      <PanelHeader>The final exam</PanelHeader>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-teal-200/60">
            {questionCount} questions · pass ≥ {passPct}% · unlimited retakes — the best score stands, the attempt count shows.
          </p>
          {isMember ? (
            <LearnButton href={`/learn/${courseSlug}/exam`}>{results.length ? "Retake the Exam" : "Take the Exam"}</LearnButton>
          ) : (
            <span className="text-[11px] text-teal-200/40">exams are member-only — the lessons are all yours</span>
          )}
        </div>
        {results.length ? (
          <div className="mt-3 space-y-1.5 border-t border-teal-400/10 pt-3">
            {results.map((r) => (
              <div key={r.email} className="flex items-center gap-2.5 text-xs">
                <Avatar src={r.photo} name={r.name} size="h-5 w-5" />
                <span className="w-16 font-semibold text-teal-50">{r.name}</span>
                <span className={`tabular-nums font-semibold ${r.passed ? "text-emerald-300" : "text-amber-300"}`}>
                  {r.best}%{r.passed ? " ✓" : ""}
                </span>
                <span className="text-teal-200/40">
                  · {r.count} {r.count === 1 ? "attempt" : "attempts"}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export default async function CoursePage({ params }: { params: Promise<{ course: string }> }) {
  const { course: slug } = await params;
  const course = courseBySlug(slug);
  if (!course) notFound();

  const session = await getSession();
  const isMember = session?.role === "member";
  const exam = examForCourse(course.slug);
  const results = exam ? await classResults(course.slug) : [];

  if (course.status !== "live") {
    return (
      <main>
        <Link href="/learn" className="text-xs text-teal-300 hover:underline">
          ← learn
        </Link>
        <div className="mt-4">
          <PageHeader title={`${course.n}. ${course.title}`.toUpperCase()} sub={course.tagline} />
          <EmptyState
            title="Not written yet"
            body="This course is on the syllabus but the lessons haven't been written. It'll appear on the Learn hub the day it's ready — no vaporware, no placeholders."
          />
        </div>
      </main>
    );
  }

  // The external course (Options) — a landing for its portal, plus its exam.
  if (course.external) {
    return (
      <main>
        <Link href="/learn" className="text-xs text-teal-300 hover:underline">
          ← learn
        </Link>
        <div className="mt-4 space-y-6">
          <PageHeader title={`${course.n}. ${course.title}`.toUpperCase()} sub={course.tagline} />
          {course.overview?.length ? (
            <Card className="p-5">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">After this course</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-teal-100/80">
                {course.overview.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card className="p-5">
            <p className="text-sm leading-relaxed text-teal-100/75">
              This course is taught in its own portal: {course.external.note}
            </p>
            <LearnButton href={course.external.href} className="mt-3">
              Open the Options Portal
            </LearnButton>
          </Card>
          {exam ? (
            <ExamCard courseSlug={course.slug} isMember={isMember} results={results} questionCount={exam.questions.length} passPct={exam.passPct} />
          ) : null}
        </div>
      </main>
    );
  }

  let doneSet = new Set<string>();
  if (isMember && session) {
    try {
      const dones = await prisma.learnLessonDone.findMany({
        where: { email: session.email, courseSlug: course.slug },
        select: { lessonSlug: true },
      });
      doneSet = new Set(dones.map((d) => d.lessonSlug));
    } catch {
      /* homework never takes the page down */
    }
  }

  const next = COURSES.find((c) => c.n > course.n && c.status === "live");

  return (
    <main>
      <LearnButton href="/learn" tone="ghost">
        ← Back to Courses
      </LearnButton>
      <div className="mt-4 space-y-6">
        <PageHeader title={`${course.n}. ${course.title}`.toUpperCase()} sub={course.tagline} />

        {course.overview?.length ? (
          <Card className="p-5">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">After this course</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-teal-100/80">
              {course.overview.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </Card>
        ) : null}

        <div className="space-y-2">
          <PanelHeader>{`Lessons · ${course.lessons.length}`}</PanelHeader>
          <Card className="p-2">
            {course.lessons.map((lesson, i) => {
              const done = doneSet.has(lesson.slug);
              const checks = lessonChecks(lesson).length;
              return (
                <Link
                  key={lesson.slug}
                  href={`/learn/${course.slug}/${lesson.slug}`}
                  className="group flex items-baseline gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-teal-400/[0.05]"
                >
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-teal-300/50">{i + 1}</span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-teal-50 group-hover:underline">{lesson.title}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-teal-200/40">
                    {checks ? `${checks} ${checks === 1 ? "check" : "checks"} · ` : ""}
                    {readMinutes(lesson)} min
                  </span>
                  <span className={`w-4 shrink-0 text-sm ${done ? "text-emerald-300" : "text-teal-200/15"}`}>✓</span>
                </Link>
              );
            })}
          </Card>
        </div>

        {exam ? (
          <ExamCard courseSlug={course.slug} isMember={isMember} results={results} questionCount={exam.questions.length} passPct={exam.passPct} />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-teal-200/40">
            Every underlined term is tap-to-explain. Something still unclear? Ask Alfred — that&apos;s what the chat is for.
          </p>
          {next ? <LearnButton href={`/learn/${next.slug}`}>Next Course →</LearnButton> : null}
        </div>
      </div>
    </main>
  );
}
