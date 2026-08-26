import type { ReactNode } from "react";
import StructuredData from "@/app/components/StructuredData";
import { BRAND } from "@/app/lib/brand";
import { activePlayers } from "@/app/lib/nhl-active-players";
import { PUBLIC_ROUTE_SEO, canonicalUrl, publicRouteMetadata } from "@/app/lib/public-seo";

const route = PUBLIC_ROUTE_SEO.players;
export const metadata = publicRouteMetadata(route);

export default function PlayersLayout({ children }: { children: ReactNode }) {
  const players = activePlayers();
  return (
    <>
      <StructuredData
        id="players-collection-schema"
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: route.title,
          description: route.description,
          url: canonicalUrl(route.path),
          isPartOf: { "@type": "WebSite", name: BRAND.name, url: BRAND.url },
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: players.length,
            itemListElement: players.map((player, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: player.name,
              url: `${BRAND.url}/players/${encodeURIComponent(player.id)}`,
            })),
          },
        }}
      />
      {children}
    </>
  );
}
