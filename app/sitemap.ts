import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://hockeyledger.com";
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/trade-machine`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/armchair-gm`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/players`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/teams`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/docket`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/press-box`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/methodology`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}
