import { redirect } from "next/navigation";

// /activity folded into the Journal's order ledger, now at the bottom of Settings.
export default function Activity() {
  redirect("/settings#journal");
}
