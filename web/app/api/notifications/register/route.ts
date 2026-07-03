import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

// Register / unregister an APNs device token for push (docs/PUSH-NOTIFICATIONS.md).
// Members-only (the app is members-only on mobile). The token is keyed by email so
// a member can have several devices; re-registering the same token is idempotent.

export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  let body: { token?: unknown; platform?: unknown; apnsEnv?: unknown; bundleId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  // APNs tokens are hex; accept a sane length to reject obvious junk.
  if (!/^[0-9a-fA-F]{32,200}$/.test(token)) {
    return NextResponse.json({ error: "A valid hex device token is required." }, { status: 400 });
  }
  const platform = body.platform === "android" ? "android" : "ios";
  const apnsEnv = body.apnsEnv === "sandbox" ? "sandbox" : "production";
  // The registering app's bundle == the token's apns-topic (GRQ Go vs the native app).
  const bundleId =
    typeof body.bundleId === "string" && /^[a-zA-Z0-9.\-]{3,80}$/.test(body.bundleId.trim())
      ? body.bundleId.trim()
      : "ca.camerontora.grq";

  await prisma.deviceToken.upsert({
    where: { email_token: { email: session.email, token } },
    update: { platform, apnsEnv, bundleId, lastUsedAt: new Date() },
    create: { email: session.email, token, platform, apnsEnv, bundleId },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "token required." }, { status: 400 });

  // Scope the delete to the caller's own tokens.
  await prisma.deviceToken.deleteMany({ where: { email: session.email, token } });
  return NextResponse.json({ ok: true });
}
