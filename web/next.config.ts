import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Don't reuse a stale client Router Cache entry on soft navigation — refetch
    // dynamic pages every time so a freshly-researched dossier shows immediately when
    // navigated to (e.g. clicking a hunt find whose full dossier just landed). 2026-06-23.
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;
