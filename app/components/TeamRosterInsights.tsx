"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import TeamLineup from "@/app/components/TeamLineup";
import { observedLabel, observedQuery, type ObservedSelection, type ObservedStats } from "@/app/lib/observed-season";
import type { LineupPlayer } from "@/app/lib/manual-team-lineups";
import { selectedPlayerStats, seasonStat, teamSeasonLeaders } from "@/app/lib/team-season-stats";

export default function TeamRosterInsights({ teamId, selection, roster, children }: {
  teamId: string; selection: ObservedSelection; roster: LineupPlayer[]; children: ReactNode;
}) {
  const query = observedQuery(selection);
  const { season, gameType } = selection;
  const [state, setState] = useState<{ query: string; stats: Record<string, ObservedStats>; failed: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/league/players?${query}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.players) || body.observations?.selection?.season !== season
          || body.observations?.selection?.gameType !== gameType) throw new Error();
        if (!controller.signal.aborted) setState({ query, stats: selectedPlayerStats(body.players, { season, gameType }), failed: false });
      } catch {
        if (!controller.signal.aborted) setState({ query, stats: {}, failed: true });
      }
    })();
    return () => controller.abort();
  }, [query, season, gameType]);

  const current = state?.query === query ? state : null;
  const stats = current?.stats ?? {};
  const leaders = teamSeasonLeaders(roster, teamId, stats);
  const assigned = roster.filter(player => player.teamId === teamId);
  const covered = assigned.filter(player => ["available", "zero-games"].includes(stats[player.id]?.coverage)).length;
  const playerLink = (player: LineupPlayer) => <Link className="min-h-11 flex items-center font-bold underline" href={`/players/${encodeURIComponent(player.id)}?${query}`}>{player.name}</Link>;

  return <>
    <TeamLineup teamId={teamId} selection={selection} roster={roster} compact stats={stats}>{children}</TeamLineup>
    <section id={`team-${teamId}-leaders`} aria-label="Season leaders" className="mt-4 pt-3 border-t" style={{ borderColor: "var(--ledger-rule)" }}>
      <h3 className="text-[13px] font-black">Season leaders & goaltending</h3>
      <p className="text-[11px] mt-1 mb-3">{observedLabel(selection)} · NHL summary statistics. Current assigned roster; player season totals include games with other teams.</p>
      {!current ? <p role="status" className="text-[11px]">Loading selected-season statistics…</p>
        : current.failed ? <p role="status" className="text-[11px]">Selected-season player statistics unavailable. Lineups and model analysis remain available.</p>
          : <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="min-w-0">
                <h4 className="text-[11px] font-black mb-1">Top five skaters · points</h4>
                {leaders.skaters.length ? <table className="w-full text-[11px] tabular-nums">
                  <caption className="sr-only">Selected-season skater scoring leaders</caption>
                  <thead><tr className="text-right"><th scope="col" className="text-left">Player</th>{["GP", "G", "A", "PTS"].map(label => <th key={label} scope="col" className="pl-2">{label}</th>)}</tr></thead>
                  <tbody>{leaders.skaters.map(player => <tr key={player.id} className="border-t" style={{ borderColor: "var(--ledger-rule)" }}>
                    <th scope="row" className="text-left font-normal">{playerLink(player)}</th>
                    {[player.stats.games, player.stats.goals, player.stats.assists, player.stats.points].map((value, i) => <td key={i} className="text-right pl-2">{seasonStat(value)}</td>)}
                  </tr>)}</tbody>
                </table> : <p className="text-[11px]">No recorded skater scoring available for this selection.</p>}
              </div>
              <div className="min-w-0">
                <h4 className="text-[11px] font-black mb-1">Goaltending · games played</h4>
                {leaders.goalies.length ? <table className="w-full text-[11px] tabular-nums">
                  <caption className="sr-only">Selected-season goalie results; order does not indicate tonight’s starter</caption>
                  <thead><tr className="text-right"><th scope="col" className="text-left">Goalie</th>{["GP", "SV%", "GAA"].map(label => <th key={label} scope="col" className="pl-2">{label}</th>)}</tr></thead>
                  <tbody>{leaders.goalies.map(player => <tr key={player.id} className="border-t" style={{ borderColor: "var(--ledger-rule)" }}>
                    <th scope="row" className="text-left font-normal">{playerLink(player)}</th>
                    <td className="text-right pl-2">{seasonStat(player.stats.games)}</td><td className="text-right pl-2">{seasonStat(player.stats.savePct, 3)}</td><td className="text-right pl-2">{seasonStat(player.stats.gaa, 2)}</td>
                  </tr>)}</tbody>
                </table> : <p className="text-[11px]">No recorded goalie results available for this selection.</p>}
                <p className="text-[10px] mt-2">GP: games played · SV%: save percentage · GAA: goals against average. Goalies sorted by games played, not starter status.</p>
              </div>
            </div>
            <p className="text-[10px] mt-2">Summary coverage: {covered}/{assigned.length} assigned players. Missing observations stay unavailable; historical model inputs are not substituted.</p>
          </>}
    </section>
  </>;
}
