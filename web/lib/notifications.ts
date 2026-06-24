import { prisma } from "./db";

// The web notification center (the header bell). Rows are written by the push
// fan-out (lib/push/notify.ts → pushNotify) — one per recipient member — so the
// feed mirrors exactly what got pushed. This module is the read side: list the
// caller's recent notifications, count unread, mark read. The `messages` category
// never lands here (the envelope badge owns member DMs).

const FEED_LIMIT = 40;

type DbNotification = {
  id: number;
  at: Date;
  category: string;
  severity: string;
  title: string;
  body: string;
  symbol: string | null;
  panel: string | null;
  readAt: Date | null;
};

/** The wire shape the bell renders. */
export function serializeNotification(n: DbNotification) {
  return {
    id: n.id,
    at: n.at.toISOString(),
    category: n.category,
    severity: n.severity,
    title: n.title,
    body: n.body,
    symbol: n.symbol,
    panel: n.panel,
    read: n.readAt !== null,
  };
}

export type SerializedNotification = ReturnType<typeof serializeNotification>;

/** The caller's most recent notifications (newest first). */
export async function recentFor(email: string): Promise<DbNotification[]> {
  return prisma.notification.findMany({
    where: { email },
    orderBy: { id: "desc" },
    take: FEED_LIMIT,
  }) as Promise<DbNotification[]>;
}

/** Unread count for the bell badge. */
export async function unreadNotificationCount(email: string): Promise<number> {
  return prisma.notification.count({ where: { email, readAt: null } });
}

/** Mark the caller's notifications read (all, or a specific set of ids). */
export async function markNotificationsRead(email: string, ids?: number[]): Promise<void> {
  const where =
    ids && ids.length
      ? { email, readAt: null, id: { in: ids } }
      : { email, readAt: null };
  await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
}
