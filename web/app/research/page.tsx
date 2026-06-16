import { redirect } from "next/navigation";

// /research moved under the Market tab (2.8 IA restructure).
export default function Research() {
  redirect("/market/research");
}
