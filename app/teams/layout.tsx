import type { ReactNode } from "react";
import StructuredData from "@/app/components/StructuredData";
import { BRAND } from "@/app/lib/brand";
import { TEAMS_DB } from "@/app/lib/db";
import { PUBLIC_ROUTE_SEO, canonicalUrl, publicRouteMetadata } from "@/app/lib/public-seo";

const route = PUBLIC_ROUTE_SEO.teams;
export const metadata = publicRouteMetadata(route);

export default function TeamsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StructuredData
        id="teams-list-schema"
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: route.title,
          description: route.description,
          url: canonicalUrl(route.path),
          numberOfItems: TEAMS_DB.length,
          itemListElement: TEAMS_DB.map((team, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: team.name,
            url: `${BRAND.url}/teams/${team.id.toLowerCase()}`,
          })),
        }}
      />
      {children}
    </>
  );
}
