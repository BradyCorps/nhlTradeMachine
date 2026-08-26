import type { ReactNode } from "react";
import StructuredData from "@/app/components/StructuredData";
import { BRAND } from "@/app/lib/brand";
import { PUBLIC_ROUTE_SEO, canonicalUrl, publicRouteMetadata } from "@/app/lib/public-seo";

const route = PUBLIC_ROUTE_SEO.tradeMachine;
export const metadata = publicRouteMetadata(route);

export default function TradeMachineLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StructuredData id="trade-machine-app-schema" data={{
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "NHL Trade Machine",
        description: route.description,
        url: canonicalUrl(route.path),
        applicationCategory: "SportsApplication",
        operatingSystem: "Web",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        publisher: { "@type": "Organization", name: BRAND.name, url: BRAND.url },
      }} />
      {children}
    </>
  );
}
