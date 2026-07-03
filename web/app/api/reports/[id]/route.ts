import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionFromRequest } from "@/lib/session";

// GET /api/reports/[id] — one report's full body (GRQ Go's Reports reader).
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const r = await prisma.report.findUnique({ where: { id: Number(id) } });
  if (!r) return NextResponse.json({ error: "No such report." }, { status: 404 });
  return NextResponse.json({
    id: String(r.id),
    kind: r.kind,
    title: r.title,
    dateISO: r.date.toISOString().slice(0, 10),
    bodyMarkdown: r.body,
  });
}
