import { redirect } from "next/navigation";

// /ideas moved under the Market tab (2.8 IA restructure).
export default function Ideas() {
  redirect("/market");
}
