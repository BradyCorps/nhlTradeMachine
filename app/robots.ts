import type { MetadataRoute } from "next";
import { BRAND } from "@/app/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/"],
      },
    ],
    sitemap: `${BRAND.url}/sitemap.xml`,
  };
}
