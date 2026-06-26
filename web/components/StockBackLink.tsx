"use client";

import { useRouter } from "next/navigation";

// Stock-page back link. The page is reachable from many places (watchlist, universe, the hunt,
// browse, smart money, today, notifications, chat…), so a hardcoded "← universe" was wrong from
// most of them. This pops the browser history instead — you go back to wherever you actually came
// from. Falls back to the section default (universe for tracked names, the hunt otherwise) when
// there's no usable same-origin history (a deep link / fresh tab / external referrer).
export default function StockBackLink({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();
  return (
    <a
      href={fallbackHref}
      onClick={(e) => {
        e.preventDefault();
        let sameOrigin = true;
        try {
          const ref = document.referrer;
          sameOrigin = !ref || new URL(ref).origin === window.location.origin;
        } catch {
          sameOrigin = false;
        }
        if (window.history.length > 1 && sameOrigin) router.back();
        else router.push(fallbackHref);
      }}
      className="text-xs text-teal-300 hover:underline"
    >
      ← back
    </a>
  );
}
