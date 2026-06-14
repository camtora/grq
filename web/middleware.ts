import { NextRequest, NextResponse } from "next/server";
import { roleForEmail } from "./lib/users";

// nginx + oauth2-proxy authenticate the Google account upstream and pass the
// identity in X-Forwarded-Email. oauth2-proxy already rejects anyone not in the
// infra allowlist at login, so a valid header == an allowlisted user. This door
// therefore admits everyone allowlisted: members act, everyone else reads
// (role enforced per-route + in the UI). A header-less hit (direct LAN, no SSO)
// has no identity → 403.
const DENIED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GRQ</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#060d0c;color:#e7f5f2;font-family:system-ui,sans-serif">
<div style="text-align:center;max-width:28rem;padding:2rem">
<div style="font-size:2.75rem;font-weight:900;background:linear-gradient(90deg,#5eead4,#14b8a6);-webkit-background-clip:text;background-clip:text;color:transparent">GRQ</div>
<p style="margin-top:1.5rem;font-size:1.1rem">Sign in to view this fund.</p>
<p style="margin-top:.5rem;color:#8fbfb6;font-size:.9rem">No identity on this request — reach GRQ through the front door.</p>
</div></body></html>`;

export function middleware(req: NextRequest) {
  const email =
    req.headers.get("x-forwarded-email") ??
    (process.env.NODE_ENV !== "production" ? (process.env.GRQ_DEV_EMAIL ?? null) : null);

  if (!roleForEmail(email)) {
    return new NextResponse(DENIED_HTML, {
      status: 403,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return NextResponse.next();
}

export const config = {
  // /api/health stays open: the port is LAN-only and house monitoring probes it.
  matcher: ["/((?!api/health|_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
