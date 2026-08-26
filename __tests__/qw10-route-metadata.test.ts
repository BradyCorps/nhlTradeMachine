import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEAMS_DB } from "@/app/lib/db";
import { activePlayers } from "@/app/lib/nhl-active-players";
import {
  PUBLIC_ROUTE_SEO,
  publicRouteMetadata,
  teamDetailSeo,
} from "@/app/lib/public-seo";

const read = (path: string) => readFileSync(path, "utf8");

describe("QW-10 route metadata and server topics", () => {
  it("publishes complete metadata for every required index route", () => {
    for (const key of ["players", "teams", "fantasy", "tradeMachine", "armchair"] as const) {
      const route = PUBLIC_ROUTE_SEO[key];
      const metadata = publicRouteMetadata(route);
      const canonical = `https://capandcrease.com${route.path}`;

      expect(metadata.title).toBe(route.title);
      expect(metadata.description).toBe(route.description);
      expect(metadata.alternates?.canonical).toBe(canonical);
      expect(metadata.openGraph).toMatchObject({
        title: route.title,
        description: route.description,
        url: canonical,
        type: "website",
      });
      expect(metadata.twitter).toMatchObject({
        card: "summary_large_image",
        title: route.title,
        description: route.description,
      });
    }
  });

  it("gives all 32 team dossiers unique canonical and social metadata", () => {
    const canonicals = new Set<string>();
    for (const team of TEAMS_DB) {
      const route = teamDetailSeo(team);
      const metadata = publicRouteMetadata(route);
      const canonical = `https://capandcrease.com/teams/${team.id.toLowerCase()}`;

      expect(metadata.title).toContain(team.name);
      expect(metadata.alternates?.canonical).toBe(canonical);
      expect(metadata.openGraph).toMatchObject({ url: canonical });
      expect(metadata.twitter).toMatchObject({ title: route.title });
      canonicals.add(canonical);
    }
    expect(canonicals.size).toBe(32);
  });

  it("mounts route metadata and appropriate structured data", () => {
    const layouts = {
      "players": "CollectionPage",
      "teams": "ItemList",
      "fantasy": "WebApplication",
      "trade-machine": "WebApplication",
      "armchair-gm": "WebApplication",
    } as const;

    for (const [route, schema] of Object.entries(layouts)) {
      const source = read(`app/${route}/layout.tsx`);
      expect(source).toContain("publicRouteMetadata");
      expect(source).toContain("<StructuredData");
      expect(source).toContain(schema);
    }

    expect(read("app/teams/[team]/page.tsx")).toContain('"SportsTeam"');
    expect(read("app/players/[playerId]/page.tsx")).toContain('"Person"');
  });

  it("keeps useful route topics in every server-first shell", () => {
    const checks: [string, string][] = [
      ["app/players/page.tsx", "NHL Player Analytics"],
      ["app/teams/loading.tsx", "NHL Team Analytics"],
      ["app/fantasy/page.tsx", "Fantasy Hockey Tools"],
      ["app/components/QuickTradeMachine.tsx", "NHL Trade Machine"],
      ["app/armchair-gm/Screens.tsx", "Armchair GM"],
      ["app/press-box/page.tsx", "<h1"],
    ];

    for (const [path, topic] of checks) {
      expect(read(path), path).toContain("<h1");
      expect(read(path), path).toContain(topic);
    }
    expect(read("app/teams/loading.tsx")).toContain('href={`/teams/${team.id.toLowerCase()}`}');
  });

  it("exposes canonical team and player dossier URLs through the sitemap", () => {
    const players = activePlayers();
    expect(players.length).toBeGreaterThan(400);
    expect(players.every((player) => /^\d{7,8}$/.test(player.id))).toBe(true);

    const sitemap = read("app/sitemap.ts");
    expect(sitemap).toContain("TEAMS_DB.map");
    expect(sitemap).toContain("activePlayers()");
    expect(sitemap).toContain("/players/${encodeURIComponent(player.id)}");
    expect(sitemap).toContain("/teams/${team.id.toLowerCase()}");
  });
});
