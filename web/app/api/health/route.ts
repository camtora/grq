import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "grq-web",
    phase: 0,
    time: new Date().toISOString(),
  });
}
