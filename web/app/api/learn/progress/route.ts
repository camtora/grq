import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import { courseBySlug, lessonBySlug } from "@/lib/learn/content";

export const dynamic = "force-dynamic";

// Mark a lesson done (docs/LEARN-FRAMEWORK.md D111 §8) — fired by LessonProgress when a
// lesson's inline checks have all been answered (or its "mark as read" clicked). Members
// only (Cam 2026-07-04: viewers are read-only — no learn writes). Idempotent upsert.
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  let body: { course?: unknown; lesson?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const courseSlug = typeof body.course === "string" ? body.course : "";
  const lessonSlug = typeof body.lesson === "string" ? body.lesson : "";
  const course = courseBySlug(courseSlug);
  if (!course || !lessonBySlug(course, lessonSlug)) {
    return NextResponse.json({ error: "Unknown lesson." }, { status: 404 });
  }

  await prisma.learnLessonDone.upsert({
    where: { email_courseSlug_lessonSlug: { email: session.email, courseSlug, lessonSlug } },
    create: { email: session.email, courseSlug, lessonSlug },
    update: {},
  });
  return NextResponse.json({ ok: true });
}
