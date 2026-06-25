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
// out of the box and survives an admin DB reset. Precedence (highest first):
//   1. DB fa_overrides  (admin's explicit choice, incl. SIGNED / EXCLUDE)
//   2. live scrape       (a contract that already reads as expiring)
//   3. this seed         (fills in the rest of the known class)
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
  // Goalies
  "Jet Greaves", "Akira Schmid", "Arturs Silovs", "Samuel Ersson", "Leevi Merilainen",
];

// Normalized (lowercased) name → status. Accents are stripped so source spelling
// variants (e.g. "Merilainen" vs "Meriläinen") still match.
const norm = (name: string): string =>
  name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export const FREE_AGENT_SEED_2026: Map<string, SeedFaStatus> = new Map([
  ...UFA.map((n) => [norm(n), "UFA"] as const),
  ...RFA.map((n) => [norm(n), "RFA"] as const),
]);

// Original-cased name + status, for the seed builder (which needs display names
// to create rows for FA-class players absent from contracts.bundled.json).
export const FREE_AGENT_SEED_LIST_2026: { name: string; status: SeedFaStatus }[] = [
  ...UFA.map((name) => ({ name, status: "UFA" as const })),
  ...RFA.map((name) => ({ name, status: "RFA" as const })),
];

export function seedFreeAgentStatus(playerName: string | null | undefined): SeedFaStatus | null {
  if (!playerName) return null;
  return FREE_AGENT_SEED_2026.get(norm(playerName)) ?? null;
}
