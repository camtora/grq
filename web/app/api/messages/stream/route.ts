import { memberFromRequest } from "@/lib/session";
import { unreadCountFor } from "@/lib/messages";
import { onMessagesChanged } from "@/lib/messages-live";

export const dynamic = "force-dynamic";

// SSE stream for the header messages badge — the web twin of iOS's push-received
// refresh (2e02e48). Sends {unread} on connect and again the instant a DM addressed
// to the caller lands or their thread is marked read (via the in-process bus in
// lib/messages-live.ts). Comment heartbeats every 25s keep nginx's default 60s
// proxy_read_timeout from cutting the connection. Members-only.

export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return new Response("Members only — read-only access.", { status: 403 });
  const email = session.email;

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let unsubscribe: (() => void) | undefined;

      cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup(); // the client went away mid-write
        }
      };

      const send = async () => {
        try {
          const unread = await unreadCountFor(email);
          write(`data: ${JSON.stringify({ unread })}\n\n`);
        } catch {
          /* transient db hiccup — the next change re-sends */
        }
      };

      unsubscribe = onMessagesChanged(email, () => void send());
      heartbeat = setInterval(() => write(": ping\n\n"), 25_000);
      req.signal.addEventListener("abort", () => cleanup());
      void send();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no", // nginx: don't buffer this response
    },
  });
}
