import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import NavBar from "@/components/NavBar";
import MessagesDrawer from "@/components/MessagesDrawer";
import GrqChat from "@/components/GrqChat";
import Tracker from "@/components/Tracker";
import { getSession } from "@/lib/session";
import { USERS, isOwner } from "@/lib/users";
import { personByName } from "@/lib/people";
import { prisma } from "@/lib/db";

// The named members (Cam, Graham) are the toggle-able chat threads.
const CHAT_MEMBERS = Object.entries(USERS).map(([email, u]) => ({ email, name: u.name }));

export const metadata: Metadata = {
  title: "GRQ — Get Rich Quick",
  description: "Get rich quick, slowly, with receipts.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [session, cookieStore] = await Promise.all([getSession(), cookies()]);
  const settings = await prisma.settings.findUnique({ where: { id: 1 } }).catch(() => null);

  // Viewers are always light (no override). Members: cookie wins, else their
  // stored default (Cam light, Graham dark) — dark if unknown.
  const cookieTheme = cookieStore.get("grq-theme")?.value;
  const theme: "light" | "dark" =
    session?.role === "viewer"
      ? "light"
      : cookieTheme === "light" || cookieTheme === "dark"
        ? cookieTheme
        : (session?.user?.theme ?? "dark");

  return (
    <html lang="en" data-theme={theme}>
      <body className="min-h-screen antialiased">
        {/* Faint bull watermark behind every page (Cam 2026-06-17). */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bull-splash.png" alt="" className="w-[min(72vw,860px)] opacity-[0.04]" />
        </div>
        <NavBar
          name={session?.user?.name ?? session?.email ?? "?"}
          photo={personByName(session?.user?.name)?.photo ?? null}
          killSwitch={settings?.killSwitch ?? false}
          killSwitchBy={settings?.killSwitchBy ?? null}
          broker={(process.env.BROKER ?? "sim").toUpperCase()}
          theme={theme}
          isMember={session?.role === "member"}
          isOwner={isOwner(session?.email)}
        />
        <div className="mx-auto max-w-[1700px] px-6 py-10">{children}</div>
        {/* Usage beacon — only for an authenticated session (everyone behind SSO). */}
        {session && <Tracker />}
        {/* Member↔member messages (header bubble) — members only. */}
        {session?.role === "member" && <MessagesDrawer />}
        {/* The floating bull = jump-search + Ask Alfred, for EVERYONE. Members can
            toggle into each other's agent threads; a viewer gets search + their OWN
            isolated thread (members=[] → no toggle, owner = themselves). */}
        {session && (
          <GrqChat
            meEmail={session.email}
            members={session.role === "member" ? CHAT_MEMBERS : []}
          />
        )}
        <footer className="mx-auto max-w-[1700px] px-6 pb-10 text-xs text-teal-200/30">
          &ldquo;Get rich quick, slowly, with receipts.&rdquo; · Markets open 9:30–16:00 ET ·
          Hard guardrails enforced in code, not vibes
        </footer>
      </body>
    </html>
  );
}
