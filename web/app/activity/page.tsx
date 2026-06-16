import { redirect } from "next/navigation";

// /activity folded into the Journal page's order ledger (2.8 IA restructure).
export default function Activity() {
  redirect("/journal");
}
