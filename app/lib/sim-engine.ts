export interface SimEnginePlayer {
  id: string;
  name: string;
  position: string;
  age: number;
  ptsPace: number;
  games?: number;
  baselinePtsPace?: number;
}

export function mulberry32(seed: number) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) =>
    `${JSON.stringify(key)}:${stableStringify(obj[key])}`
  ).join(",")}}`;
}

export function scenarioSeed(value: unknown): number {
  return hashString(stableStringify(value)) % 100000 + 1;
}

export const stablePts = (p: SimEnginePlayer): number =>
  p.baselinePtsPace && p.baselinePtsPace > 0
    ? p.ptsPace * 0.4 + p.baselinePtsPace * 0.6
    : p.ptsPace;

export const ageDecay = (age: number, position: string): number => {
  const peak = position === "D" ? 27 : position === "G" ? 29 : 26;
  if (age <= peak) return 1.0 + Math.max(0, (peak - age) * 0.005);
  const baseRate = position === "D" ? 0.018 : 0.022;
  const earlyYears = Math.min(age, 33) - peak;
  const lateYears = Math.max(0, age - 33);
  const decline = earlyYears * baseRate + lateYears * baseRate * 2.5;
  return Math.max(0.50, 1.0 - decline);
};

export function projectSkaterSeason(
  p: SimEnginePlayer,
  teamId: string,
  seed: number,
): { name: string; projectedPts: number; projectedGoals: number; gamesPlayed: number; position: string } {
  const rand = mulberry32(seed + hashString(`${teamId}:${p.id}:skater`));
  const decay = ageDecay(p.age, p.position);

  let gamesPlayed = Math.round(72 + rand() * 10);
  if (rand() < 0.05) {
    gamesPlayed = Math.max(5, gamesPlayed - Math.round(30 + rand() * 30));
  }

  const rawPts = (stablePts(p) / 82) * gamesPlayed * decay;
  const variance = 0.88 + rand() * 0.24;
  const projectedPts = Math.round(rawPts * variance);

  const goalPct = p.position === "D" ? 0.25 : 0.40;
  const projectedGoals = Math.round(projectedPts * goalPct * (0.90 + rand() * 0.20));
  return { name: p.name, projectedPts, projectedGoals, gamesPlayed, position: p.position };
}

export function projectTopScorer(
  roster: SimEnginePlayer[],
  teamId: string,
  seed: number,
): { name: string; projectedPts: number; projectedGoals: number; position: string } | null {
  const skaters = roster
    .filter(p => p.position !== "Pick" && p.position !== "G"
      && p.ptsPace > 0
      && (p.games ?? 0) >= 20);

  if (skaters.length === 0) return null;

  const projected = skaters.map((p) => projectSkaterSeason(p, teamId, seed));

  projected.sort((a, b) =>
    b.projectedPts !== a.projectedPts
      ? b.projectedPts - a.projectedPts
      : a.name.localeCompare(b.name)
  );
  return projected[0];
}
