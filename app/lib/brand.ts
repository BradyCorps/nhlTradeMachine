// ── Brand ────────────────────────────────────────────────────────
// One source for the masthead, so the name lives in a constant rather than
// scattered across forty JSX strings. The rename off "Cap & Crease"
// touched every one of them; the next change should touch this file.
//
// The name is deliberately not "NHL <anything>". NHL is a registered mark, and
// using it descriptively — "independent analytics for NHL hockey" — is far more
// defensible than building it into the product's identity.

export const BRAND = {
  /** Masthead and metadata title. */
  name: "Cap & Crease",
  /** Handles, filenames, anywhere an ampersand is awkward. */
  slug: "cap-and-crease",
  short: "Cap & Crease",
  tagline: "Where roster decisions meet on-ice results.",
  domain: "capandcrease.com",
  url: "https://capandcrease.com",
  /** Descriptive, for search — the mark used nominatively, not as identity. */
  descriptor: "NHL Trade Machine, Player Analytics & Armchair GM",
  disclaimer:
    "Independent and unaffiliated with the National Hockey League. NHL and team names are the property of their respective owners.",
} as const;

/** Uppercase lockup for card exports and the admin bar. */
export const BRAND_CAPS = BRAND.name.toUpperCase();
