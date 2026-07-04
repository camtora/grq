"use client";

import { useState } from "react";

// Click-to-load YouTube embed (docs/LEARN-FRAMEWORK.md D111 §5.3) — a thumbnail and an
// honest label until the member clicks; only then does the youtube-nocookie iframe (and
// its network traffic) exist. No tracking or layout shift before the click. Curated
// blocks carry a one-line `why` written by us — the voice never gets outsourced.

export default function LiteYouTube({
  yt,
  title,
  author,
  minutes,
  why,
}: {
  yt: string;
  title: string;
  author: string;
  minutes: number;
  why: string;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="mt-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-teal-400/10 bg-black/40">
        {playing ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play video: ${title}`}
            className="group absolute inset-0 h-full w-full bg-cover bg-center"
            style={{ backgroundImage: `url(https://i.ytimg.com/vi/${yt}/hqdefault.jpg)` }}
          >
            <span className="absolute inset-0 bg-black/30 transition-colors group-hover:bg-black/20" />
            <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/60 text-xl text-white transition-transform group-hover:scale-110">
              ▶
            </span>
            <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white/80">{minutes} min</span>
          </button>
        )}
      </div>
      <div className="mt-1.5 text-xs">
        <span className="font-semibold text-teal-50">{title}</span>
        <span className="text-teal-200/50"> · {author}</span>
      </div>
      <p className="mt-0.5 text-[11px] italic text-teal-200/55">Watch for: {why}</p>
    </div>
  );
}
