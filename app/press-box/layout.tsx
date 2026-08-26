import type { ReactNode } from "react";
import StructuredData from "@/app/components/StructuredData";
import { BRAND } from "@/app/lib/brand";
import { PUBLIC_ROUTE_SEO, canonicalUrl, publicRouteMetadata } from "@/app/lib/public-seo";

const route = PUBLIC_ROUTE_SEO.pressBox;
export const metadata = publicRouteMetadata(route);

export default function PressBoxLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StructuredData id="press-box-game-schema" data={{
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "Press Box",
        description: route.description,
        url: canonicalUrl(route.path),
        applicationCategory: "GameApplication",
        operatingSystem: "Web",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        publisher: { "@type": "Organization", name: BRAND.name, url: BRAND.url },
      }} />
      {children}
    </>
  );
}
