import { prisma } from "../lib/db";

// One-time backfill (run once at the deploy that adds ChatMessage.owner). The
// chat used to be a single shared thread; reconstruct per-member threads from
// history: each user turn goes to its author's thread, and each agent reply
// inherits the owner of the user turn it was answering.
async function main() {
  const msgs = await prisma.chatMessage.findMany({ orderBy: { at: "asc" } });
  let lastUserEmail = "";
  let updated = 0;
  for (const m of msgs) {
    if (m.role === "user") lastUserEmail = m.email;
    const owner = m.role === "user" ? m.email : lastUserEmail;
    if (owner && m.owner !== owner) {
      await prisma.chatMessage.update({ where: { id: m.id }, data: { owner } });
      updated++;
    }
  }
  console.log(`[backfill-chat-owner] assigned owner to ${updated}/${msgs.length} messages.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
