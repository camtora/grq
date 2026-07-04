import { NextResponse } from "next/server";
import type { ReactElement } from "react";
import { sessionFromRequest } from "@/lib/session";
import { DIAGRAMS, DIAGRAM_META } from "@/components/learn/diagrams";
import { ChartSvg, loadChartCloses } from "@/components/learn/LearnChart";
import type { LearnDiagramKey, LearnChartSpec } from "@/lib/learn/content";

// Learn diagrams + charts for GRQ Go (D111 L5) — the SAME React components the web
// renders, server-rendered to static SVG with the Tailwind classes resolved into an
// inline <style> sheet react-native-svg's SvgCss understands. One source of truth,
// two surfaces; the diagrams literally cannot drift between web and app.
//
//   GET /api/learn/svg?kind=diagram&id=book-ladder&theme=dark
//   GET /api/learn/svg?kind=chart&symbol=XIC&days=180&label=...&annotate=biggest-gap&theme=light
//
// → { title, caption, svg }
//
// RN-compat transforms: dominant-baseline → dy .35em (portable vertical centering);
// text halos (paint-order strokes) stripped (unsupported); CSS vars resolved to the
// theme's hex; class names sanitized (no "/" or "[]") so css-tree parses them.
export const dynamic = "force-dynamic";

type Theme = "dark" | "light";

// The exact ramp values the web themes resolve these classes to (globals.css: the light
// theme redefines teal/red/emerald/amber; dark keeps Tailwind defaults + a brighter
// teal-200). If globals.css moves a value, move it here — the smoke test will catch a
// missing class, not a drifted colour.
const RAMP: Record<Theme, Record<string, Record<number, string>>> = {
  dark: {
    teal: { 50: "#f0fdfa", 100: "#ccfbf1", 200: "#aff8ea", 300: "#5eead4", 400: "#2dd4bf" },
    emerald: { 300: "#6ee7b7", 400: "#34d399" },
    amber: { 200: "#fde68a", 300: "#fcd34d", 400: "#fbbf24" },
    red: { 300: "#fca5a5", 400: "#f87171" },
  },
  light: {
    teal: { 50: "#0f3d36", 100: "#14524a", 200: "#11665b", 300: "#0d9488", 400: "#0f766e" },
    emerald: { 300: "#047857", 400: "#059669" },
    amber: { 200: "#fde68a", 300: "#b45309", 400: "#fbbf24" },
    red: { 300: "#991b1b", 400: "#dc2626" },
  },
};
const VARS: Record<Theme, Record<string, string>> = {
  dark: { "--spark-up": "#2dd4bf", "--card-bg": "#0e1a18" },
  light: { "--spark-up": "#0d9488", "--card-bg": "#ffffff" },
};

function withAlpha(hex: string, pctTimes100: number): string {
  const a = Math.round((pctTimes100 / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

/** One Tailwind-ish token → a CSS declaration (or null when it has no SVG meaning). */
function ruleFor(token: string, theme: Theme): string | null {
  const color = /^(text|fill|stroke)-(teal|emerald|amber|red)-(\d{2,3})(?:\/(\d{1,3})|\/\[([\d.]+)\])?$/.exec(token);
  if (color) {
    const [, kind, hue, stepStr, opInt, opFrac] = color;
    const base = RAMP[theme][hue]?.[parseInt(stepStr, 10)];
    if (!base) return null;
    const pct = opFrac ? parseFloat(opFrac) * 100 : opInt ? parseInt(opInt, 10) : 100;
    const value = pct >= 100 ? base : withAlpha(base, pct);
    if (kind === "text") return `color:${value}`;
    return `${kind}:${value}`;
  }
  // fill-…/[0.04]-style arbitrary opacities on a hue (used by a few cells/boxes)
  const arb = /^(fill|stroke)-(teal|emerald|amber|red)-(\d{2,3})\/\[([\d.]+)\]$/.exec(token);
  if (arb) {
    const [, kind, hue, stepStr, frac] = arb;
    const base = RAMP[theme][hue]?.[parseInt(stepStr, 10)];
    if (!base) return null;
    return `${kind}:${withAlpha(base, parseFloat(frac) * 100)}`;
  }
  if (token === "fill-none") return "fill:none";
  const fs = /^text-\[([\d.]+)px\]$/.exec(token);
  if (fs) return `font-size:${fs[1]}px`;
  if (token === "font-semibold") return "font-family:Inter_600SemiBold";
  if (token === "font-bold") return "font-family:Inter_700Bold";
  if (token === "italic") return "font-style:italic";
  if (token === "tracking-widest") return "letter-spacing:1.2px";
  const tr = /^tracking-\[([\d.]+)em\]$/.exec(token);
  if (tr) return `letter-spacing:${Math.round(parseFloat(tr[1]) * 10)}px`;
  return null; // uppercase / tabular-nums / w-full — no SVG effect worth mapping
}

/** Resolve every class attribute into sanitized names + a stylesheet SvgCss can apply. */
function themeSvg(rawSvg: string, theme: Theme): string {
  let svg = rawSvg;
  for (const [v, hex] of Object.entries(VARS[theme])) svg = svg.split(`var(${v})`).join(hex);
  // portable vertical centering — rn-svg ignores dominant-baseline
  svg = svg.replace(/dominant-baseline="middle"/g, 'dy="0.35em"');
  // text halos (paint-order) aren't supported — strip the halo props from those <text> tags
  svg = svg.replace(/<text([^>]*)paint-order="stroke"([^>]*)>/g, (_m, a: string, b: string) => {
    const attrs = (a + " " + b).replace(/\s(?:stroke|stroke-width|stroke-linejoin)="[^"]*"/g, " ");
    return `<text${attrs}>`;
  });

  const rules = new Map<string, string>();
  svg = svg.replace(/class="([^"]*)"/g, (_m, list: string) => {
    const safe = list
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => {
        const name = "c-" + token.replace(/[^a-zA-Z0-9-]/g, "_");
        if (!rules.has(name)) {
          const decl = ruleFor(token, theme);
          if (decl) rules.set(name, decl);
        }
        return rules.has(name) ? name : null;
      })
      .filter(Boolean)
      .join(" ");
    return `class="${safe}"`;
  });

  const base =
    `svg{color:${theme === "dark" ? "#ccfbf1" : "#14524a"};}` +
    `text{font-family:Inter_400Regular;}` +
    [...rules.entries()].map(([name, decl]) => `.${name}{${decl}}`).join("");
  return svg.replace(/(<svg[^>]*>)/, `$1<style>${base}</style>`);
}

const CHART_STAMP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" });

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this." }, { status: 403 });

  const url = new URL(req.url);
  const theme: Theme = url.searchParams.get("theme") === "light" ? "light" : "dark";
  const kind = url.searchParams.get("kind");
  const { renderToStaticMarkup } = await import("react-dom/server");

  if (kind === "diagram") {
    const id = url.searchParams.get("id") as LearnDiagramKey | null;
    const el = id ? DIAGRAMS[id] : null;
    if (!id || !el) return NextResponse.json({ error: "Unknown diagram." }, { status: 404 });
    const html = renderToStaticMarkup(el as ReactElement);
    const m = /<svg[\s\S]*<\/svg>/.exec(html);
    if (!m) return NextResponse.json({ error: "Render failed." }, { status: 500 });
    return NextResponse.json(
      { title: DIAGRAM_META[id].title, caption: DIAGRAM_META[id].caption, svg: themeSvg(m[0], theme) },
      { headers: { "Cache-Control": "private, max-age=86400" } },
    );
  }

  if (kind === "chart") {
    const symbol = (url.searchParams.get("symbol") ?? "").toUpperCase();
    const days = parseInt(url.searchParams.get("days") ?? "0", 10);
    const label = url.searchParams.get("label") ?? symbol;
    const annotate = url.searchParams.get("annotate") === "biggest-gap" ? ("biggest-gap" as const) : undefined;
    if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol) || !(days >= 30 && days <= 400)) {
      return NextResponse.json({ error: "Bad chart spec." }, { status: 400 });
    }
    const spec: LearnChartSpec = { symbol, days, label: label.slice(0, 80), ...(annotate ? { annotate } : {}) };
    const closes = await loadChartCloses(spec);
    if (closes.length < 8) {
      return NextResponse.json({ title: spec.label, caption: "live chart — appears once the price cache has history", svg: null });
    }
    const html = renderToStaticMarkup(ChartSvg({ spec, closes }) as ReactElement);
    const m = /<svg[\s\S]*<\/svg>/.exec(html);
    if (!m) return NextResponse.json({ error: "Render failed." }, { status: 500 });
    return NextResponse.json(
      {
        title: spec.label,
        caption: `daily closes · as of ${CHART_STAMP.format(closes[closes.length - 1].date)}`,
        svg: themeSvg(m[0], theme),
      },
      { headers: { "Cache-Control": "private, max-age=3600" } },
    );
  }

  return NextResponse.json({ error: "kind must be diagram|chart." }, { status: 400 });
}
