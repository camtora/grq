import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { cookies } from "next/headers";
import NavBar from "@/components/NavBar";
import MessagesDrawer from "@/components/MessagesDrawer";
import GrqChat from "@/components/GrqChat";
import Tracker from "@/components/Tracker";
import { getSession, seesBook } from "@/lib/session";
import { namedMembers, isOwner } from "@/lib/users";
import { personByName } from "@/lib/people";
import { displayNameForEmail } from "@/lib/sso-names";
import { prisma } from "@/lib/db";

// The named members (Cam, Graham) are the toggle-able chat threads. Read per request: who is
// still a member is env-driven (GRQ_REMOVED_EMAILS), not fixed at build time.
const chatMembers = () => namedMembers().map(([email, u]) => ({ email, name: u.name }));

export const metadata: Metadata = {
  title: "GRQ — Get Rich Quick",
  description: "Get rich quick, slowly, with receipts.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [session, cookieStore] = await Promise.all([getSession(), cookies()]);
  const settings = await prisma.settings.findUnique({ where: { id: 1 } }).catch(() => null);

  // Viewers and users are always light (no override). Members: cookie wins, else
  // their stored default (Cam light, Graham dark) — dark if unknown.
  const cookieTheme = cookieStore.get("grq-theme")?.value;
  const theme: "light" | "dark" =
    session && session.role !== "member"
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
          name={session ? displayNameForEmail(session.email) : "?"}
          photo={personByName(session?.user?.name)?.photo ?? null}
          killSwitch={settings?.killSwitch ?? false}
          killSwitchBy={settings?.killSwitchBy ?? null}
          broker={(process.env.BROKER ?? "sim").toUpperCase()}
          theme={theme}
          isMember={session?.role === "member"}
          isOwner={isOwner(session?.email)}
          seesBook={seesBook(session)}
        />
        <div className="mx-auto max-w-[1700px] px-6 py-10">{children}</div>
        {/* Usage beacon — only for an authenticated session (everyone behind SSO). */}
        {session && <Tracker />}
        {/* Member↔member messages (header bubble) — members only. */}
        {session?.role === "member" && <MessagesDrawer />}
        {/* The floating bull = jump-search + Ask Alfred. Members can toggle into each
            other's agent threads; a viewer gets search + their OWN isolated thread
            (members=[] → no toggle, owner = themselves); a USER (D122) gets the
            jump-search dock only — Alfred's read-only tools include the book. */}
        {session && (
          <GrqChat
            meEmail={session.email}
            members={session.role === "member" ? chatMembers() : []}
            chat={seesBook(session)}
          />
        )}
        <footer className="mx-auto max-w-[1700px] space-y-1 px-6 pb-10 text-xs text-teal-200/30">
          <p>
            &ldquo;Get rich quick, slowly, with receipts.&rdquo; · Markets open 9:30–16:00 ET ·
            Hard guardrails enforced in code, not vibes
          </p>
          {/* The one line that follows every page (D136): what this is not, and where the terms are. */}
          <p>
            Not investment advice. Alfred is an AI. Nothing here is an offer to invest. ·{" "}
            <Link href="/terms" className="text-teal-300/60 hover:underline">Terms</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
