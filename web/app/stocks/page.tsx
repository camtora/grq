import { redirect } from "next/navigation";

// /stocks was renamed to /universe (2.8 IA restructure). The per-symbol detail
// pages still live at /stocks/[symbol].
export default function StocksIndex() {
  redirect("/universe");
}
