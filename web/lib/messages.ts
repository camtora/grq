import { prisma } from "./db";
import { pushNotify } from "./push/notify";
import { panelLabel } from "./panels";
import { memberKeyForEmail, userForEmail } from "./users";

// The member-to-member messaging spine (D61). One shared Cam↔Graham thread backs
// THREE features: plain chat, a full-page stock share, and a per-panel share with a
// comment. A share is just a message that also carries `symbol` (+ optional `panel`).
// Creating a message persists it and fires ONE push to the recipient (category
// "messages", gated by their toggle); the open thread polls for new rows.

const MAX_BODY = 2000;

type DbMessage = {
  id: number;
  at: Date;
  fromEmail: string;
  toEmail: string;
  body: string;
  symbol: string | null;
  panel: string | null;
  readAt: Date | null;
};

/** The wire shape (mirrors shared/contract.ts DirectMessage + ios DirectMessage). */
export function serializeMessage(m: DbMessage, viewerEmail: string) {
  return {
    id: m.id,
    at: m.at.toISOString(),
    fromKey: memberKeyForEmail(m.fromEmail), // "cam" | "graham" | null
    fromName: userForEmail(m.fromEmail)?.name ?? m.fromEmail,
    mine: m.fromEmail === viewerEmail,
    body: m.body,
    symbol: m.symbol,
    panel: m.panel,
    panelLabel: panelLabel(m.panel),
    readAt: m.readAt ? m.readAt.toISOString() : null,
  };
}

export type CreateMessageInput = {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  body?: string | null;
  symbol?: string | null;
  panel?: string | null;
};

/** Persist a DM (or share) and push the recipient. Returns the created row. */
export async function createDirectMessage(input: CreateMessageInput): Promise<DbMessage> {
  const body = (input.body ?? "").trim().slice(0, MAX_BODY);
  const symbol = typeof input.symbol === "string" && input.symbol.trim() ? input.symbol.trim().toUpperCase() : null;
  const panel = symbol && typeof input.panel === "string" && input.panel.trim() ? input.panel.trim() : null;

  const msg = (await prisma.directMessage.create({
    data: { fromEmail: input.fromEmail, toEmail: input.toEmail, body, symbol, panel },
  })) as DbMessage;

  // Compose the push. A share leads with what's being shared; a plain message leads
  // with the body. Truncation + fallback happen in pushNotify.
  let title: string;
  let pushBody: string;
  if (symbol) {
    const where = panel ? `${symbol} · ${panelLabel(panel) ?? "a panel"}` : symbol;
    title = `${input.fromName} shared ${where}`;
    pushBody = body || `Tap to open ${symbol}.`;
  } else {
    title = input.fromName;
    pushBody = body || "sent you a message";
  }

  await pushNotify({
    category: "messages",
    severity: "info",
    title,
    body: pushBody,
    onlyEmail: input.toEmail,
    ...(symbol ? { symbol } : {}),
    ...(panel ? { panel } : {}),
  });

  return msg;
}

/** Unread count for a member (messages addressed to them, not yet read). */
export async function unreadCountFor(email: string): Promise<number> {
  return prisma.directMessage.count({ where: { toEmail: email, readAt: null } });
}
