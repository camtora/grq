import { prisma } from "@/lib/db";
import { universeEntry } from "@/lib/universe";
import { PageHeader, Chip } from "@/components/ui";
import ChatClient from "@/components/ChatClient";

export default async function Chat({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  const sp = await searchParams;
  const symbol =
    sp.symbol && (await universeEntry(sp.symbol)) ? sp.symbol.toUpperCase() : undefined;

  const messages = await prisma.chatMessage.findMany({
    orderBy: { at: "desc" },
    take: 50,
  });

  return (
    <main>
      <PageHeader
        title="Chat with GRQ"
        sub="One shared thread for both of you. The chat reads everything — portfolio, journal, signals, the web — and trades nothing, by construction."
        right={symbol ? <Chip tone="teal">discussing {symbol}</Chip> : undefined}
      />
      <ChatClient
        initialMessages={messages.reverse().map((m) => ({
          id: m.id,
          email: m.email,
          role: m.role,
          content: m.content,
        }))}
        symbol={symbol}
      />
    </main>
  );
}
