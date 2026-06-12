import { NextRequest, NextResponse } from "next/server";
import { isAllowed } from "./lib/users";

// nginx + oauth2-proxy authenticate the Google account upstream and pass the
// identity in X-Forwarded-Email. This middleware is the fund's own door: only
// members get past it. Direct LAN hits on :3012 carry no header → 403.
const DENIED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GRQ — private fund</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#060d0c;color:#e7f5f2;font-family:system-ui,sans-serif">
<div style="text-align:center;max-width:28rem;padding:2rem">
<div style="font-size:2.75rem;font-weight:900;background:linear-gradient(90deg,#5eead4,#14b8a6);-webkit-background-clip:text;background-clip:text;color:transparent">GRQ</div>
<p style="margin-top:1.5rem;font-size:1.1rem">This is a private fund.</p>
<p style="margin-top:.5rem;color:#8fbfb6;font-size:.9rem">You're signed in, but this playground belongs to Cam &amp; Graham.</p>
</div></body></html>`;

export function middleware(req: NextRequest) {
  const email =
    req.headers.get("x-forwarded-email") ??
    (process.env.NODE_ENV !== "production" ? (process.env.GRQ_DEV_EMAIL ?? null) : null);

  if (!isAllowed(email)) {
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
