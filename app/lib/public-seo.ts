import type { Metadata } from "next";
import { BRAND } from "@/app/lib/brand";

export interface PublicRouteSeo {
  path: `/${string}`;
  title: string;
  description: string;
}

export const PUBLIC_ROUTE_SEO = {
  players: {
    path: "/players",
    title: `NHL Player Analytics — ${BRAND.name}`,
    description: "Search NHL player dossiers with X-NAV trade value, contracts, season production, STRAND identity, roles, and development outlooks.",
  },
  teams: {
    path: "/teams",
    title: `NHL Team Analytics — ${BRAND.name}`,
    description: "Compare all 32 NHL teams by contention window, roster X-NAV, cap space, Team DNA, EDGE profile, and projected lines.",
  },
  fantasy: {
    path: "/fantasy",
    title: `Fantasy Hockey Tools — ${BRAND.name}`,
    description: "Build a league-specific fantasy hockey draft board with projections, value over replacement, tier breaks, regression signals, keepers, and goalies.",
  },
  tradeMachine: {
    path: "/trade-machine",
    title: `NHL Trade Machine — ${BRAND.name}`,
    description: "Build an NHL trade, add salary retention, compare X-NAV value, run the GM Audit, and share a locked trade verdict.",
  },
  armchair: {
    path: "/armchair-gm",
    title: `Armchair GM Simulator — ${BRAND.name}`,
    description: "Run an NHL front office through trades, roster construction, free agency, the draft, season simulation, and a three-year Cup Run.",
  },
  docket: {
    path: "/docket",
    title: `NHL Trade Rulings — ${BRAND.name}`,
    description: "Read published NHL trade rulings with frozen at-trade verdicts, current re-grades, X-NAV margins, and asset-level detail.",
  },
  pressBox: {
    path: "/press-box",
    title: `Press Box Daily Hockey Game — ${BRAND.name}`,
    description: "Play the daily hockey card hand, find player connections, compare your score with the optimal crib, and build a streak.",
  },
} as const satisfies Record<string, PublicRouteSeo>;

export const canonicalUrl = (path: PublicRouteSeo["path"]): string =>
  `${BRAND.url}${path === "/" ? "" : path}`;

export function publicRouteMetadata(route: PublicRouteSeo): Metadata {
  const url = canonicalUrl(route.path);
  const image = "/brand/png/cap-and-crease-og-1200x630.png";

  return {
    title: route.title,
    description: route.description,
    alternates: { canonical: url },
    openGraph: {
      title: route.title,
      description: route.description,
      type: "website",
      siteName: BRAND.name,
      url,
      images: [{ url: image, width: 1200, height: 630, alt: BRAND.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: route.title,
      description: route.description,
      images: [image],
    },
  };
}

export function teamDetailSeo(team: { id: string; name: string }): PublicRouteSeo {
  return {
    path: `/teams/${team.id.toLowerCase()}`,
    title: `${team.name} Team Analytics — ${BRAND.name}`,
    description: `${team.name} contention window, roster X-NAV, cap situation, Team DNA, EDGE profile, and projected lines.`,
  };
}
