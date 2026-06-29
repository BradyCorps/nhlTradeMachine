import { db } from "@/app/db/client";
import { draftPickOverrides } from "@/app/db/schema";
import { ensureNewTables } from "@/app/db/ensure-schema";
import { TEAMS_DB } from "@/app/lib/db";
import { pickEffectiveStanding } from "@/app/lib/pick-value";
import { SEASON } from "@/app/lib/season-config";

type TeamPickContext = {
  id: string;
  phase: string;
  standing: number;
};

type PickOverride = {
  currentOwnerId: string;
  isProtected: boolean;
  conditions: string | null;
};

async function loadPickOverrideMap(): Promise<Map<string, PickOverride>> {
  const pickOverrideMap = new Map<string, PickOverride>();
  try {
    await ensureNewTables();
    const overrides = await db.select().from(draftPickOverrides);
    for (const o of overrides) {
      pickOverrideMap.set(o.id, {
        currentOwnerId: o.currentOwnerId,
        isProtected: !!o.isProtected,
        conditions: o.conditions ?? null,
      });
    }
  } catch {
    // Table not yet created or DB unavailable: runtime defaults still work.
  }
  return pickOverrideMap;
}

export async function buildDraftPickInventory(teams: TeamPickContext[]) {
  const pickOverrideMap = await loadPickOverrideMap();
  const teamPhaseMap = new Map(teams.map((team) => [team.id, team]));
  const picks: any[] = [];
  const currentDraftYear = SEASON.draftYear;

  TEAMS_DB.forEach((origTeam) => {
    [currentDraftYear, currentDraftYear + 1, currentDraftYear + 2, currentDraftYear + 3, currentDraftYear + 4].flatMap(year =>
      [1, 2, 3, 4, 5].map(round => ({ round, year }))
    ).forEach(({ round, year }) => {
      const id = `pick-${origTeam.id}-${year}-${round}`;
      const override = pickOverrideMap.get(id);
      const currentOwnerId = override?.currentOwnerId ?? origTeam.id;
      const isProtected = override?.isProtected ?? false;
      const conditions = override?.conditions ?? null;

      const origTeamCtx = teamPhaseMap.get(origTeam.id) ?? origTeam;
      const teamStanding = pickEffectiveStanding(origTeamCtx.phase, origTeamCtx.standing);

      const roundLabel = round === 1 ? "1st" : round === 2 ? "2nd" : round === 3 ? "3rd" : `${round}th`;
      const ownerSuffix = currentOwnerId !== origTeam.id ? ` via ${origTeam.id}` : ` (${origTeam.id})`;
      picks.push({
        id,
        teamId:           currentOwnerId,
        name:             `${year} ${roundLabel} Round Pick${ownerSuffix}`,
        position:         "Pick",
        age:              19,
        round,
        year,
        teamStanding,
        isProtected,
        conditions,
        games: 0, ptsPace: 0, xGPace: 0, defRate: 0,
        avgTOI: 0, qocIndex: null,
        capHit: 0, yearsRemaining: 0,
        hasNMC: false, hasNTC: false,
        canRetain: false, retainedPct: 0,
        multiplier: 1.0, hasLiveStats: false,
      });
    });
  });

  return picks;
}
