import { notFound, redirect } from "next/navigation";
import { PageHeader, Card } from "@/components/ui";
import PanelHeader from "@/components/PanelHeader";
import LearnButton from "@/components/learn/LearnButton";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { courseBySlug, lessonChecks, ledeMd, readMinutes } from "@/lib/learn/content";
import { examForCourse } from "@/lib/learn/exams";
import BlockRenderer from "@/components/learn/BlockRenderer";
import CheckBlock from "@/components/learn/CheckBlock";
import LessonProgress from "@/components/learn/LessonProgress";
import AskLesson from "@/components/learn/AskLesson";

// One lesson on its own page (docs/LEARN-FRAMEWORK.md D111 §3): the block sequence, the
// completion tracker, prev/next navigation, and a lesson-scoped Ask Alfred. The course
// page is the syllabus; this is the classroom. Inline checks live in a right-hand
// "Check yourself" rail (1/3 width, sticky on desktop; below the lesson on mobile —
// Cam 2026-07-05), with the completion tracker underneath them.
export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: Promise<{ course: string; lesson: string }> }) {
  const { course: courseSlug, lesson: lessonSlug } = await params;
  const course = courseBySlug(courseSlug);
  if (!course) notFound();
  if (course.external) redirect(course.external.href);
  if (course.status !== "live") notFound();

  const i = course.lessons.findIndex((l) => l.slug === lessonSlug);
  if (i < 0) notFound();
  const lesson = course.lessons[i];
  const prev = i > 0 ? course.lessons[i - 1] : null;
  const next = i < course.lessons.length - 1 ? course.lessons[i + 1] : null;
  const exam = examForCourse(course.slug);

  const session = await getSession();
  const isMember = session?.role === "member";
  let initiallyDone = false;
  if (isMember && session) {
    try {
      initiallyDone = !!(await prisma.learnLessonDone.findUnique({
        where: { email_courseSlug_lessonSlug: { email: session.email, courseSlug: course.slug, lessonSlug: lesson.slug } },
        select: { id: true },
      }));
    } catch {
      /* homework never takes the page down */
    }
  }

  const checks = lessonChecks(lesson);
  // The magazine lede: the first prose block's first two words go bold-caps — the
  // eye's landing spot (Cam 2026-07-04).
  const content = lesson.blocks
    .filter((b) => b.kind !== "check")
    .map((b, i) => (i === 0 && b.kind === "prose" ? { ...b, md: ledeMd(b.md) } : b));

  return (
    <main>
      <div className="mt-1 space-y-6">
        <PageHeader
          title={lesson.title.toUpperCase()}
          sub={`${course.n}. ${course.title} — lesson ${i + 1} of ${course.lessons.length} · ~${readMinutes(lesson)} min`}
          right={
            <LearnButton href={`/learn/${course.slug}`} tone="ghost">
              ← Back to Course
            </LearnButton>
          }
        />

        <div className="grid items-start gap-6 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            {content.map((block, bi) => (
              <BlockRenderer key={bi} block={block} />
            ))}
          </Card>

          <aside className="space-y-2 lg:sticky lg:top-20">
            <PanelHeader>Check yourself</PanelHeader>
            <div className="space-y-3">
              {checks.map((q) => (
                <CheckBlock key={q.id} q={q} />
              ))}
            </div>
            <div className="pt-1.5">
              <LessonProgress
                courseSlug={course.slug}
                lessonSlug={lesson.slug}
                totalChecks={checks.length}
                initiallyDone={initiallyDone}
                isMember={isMember}
              />
            </div>
          </aside>
        </div>

        {/* Every nav affordance says exactly what it does, in a clear LARGE button
            (Cam 2026-07-04) — lesson titles live in the syllabus, not in the buttons. */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          {prev ? (
            <LearnButton href={`/learn/${course.slug}/${prev.slug}`} tone="ghost">
              ← Previous Lesson
            </LearnButton>
          ) : (
            <LearnButton href={`/learn/${course.slug}`} tone="ghost">
              ← Back to Course
            </LearnButton>
          )}
          <AskLesson lessonTitle={lesson.title} courseTitle={course.title} isMember={isMember} />
          {next ? (
            <LearnButton href={`/learn/${course.slug}/${next.slug}`}>Next Lesson →</LearnButton>
          ) : exam ? (
            <LearnButton href={`/learn/${course.slug}/exam`}>Take the Exam →</LearnButton>
          ) : (
            <span />
          )}
        </div>
      </div>
    </main>
  );
}
