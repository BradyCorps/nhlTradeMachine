import { db } from "@/app/db/client";
import { draftPickOverrides } from "@/app/db/schema";
import { ensureNewTables } from "@/app/db/ensure-schema";
import { TEAMS_DB } from "@/app/lib/db";
import { pickEffectiveStanding } from "@/app/lib/pick-value";
import { SEASON } from "@/app/lib/season-config";
import { teamWindow } from "@/app/lib/team-window";
import { ALL_DRAFT_ROUNDS } from "@/app/lib/draft-picks";
import { PICK_OWNERSHIP_EVIDENCE } from "@/app/data/pick-ownership-2026-10-05";
import { resolvePickOwnership, type PickOwnershipEvidence } from "@/app/lib/pick-ownership";
import { listPublishedTrades, type TradeRecord } from "@/app/lib/trades";
import type { Asset } from "@/app/lib/trade-types";

type TeamPickContext = {
  id: string;
  /** Standings tier. Pick value reads the window via `teamWindow()`. */
  phase: string;
  /** Live roster window from Armchair GM, when the caller has one. */
  rosterWindow?: string;
  standing: number;
};

async function loadOwnership(): Promise<{ evidence: PickOwnershipEvidence[]; trades: TradeRecord[] } | null> {
  try {
    await ensureNewTables();
    const overrides = await db.select().from(draftPickOverrides);
    const published = await listPublishedTrades();
    const facts = new Map(PICK_OWNERSHIP_EVIDENCE.map(f => [f.id, f]));
    for (const o of overrides) {
      const existing = facts.get(o.id);
      if (o.updatedAt == null || !Number.isFinite(o.updatedAt)) continue;
      if (!TEAMS_DB.some(t => t.id === o.currentOwnerId)) continue;
      if (existing && o.updatedAt < Date.parse(existing.asOf)) continue;
      facts.set(o.id, {
        id: o.id,
        currentOwnerId: o.currentOwnerId,
        asOf: new Date(o.updatedAt).toISOString(),
        sourceUrls: [`admin:draft-picks/${o.id}`, ...(existing?.sourceUrls ?? [])],
        // A plain ownership edit cannot discharge an unresolved obligation.
        conditions: existing?.conditions || o.conditions || (o.isProtected ? "Protected pick; terms require verification." : null),
        relatedPickIds: existing?.relatedPickIds,
      });
    }
    return { evidence: [...facts.values()], trades: published };
  } catch {
    // Unknown current overrides/trades cannot become a full original-owned set.
    return null;
  }
}

export async function buildDraftPickInventory(teams: TeamPickContext[]) {
  const ownership = await loadOwnership();
  const teamPhaseMap = new Map(teams.map((team) => [team.id, team]));
  const picks: Asset[] = [];
  // Picks from already-completed drafts are not assets — the window
  // starts at the first still-tradable draft year, not SEASON.draftYear.
  const firstYear = SEASON.firstTradablePickYear;

  TEAMS_DB.forEach((origTeam) => {
    [firstYear, firstYear + 1, firstYear + 2, firstYear + 3, firstYear + 4].flatMap(year =>
      ALL_DRAFT_ROUNDS.map(round => ({ round, year }))
    ).forEach(({ round, year }) => {
      const id = `pick-${origTeam.id}-${year}-${round}`;

      const origTeamCtx = teamPhaseMap.get(origTeam.id) ?? origTeam;
      const teamStanding = pickEffectiveStanding(teamWindow(origTeamCtx), origTeamCtx.standing);

      const roundLabel = round === 1 ? "1st" : round === 2 ? "2nd" : round === 3 ? "3rd" : `${round}th`;
      picks.push({
        id,
        teamId:           "",
        name:             `${year} ${roundLabel} Round Pick (${origTeam.id})`,
        position:         "Pick",
        age:              19,
        round,
        year,
        teamStanding,
        games: 0, ptsPace: 0, xGPace: 0, defRate: 0,
        avgTOI: 0, qocIndex: null,
        capHit: 0, yearsRemaining: 0,
        hasNMC: false, hasNTC: false,
        canRetain: false, retainedPct: 0,
        multiplier: 1.0, hasLiveStats: false,
      });
    });
  });

  return resolvePickOwnership(picks, ownership?.evidence ?? [], ownership?.trades ?? []).map(pick => ({
    ...pick,
    name: pick.teamId && pick.teamId !== pick.originalOwnerId
      ? pick.name.replace(` (${pick.originalOwnerId})`, ` via ${pick.originalOwnerId}`) : pick.name,
  }));
}
