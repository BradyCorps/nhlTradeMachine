// Curated secondary-position map for players whose deployment regularly
// differs from the single positionCode the NHL API provides.
// Key = player name, matched through `canonicalNameSlug` — NOT by raw string.
// Value = secondary position ("W", "C", "D").
//
// Lookups MUST go through `secondaryPositionFor`. A raw `MAP[p.name]` misses
// every player whose feed name carries diacritics: the roster feed says
// "Teuvo Teräväinen" and "Tomáš Hertl" while this table spells them without
// accents, so those two silently lost their alternate position — including
// Teräväinen, who is cited in lineup-order.ts as the example the feature
// exists for (ST3).
//
// A center with secondaryPosition "W" will be eligible for wing slots
// in lineup ordering — e.g. Vilardi is a natural C but plays RW on
// Winnipeg's top line with Connor–Scheifele.

import { canonicalNameSlug } from "@/app/lib/player-identity";

export const SECONDARY_POSITIONS: Record<string, string> = {
  // ── Centers who regularly play wing ──────────────────────────────────
  "Gabriel Vilardi":    "W",   // WPG — plays RW on L1 with Connor/Scheifele
  "Brayden Point":      "W",   // TBL — has played wing on the top line
  "Chandler Stephenson":"W",   // SEA/VGK — played wing alongside top centers
  "Ryan O'Reilly":      "W",   // NSH — versatile, deployed on wing
  "Nick Suzuki":        "W",   // MTL — occasionally shifted to wing
  "Pierre-Luc Dubois":  "W",   // WSH — has played wing at times
  "Tomas Hertl":        "W",   // VGK — plays wing on stacked center depth
  "William Karlsson":   "W",   // VGK — shifted to wing with Eichel/Stone
  "Mikael Backlund":    "W",   // CGY — veteran C who can play wing
  "Yanni Gourde":       "W",   // SEA — C/W versatility
  "Alex Wennberg":      "W",   // SEA/NYR — utility C who plays wing
  "Kevin Hayes":        "W",   // PIT/STL — has played wing
  "Sam Bennett":        "W",   // FLA — natural C deployed as power forward wing
  "Evan Rodrigues":     "W",   // FLA — C/W swiss army knife
  "Adam Henrique":      "W",   // EDM — plays wing alongside McDavid/Draisaitl
  "Derek Ryan":         "W",   // EDM — depth C/W
  "Nick Bonino":        "W",   // depth C who plays wing
  "Noel Acciari":       "W",   // depth C/W
  "Nicolas Roy":        "W",   // VGK — C who has played wing

  // ── Wingers who can play center ──────────────────────────────────────
  "Artturi Lehkonen":   "C",   // COL — W who takes draws
  "Teuvo Teravainen":   "C",   // CHI/CAR — W with center experience
};

// Slug-keyed index, built once. Accent-, case- and punctuation-insensitive, so
// "Teuvo Teräväinen", "teuvo teravainen" and "Teuvo Teravainen" all resolve.
const BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SECONDARY_POSITIONS).map(([name, pos]) => [canonicalNameSlug(name), pos]),
);

/** The curated alternate position for a player, or null. Diacritic-safe. */
export function secondaryPositionFor(name: string | null | undefined): string | null {
  if (!name) return null;
  return BY_SLUG[canonicalNameSlug(name)] ?? null;
}
