import { redirect } from "next/navigation";

// /activity folded into the Journal's order ledger (now on the standalone /journal page).
export default function Activity() {
  redirect("/journal");
}
