import { EventEmitter } from "node:events";

// In-process fan-out for the DM thread — the web twin of iOS's push-received
// listener (2e02e48). Every DM write goes through this Next.js process
// (createDirectMessage + the read route), so a module-level emitter can wake
// every open badge stream the instant a row lands; no client polling in the
// hot path. Single web container by design — a second instance would need
// pg LISTEN/NOTIFY instead.

const g = globalThis as unknown as { __grqMessagesBus?: EventEmitter };
const bus = g.__grqMessagesBus ?? (g.__grqMessagesBus = new EventEmitter());
bus.setMaxListeners(0); // one listener per open tab — not a leak

const EVENT = "messages-changed";

/** Wake every stream watching one of these members' inboxes. */
export function notifyMessagesChanged(emails: string[]) {
  for (const email of emails) bus.emit(EVENT, email.toLowerCase());
}

/** Subscribe to inbox changes for one member. Returns the unsubscribe. */
export function onMessagesChanged(email: string, fn: () => void): () => void {
  const mine = email.toLowerCase();
  const handler = (changed: string) => {
    if (changed === mine) fn();
  };
  bus.on(EVENT, handler);
  return () => {
    bus.off(EVENT, handler);
  };
}
