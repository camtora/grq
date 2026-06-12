import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "grq-web",
    phase: 1,
    broker: process.env.BROKER ?? "sim",
    time: new Date().toISOString(),
  });
}
