import type { MetadataRoute } from "next";
import { BRAND } from "@/app/lib/brand";

// ── Sitemap ──────────────────────────────────────────────────────
//
// `lastModified` was `new Date()` on every entry, which tells a crawler that
// all eight pages changed the instant it asked. That is false for most of them
// and worth nothing for any of them: a page that always looks freshly modified
// carries exactly as much information as one that never does. Each route now
// declares a date that means something — the pages driven by league data move
// with the build, and the written reference pages carry the date their prose
// was last revised.
//
// /fantasy and /glossary were simply missing.

/** Set at build time. The data-driven pages genuinely do change with a deploy. */
const BUILD_DATE = new Date();

/** Bump these when the prose on those pages is actually revised. */
const METHODOLOGY_REVISED = new Date("2026-07-29");
const GLOSSARY_REVISED = new Date("2026-07-29");

export default function sitemap(): MetadataRoute.Sitemap {
  const base = BRAND.url;

  return [
    { url: base, lastModified: BUILD_DATE, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/trade-machine`, lastModified: BUILD_DATE, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/armchair-gm`, lastModified: BUILD_DATE, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/players`, lastModified: BUILD_DATE, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/teams`, lastModified: BUILD_DATE, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/fantasy`, lastModified: BUILD_DATE, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/docket`, lastModified: BUILD_DATE, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/press-box`, lastModified: BUILD_DATE, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/methodology`, lastModified: METHODOLOGY_REVISED, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/glossary`, lastModified: GLOSSARY_REVISED, changeFrequency: "monthly", priority: 0.5 },
  ];
}
