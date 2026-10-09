"use client";

import { useEffect, useState } from "react";
import TeamBalanceCharts from "@/app/components/TeamBalanceCharts";
import TeamPercentageCharts from "@/app/components/TeamPercentageCharts";
import { observedQuery } from "@/app/lib/observed-season";
import { buildTeamBalance, gameBalanceSelection, sameObservedSelection, type TeamBalanceInput } from "@/app/lib/team-balance";
import type { NhlGame } from "@/app/lib/nhl-games";

export default function MatchupSeasonBalance({ game, teams }: { game: NhlGame; teams: TeamBalanceInput[] }) {
  const selection = gameBalanceSelection(game);
  const query = selection ? observedQuery(selection) : null;
  const season = selection?.season, gameType = selection?.gameType;
  const ids = [game.away.abbrev, game.home.abbrev];
  const provided = selection && ids.every(id => teams.some(team => team.id === id && sameObservedSelection(team.observedSelection, selection)));
  const [state, setState] = useState<{ query: string; teams: TeamBalanceInput[]; failed: boolean } | null>(null);
  useEffect(() => {
    if (!query || !season || !gameType || provided) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/league?${query}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.teams) || !sameObservedSelection(body.observations?.selection, { season, gameType })) throw new Error();
        if (!controller.signal.aborted) setState({ query, teams: body.teams, failed: false });
      } catch {
        if (!controller.signal.aborted) setState({ query, teams: [], failed: true });
      }
    })();
    return () => controller.abort();
  }, [query, season, gameType, provided]);

  if (!selection || !query) return <p className="text-[11px] my-3">Season comparison unavailable for this game’s season or competition.</p>;
  const current = state?.query === query ? state : null;
  if (!provided && !current) return <p role="status" className="text-[11px] my-3">Loading this matchup’s season statistics…</p>;
  if (!provided && current?.failed) return <p role="status" className="text-[11px] my-3">This matchup’s season statistics are temporarily unavailable.</p>;
  const source = provided ? teams : current?.teams ?? [];
  const selectedTeams = [game.away, game.home].map(team => source.find(row => row.id === team.abbrev)
    ?? { id: team.abbrev, name: team.name, record: null });
  const balance = selectedTeams.map(team => buildTeamBalance(team, selection));
  return <><TeamBalanceCharts teams={balance} selection={selection} /><TeamPercentageCharts teams={selectedTeams} selection={selection} /></>;
}
