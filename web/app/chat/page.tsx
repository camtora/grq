import { redirect } from "next/navigation";

// Chat became a slide-out drawer (2026-06-12) — open it with the navbar Chat
// button or any "Ask GRQ" button. This route just goes home.
export default function Chat() {
  redirect("/");
}
