import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, EmptyState } from "@/components/ui";
import { getSession } from "@/lib/session";
import { courseBySlug } from "@/lib/learn/content";
import { examForCourse } from "@/lib/learn/exams";
import ExamRunner from "@/components/learn/ExamRunner";

// The exam sitting page (docs/LEARN-FRAMEWORK.md D111 §7.3). Members only — viewers read
// everything else on Learn, but exams and standings are the members' game (Cam 2026-07-04).
export const dynamic = "force-dynamic";

export default async function ExamPage({ params }: { params: Promise<{ course: string }> }) {
  const { course: slug } = await params;
  const course = courseBySlug(slug);
  const exam = examForCourse(slug);
  if (!course || !exam) notFound();

  const session = await getSession();
  const isMember = session?.role === "member";

  return (
    <main>
      <Link href={`/learn/${course.slug}`} className="text-xs text-teal-300 hover:underline">
        ← {course.title.toLowerCase()}
      </Link>
      <div className="mt-4">
        <PageHeader
          title={`The exam · ${course.title}`}
          sub={`${exam.questions.length} questions · pass ≥ ${exam.passPct}% · unlimited retakes — the best score stands, the attempt count shows`}
        />
        {isMember ? (
          <ExamRunner courseSlug={course.slug} />
        ) : (
          <EmptyState
            title="Members sit the exams"
            body="Learn is open to viewers end to end — lessons, checks, glossary, standings. The graded exams are member-only."
          />
        )}
      </div>
    </main>
  );
}
