import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import PanelHeader from "@/components/PanelHeader";
import Md from "@/components/Md";
import { COURSES, courseBySlug } from "@/lib/learn/content";

// One Learn-portal course (docs/LEARN-PORTAL.md, D110): the lessons stacked as panels,
// markdown bodies rendered by Md (so every [[term]] is tap-to-explain), with optional
// "see it live" links under each lesson. Courses marked `soon` get an honest empty state;
// the Options course redirects to its own portal.
export const dynamic = "force-dynamic";

export default async function CoursePage({ params }: { params: Promise<{ course: string }> }) {
  const { course: slug } = await params;
  const course = courseBySlug(slug);
  if (!course) notFound();
  if (course.external) redirect(course.external.href);

  if (course.status !== "live") {
    return (
      <main>
        <Link href="/learn" className="text-xs text-teal-300 hover:underline">
          ← learn
        </Link>
        <div className="mt-4">
          <PageHeader title={`Course ${course.n} · ${course.title}`} sub={course.tagline} />
          <EmptyState
            title="Not written yet"
            body="This course is on the syllabus but the lessons haven't been written. It'll appear on the Learn hub the day it's ready — no vaporware, no placeholders."
          />
        </div>
      </main>
    );
  }

  const next = COURSES.find((c) => c.n > course.n && c.status === "live");

  return (
    <main>
      <Link href="/learn" className="text-xs text-teal-300 hover:underline">
        ← learn
      </Link>
      <div className="mt-4">
        <PageHeader title={`Course ${course.n} · ${course.title}`} sub={course.tagline} />

        <div className="space-y-6">
          {course.lessons.map((lesson, i) => (
            <div key={lesson.slug} className="space-y-2">
              <PanelHeader>{`${i + 1} · ${lesson.title}`}</PanelHeader>
              <Card className="p-5">
                <Md text={lesson.body} />
                {lesson.tryIt?.length ? (
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-teal-400/10 pt-3">
                    {lesson.tryIt.map((t) => (
                      <Link key={t.href} href={t.href} className="text-xs text-teal-300 hover:underline">
                        {t.label} →
                      </Link>
                    ))}
                  </div>
                ) : null}
              </Card>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-teal-200/40">
              Every underlined term is tap-to-explain. Something still unclear? Ask Alfred — that&apos;s what the chat is for.
            </p>
            {next ? (
              <Link
                href={next.external ? next.external.href : `/learn/${next.slug}`}
                className="text-xs text-teal-300 hover:underline"
              >
                Next: Course {next.n} · {next.title} →
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
