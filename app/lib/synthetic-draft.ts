// ── Synthetic Draft Classes — Cup Run Challenge Phase 2 ───────
// Real scouting data only exists for the 2026 class. Years 2-3 of a
// Cup Run need believable future first rounds, so this generates a
// seeded 32-pick class shaped like the real machinery expects: ELC
// Assets with draftOverall pedigree and an NHLe-style prospectPtsPace
// that decays by slot. Pure + deterministic.

import type { Asset } from "@/app/lib/trade-types";
import { hashString, mulberry32 } from "./sim-engine";
import { ROOKIE_ELC_CAP_HIT, ROOKIE_ELC_YEARS } from "./draft-rookies";

const FIRST_NAMES = [
  "Alex", "Anton", "Brady", "Carter", "Cole", "Connor", "Dmitri", "Elias",
  "Emil", "Ethan", "Filip", "Gabriel", "Hunter", "Ilya", "Jake", "Jesse",
  "Kirill", "Lars", "Liam", "Linus", "Logan", "Lukas", "Marcus", "Mikko",
  "Nathan", "Nikita", "Noah", "Oliver", "Owen", "Rasmus", "Ryan", "Simon",
  "Tomas", "Tyler", "Viktor", "William", "Zach",
];
const LAST_NAMES = [
  "Andersson", "Bergstrom", "Bouchard", "Byfield", "Carlsson", "Dubois",
  "Ekholm", "Fedorov", "Fontaine", "Gagnon", "Hedlund", "Ivanov",
  "Johansson", "Kowalski", "Kuznetsov", "Laine", "Larsson", "Lindqvist",
  "MacKenzie", "Makarov", "Morin", "Nieminen", "Novak", "Ohlund",
  "Parker", "Pettersson", "Reid", "Salo", "Sokolov", "Sullivan",
  "Tremblay", "Virtanen", "Volkov", "Walsh", "Weber", "Zetterberg",
];

// Position mix for a typical first round.
const POSITIONS: Array<{ pos: "C" | "W" | "D" | "G"; weight: number }> = [
  { pos: "C", weight: 0.25 },
  { pos: "W", weight: 0.35 },
  { pos: "D", weight: 0.32 },
  { pos: "G", weight: 0.08 },
];

function pickPosition(roll: number): "C" | "W" | "D" | "G" {
  let acc = 0;
  for (const { pos, weight } of POSITIONS) {
    acc += weight;
    if (roll < acc) return pos;
  }
  return "W";
}

const slugify = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Generate a seeded 32-pick first round for a future draft year.
 * `teamOrder` is worst-first (the draft order); short lists wrap.
 */
export function generateSyntheticDraftClass(
  year: number,
  seed: number,
  teamOrder: string[],
): Asset[] {
  if (teamOrder.length === 0) return [];
  const rand = mulberry32(seed + hashString(`synthetic-draft:${year}`));
  const picks: Asset[] = [];
  const used = new Set<string>();

  for (let overall = 1; overall <= 32; overall++) {
    let name = "";
    do {
      name = `${FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)]}`;
    } while (used.has(name));
    used.add(name);

    const position = pickPosition(rand());
    // NHLe pace by slot: ~1st overall 70s, tailing to ~high 20s by 32,
    // with noise so classes vary. Goalies carry no scoring pace.
    const basePace = 75 * Math.exp(-overall / 22) + 18;
    const noise = (rand() - 0.5) * 12;
    const prospectPtsPace = position === "G"
      ? null
      : Math.max(15, Math.round((basePace + noise) * 10) / 10);

    const team = teamOrder[(overall - 1) % teamOrder.length];
    picks.push({
      id: `draft-${year}-${overall}-${slugify(name)}`,
      teamId: team,
      name,
      position,
      age: 18,
      games: 0,
      ptsPace: 0,
      defRate: 0.08,
      avgTOI: 0,
      capHit: ROOKIE_ELC_CAP_HIT,
      lastCapHit: ROOKIE_ELC_CAP_HIT,
      yearsRemaining: ROOKIE_ELC_YEARS,
      hasNMC: false,
      hasNTC: false,
      canRetain: true,
      retainedPct: 0,
      multiplier: 1.0,
      draftYear: year,
      draftOverall: overall,
      prospectPtsPace,
      contractStatus: "SIGNED",
      expiresThisOffseason: false,
      hasLiveStats: false,
    });
  }
  return picks;
}
