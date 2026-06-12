import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import NavBar from "@/components/NavBar";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "GRQ — Get Rich Quick",
  description: "Get rich quick, slowly, with receipts.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [session, cookieStore] = await Promise.all([getSession(), cookies()]);
  const settings = await prisma.settings.findUnique({ where: { id: 1 } }).catch(() => null);

  // Cookie override wins; otherwise the member's default (Cam light, Graham dark).
  const cookieTheme = cookieStore.get("grq-theme")?.value;
  const theme: "light" | "dark" =
    cookieTheme === "light" || cookieTheme === "dark"
      ? cookieTheme
      : (session?.user?.theme ?? "dark");

  return (
    <html lang="en" data-theme={theme}>
      <body className="min-h-screen antialiased">
        <NavBar
          name={session?.user?.name ?? session?.email ?? "?"}
          killSwitch={settings?.killSwitch ?? false}
          broker={(process.env.BROKER ?? "sim").toUpperCase()}
          theme={theme}
        />
        <div className="mx-auto max-w-[1700px] px-6 py-10">{children}</div>
        <footer className="mx-auto max-w-[1700px] px-6 pb-10 text-xs text-teal-200/30">
          &ldquo;Get rich quick, slowly, with receipts.&rdquo; · Markets open 9:30–16:00 ET ·
          Hard guardrails enforced in code, not vibes
        </footer>
      </body>
    </html>
  );
}
