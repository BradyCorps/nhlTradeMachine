// ============================================================
// 2026 FREE-AGENT SEED
// A curated fallback list of the 2026 UFA/RFA class.
//
// Why this exists: in the off-season the live CapWages scrape does not reliably
// surface 2026-expiring contracts — once free agency rolls over, active-player
// rows show the *next* deal (2027+ expiry) or the player drops off the active
// list entirely. With no contract carrying expiryYear <= 2026, roster assembly
// detects zero pending free agents and the off-season list is empty.
//
// This seed marks the known class so the off-season Re-Sign phase is populated
// out of the box and survives an admin DB reset. Runtime FA facts now live on
// the players table; Contract Admin writes expiry_status / expiry_year /
// exclude_from_roster, and the committed seed fills missing baseline rows.
//
// Season-specific, like season-config. Refresh names each off-season. Keys are
// matched case-insensitively against assembled-roster player names.
// ============================================================

export type SeedFaStatus = "UFA" | "RFA";

const UFA: string[] = [
  // Forwards
  "Alex Tuch", "Anthony Mantha", "Alex Ovechkin", "Patrick Kane", "Viktor Arvidsson",
  "Mats Zuccarello", "Marcus Johansson", "Claude Giroux", "Vladimir Tarasenko", "Mason Marchment",
  "Gustav Nyquist",
  // Defence
  "John Carlson", "Rasmus Andersson", "Jacob Trouba", "Ryan Shea", "Tony DeAngelo",
  "Brent Burns", "John Klingberg", "Logan Stanley", "Nick Blankenburg", "Mario Ferraro",
  // Goalies
  "Matt Murray", "Connor Ingram", "Daniil Tarasov", "David Rittich", "Pheonix Copley",
  "Jonathan Quick", "Eric Comrie", "Stuart Skinner", "James Reimer", "Cam Talbot",
];

const RFA: string[] = [
  // Forwards
  "Jason Robertson", "Connor Bedard", "Cutter Gauthier", "Leo Carlsson", "Trevor Zegras",
  "Pavel Dorofeyev", "Adam Fantilli", "Collin Graf", "Connor McMichael", "Zach Benson",
  // Defence
  "Brandt Clarke", "Alexander Nikishin", "Jamie Drysdale", "Jordan Spence", "Simon Nemec",
  "Simon Edvinsson", "Pavel Mintyukov", "Olen Zellweger", "Braden Schneider", "Emil Andrae",
  // Kevin Korchinski and Ethan Del Mastro (CHI): both ELCs expired after
  // 2025-26; both received June 2026 qualifying offers and remain unsigned
  // Group 2 RFAs as of August 2026 (DATA-01 canaries — see V-04).
  "Kevin Korchinski", "Ethan Del Mastro",
  // Goalies
  "Jet Greaves", "Akira Schmid", "Arturs Silovs", "Samuel Ersson", "Leevi Merilainen",
];

import { canonicalName } from "@/app/lib/player-identity";

// Normalized (lowercased) name → status. Accents are stripped so source spelling
// variants (e.g. "Merilainen" vs "Meriläinen") still match. canonicalName()
// also resolves known cross-source name variants (e.g. "Alex" → "Alexander" Ovechkin).
const norm = (name: string): string =>
  canonicalName(name).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export const FREE_AGENT_SEED_2026: Map<string, SeedFaStatus> = new Map([
  ...UFA.map((n) => [norm(n), "UFA"] as const),
  ...RFA.map((n) => [norm(n), "RFA"] as const),
]);

// Original-cased name + status, for the seed builder (which needs display names
// to create rows for FA-class players absent from contracts.bundled.json).
// Known facts for FA-class players whose seed rows carry no age/contract
// (added with capHit 0). Ages are for the 2026-27 season; lastCapHit is the
// expiring AAV. Display + market pricing both read these at injection.
export const FA_KNOWN_FACTS: Record<string, { age?: number; lastCapHit?: number }> = {
  "Patrick Kane":       { age: 37, lastCapHit: 4.0 },
  "Claude Giroux":      { age: 38, lastCapHit: 3.25 },
  "Vladimir Tarasenko": { age: 34, lastCapHit: 4.75 },
  "Marcus Johansson":   { age: 35, lastCapHit: 2.0 },
  "Anthony Mantha":     { age: 31, lastCapHit: 3.5 },
  "John Klingberg":     { age: 33, lastCapHit: 1.75 },
  "Jonathan Quick":     { age: 40, lastCapHit: 1.275 },
  "Cam Talbot":         { age: 38, lastCapHit: 2.5 },
  "Matt Murray":        { age: 32, lastCapHit: 0.875 },
  "James van Riemsdyk": { age: 37, lastCapHit: 0.9 },
  "Gustav Nyquist":     { age: 36, lastCapHit: 3.185 },
};

export const FREE_AGENT_SEED_LIST_2026: { name: string; status: SeedFaStatus }[] = [
  ...UFA.map((name) => ({ name, status: "UFA" as const })),
  ...RFA.map((name) => ({ name, status: "RFA" as const })),
];

export function seedFreeAgentStatus(playerName: string | null | undefined): SeedFaStatus | null {
  if (!playerName) return null;
  return FREE_AGENT_SEED_2026.get(norm(playerName)) ?? null;
}
