import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { memberFromRequest, displayName } from "@/lib/session";
import { prisma } from "@/lib/db";
import { courseBySlug, lessonBySlug } from "@/lib/learn/content";
import { examForCourse, gradeExam } from "@/lib/learn/exams";
import { toPublicQuestion } from "@/lib/learn/answers";
import { pushNotify } from "@/lib/push/notify";

export const dynamic = "force-dynamic";

// The course exam API (docs/LEARN-FRAMEWORK.md D111 §7.3). GET serves the questions with
// answer keys STRIPPED and order shuffled per sitting; POST grades server-side, stores the
// attempt (best-stands, attempt count published), and pushes a `learn` notification to the
// other member on a newly-best pass. Members only, both verbs (Cam 2026-07-04: viewers are
// read-only — no exams). Keys exist only in lib/learn/exams.ts.

function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function GET(req: Request, { params }: { params: Promise<{ course: string }> }) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  const { course: courseSlug } = await params;
  const course = courseBySlug(courseSlug);
  const exam = examForCourse(courseSlug);
  if (!course || !exam) return NextResponse.json({ error: "No exam for that course." }, { status: 404 });

  const prior = await prisma.learnExamAttempt.findMany({
    where: { email: session.email, courseSlug },
    select: { scorePct: true },
  });

  return NextResponse.json({
    course: { slug: course.slug, title: course.title, n: course.n },
    version: exam.version,
    passPct: exam.passPct,
    attempts: prior.length,
    best: prior.length ? Math.max(...prior.map((a) => a.scorePct)) : null,
    questions: shuffled(exam.questions).map(toPublicQuestion),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ course: string }> }) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  const { course: courseSlug } = await params;
  const course = courseBySlug(courseSlug);
  const exam = examForCourse(courseSlug);
  if (!course || !exam) return NextResponse.json({ error: "No exam for that course." }, { status: 404 });

  let body: { answers?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const answers = (body.answers && typeof body.answers === "object" ? body.answers : {}) as Record<
    string,
    string | string[] | undefined
  >;

  const graded = gradeExam(exam, answers);

  const prior = await prisma.learnExamAttempt.findMany({
    where: { email: session.email, courseSlug },
    select: { scorePct: true, passed: true },
  });
  const prevBestPassed = prior.filter((a) => a.passed).reduce((m, a) => Math.max(m, a.scorePct), -1);
  const attempts = prior.length + 1;
  const best = Math.max(graded.scorePct, ...prior.map((a) => a.scorePct), 0);

  await prisma.learnExamAttempt.create({
    data: {
      email: session.email,
      courseSlug,
      version: exam.version,
      scorePct: graded.scorePct,
      passed: graded.passed,
      answers: answers as Prisma.InputJsonValue,
      feedback: graded.results as unknown as Prisma.InputJsonValue,
    },
  });

  // A newly-best pass is worth telling the other member about (toggleable `learn`
  // category). Repeat passes below the standing best stay quiet.
  if (graded.passed && graded.scorePct > prevBestPassed) {
    await pushNotify({
      category: "learn",
      severity: "info",
      actorEmail: session.email,
      title: `${displayName(session)} passed ${course.title} — ${graded.scorePct}%`,
      body: `Course ${course.n} exam · attempt #${attempts} · Learn standings updated`,
    });
  }

  return NextResponse.json({
    scorePct: graded.scorePct,
    passed: graded.passed,
    passPct: exam.passPct,
    attempts,
    best,
    results: graded.results.map((r) => ({
      ...r,
      reviewTitle: r.reviewLesson ? lessonBySlug(course, r.reviewLesson)?.title : undefined,
    })),
  });
}
