import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader, Card } from "@/components/ui";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { courseBySlug, lessonChecks, readMinutes } from "@/lib/learn/content";
import { examForCourse } from "@/lib/learn/exams";
import BlockRenderer from "@/components/learn/BlockRenderer";
import LessonProgress from "@/components/learn/LessonProgress";
import AskLesson from "@/components/learn/AskLesson";

// One lesson on its own page (docs/LEARN-FRAMEWORK.md D111 §3): the block sequence, the
// completion tracker, prev/next navigation, and a lesson-scoped Ask Alfred. The course
// page is the syllabus; this is the classroom.
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

  const checks = lessonChecks(lesson).length;

  return (
    <main>
      <Link href={`/learn/${course.slug}`} className="text-xs text-teal-300 hover:underline">
        ← {course.title.toLowerCase()}
      </Link>
      <div className="mt-4 space-y-6">
        <PageHeader
          title={lesson.title}
          sub={`Course ${course.n} · ${course.title} — lesson ${i + 1} of ${course.lessons.length} · ~${readMinutes(lesson)} min`}
        />

        <Card className="p-5">
          {lesson.blocks.map((block, bi) => (
            <BlockRenderer key={bi} block={block} />
          ))}
          <div className="mt-5 border-t border-teal-400/10 pt-4">
            <LessonProgress
              courseSlug={course.slug}
              lessonSlug={lesson.slug}
              totalChecks={checks}
              initiallyDone={initiallyDone}
              isMember={isMember}
            />
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          {prev ? (
            <Link href={`/learn/${course.slug}/${prev.slug}`} className="text-xs text-teal-300 hover:underline">
              ← {prev.title}
            </Link>
          ) : (
            <span />
          )}
          <AskLesson lessonTitle={lesson.title} courseTitle={course.title} isMember={isMember} />
          {next ? (
            <Link href={`/learn/${course.slug}/${next.slug}`} className="text-xs text-teal-300 hover:underline">
              {next.title} →
            </Link>
          ) : exam ? (
            <Link href={`/learn/${course.slug}/exam`} className="text-xs font-semibold text-teal-300 hover:underline">
              the final exam →
            </Link>
          ) : (
            <span />
          )}
        </div>
      </div>
    </main>
  );
}
