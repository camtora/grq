"use client";

import { useState } from "react";

// A face/logo for a tracked portfolio. If a curated asset exists in
// /public/smartmoney/<file> we use it; otherwise we draw a deterministic
// monogram (initials of the name) tinted with the roster accent — so a hole
// never shows and we never hotlink a headshot we don't have rights to.
export default function SmartMoneyAvatar({
  name,
  avatar,
  accent,
  className = "h-12 w-12 text-base",
}: {
  name: string;
  avatar?: string | null;
  accent?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  if (avatar && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatar.startsWith("/") ? avatar : `/smartmoney/${avatar}`}
        alt={name}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full border border-teal-400/15 bg-white object-cover ${className}`}
      />
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-teal-400/15 bg-teal-400/10 font-black ${accent ?? "text-teal-100"} ${className}`}
      title={name}
    >
      {initials}
    </span>
  );
}
