const MAX_CAP_CEILING = 120;
const LEGACY_DEFAULT_CAP_CEILING = 95.5;
const LEGACY_DEFAULT_CAP_FLOOR = 65;
const MIN_TEAM_CONTRACT_ROWS_FOR_CAP_SPACE = 10;

export interface TeamCapContract {
  teamId?: string | null;
  position?: string | null;
  capHit?: number | null;
  yearsRemaining?: number | null;
  isLtir?: boolean | null;
  isRetained?: boolean | null;
  retainedSalary?: number | null;
}

export function isValidCapCeiling(cap: number): boolean {
  return Number.isFinite(cap) && cap > 0 && cap <= MAX_CAP_CEILING;
}

export function isValidCapFloor(floor: number): boolean {
  return Number.isFinite(floor) && floor > 0;
}

function isLegacyDefault(value: number, legacyDefault: number, currentDefault: number): boolean {
  return currentDefault !== legacyDefault && value === legacyDefault;
}

export function parseStoredCapCeiling(value: string | undefined, currentDefault: number): number | null {
  if (value == null) return null;
  const cap = parseFloat(value);
  if (!isValidCapCeiling(cap)) return null;
  if (isLegacyDefault(cap, LEGACY_DEFAULT_CAP_CEILING, currentDefault)) return null;
  return cap;
}

export function parseStoredCapFloor(value: string | undefined, currentDefault: number): number | null {
  if (value == null) return null;
  const floor = parseFloat(value);
  if (!isValidCapFloor(floor)) return null;
  if (isLegacyDefault(floor, LEGACY_DEFAULT_CAP_FLOOR, currentDefault)) return null;
  return floor;
}

export function maxCapCeiling(): number {
  return MAX_CAP_CEILING;
}

export function contractCapCharge(contract: TeamCapContract): number {
  if ((contract.yearsRemaining ?? 0) <= 0) return 0;
  if (contract.position === "Pick") return 0;
  if (contract.isLtir) return 0;

  const capHit = contract.capHit ?? 0;
  if (!Number.isFinite(capHit) || capHit <= 0) return 0;

  if (contract.isRetained) {
    const retainedSalary = contract.retainedSalary ?? 0;
    return Number.isFinite(retainedSalary) && retainedSalary > 0 ? retainedSalary : capHit;
  }

  return capHit;
}

export function buildTeamCapSpaceMap(
  contracts: TeamCapContract[],
  capCeiling: number,
): Map<string, number> {
  const rowsByTeam = new Map<string, number>();
  const usedByTeam = new Map<string, number>();

  for (const contract of contracts) {
    const teamId = contract.teamId;
    if (!teamId) continue;
    rowsByTeam.set(teamId, (rowsByTeam.get(teamId) ?? 0) + 1);
    usedByTeam.set(teamId, (usedByTeam.get(teamId) ?? 0) + contractCapCharge(contract));
  }

  const capSpaceByTeam = new Map<string, number>();
  usedByTeam.forEach((usedCap, teamId) => {
    if ((rowsByTeam.get(teamId) ?? 0) < MIN_TEAM_CONTRACT_ROWS_FOR_CAP_SPACE) return;
    capSpaceByTeam.set(teamId, Math.round((capCeiling - usedCap) * 10) / 10);
  });

  return capSpaceByTeam;
}
