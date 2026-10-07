"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { gameScore, gameStatus, type NhlGame, type NhlGamesBoard } from "@/app/lib/nhl-games";
import { DEFAULT_OBSERVED_SELECTION, OBSERVED_SEASONS, observedQuery } from "@/app/lib/observed-season";

export interface MatchupTeamOutlook {
  id: string;
  name: string;
  rosterNAV: number | null;
  capSpace: number | null;
  present: number | null;
  future: number | null;
}

const ink = "var(--ledger-ink)", faint = "var(--ledger-ink-faint)", rule = "var(--ledger-rule)";
const numeric = (value: number | null | undefined, suffix = "") =>
  typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}${suffix}` : "Unavailable";

function gameSelectionQuery(game: NhlGame) {
  const season = OBSERVED_SEASONS.find(s => s === String(game.season)) ?? DEFAULT_OBSERVED_SELECTION.season;
  return observedQuery({ season, gameType: game.gameType === 3 ? 3 : 2 });
}

function GameCardSummary({ game, selected }: { game: NhlGame; selected: boolean }) {
  return <>
    <span className="block text-[10px] font-black mb-3" style={{ color: faint }}>{gameStatus(game)}</span>
    <span className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <span><span className="block text-[19px] font-black">{game.away.abbrev}</span><span className="block text-[10px]">{game.away.name}</span><span className="block text-[10px] mt-1" style={{ color: faint }}>{game.away.record ?? "Record unavailable"}</span></span>
      <span className="text-[13px] font-black">{gameScore(game) ?? "at"}</span>
      <span className="text-right"><span className="block text-[19px] font-black">{game.home.abbrev}</span><span className="block text-[10px]">{game.home.name}</span><span className="block text-[10px] mt-1" style={{ color: faint }}>{game.home.record ?? "Record unavailable"}</span></span>
    </span>
    <span className="block text-[10px] font-black mt-3" style={{ color: "var(--ledger-red)" }}>{selected ? "Close matchup ↑" : "View matchup →"}</span>
  </>;
}

export function MatchupComparison({ game, teams }: { game: NhlGame; teams: MatchupTeamOutlook[] }) {
  const away = teams.find(t => t.id === game.away.abbrev);
  const home = teams.find(t => t.id === game.home.abbrev);
  const seasonLabel = `${String(game.season).slice(0, 4)}–${String(game.season).slice(6)}`;
  const competition = game.gameType === 3 ? "playoffs" : game.gameType === 2 ? "regular season" : game.gameType === 1 ? "preseason" : "NHL game";
  const cap = (team: MatchupTeamOutlook | undefined) => typeof team?.capSpace === "number" && Number.isFinite(team.capSpace) ? `$${team.capSpace.toFixed(1)}M` : "Unavailable";
  const rows = [
    ["Record", game.away.record ?? "Unavailable", game.home.record ?? "Unavailable"],
    ["Present outlook", numeric(away?.present), numeric(home?.present)],
    ["Future outlook", numeric(away?.future), numeric(home?.future)],
    ["Roster X-NAV", numeric(away?.rosterNAV), numeric(home?.rosterNAV)],
    ["Cap space", cap(away), cap(home)],
  ];

  return (
    <section id={`matchup-${game.id}`} aria-labelledby={`matchup-title-${game.id}`} className="border p-3 sm:p-5 mt-4" style={{ borderColor: rule, background: "var(--paper-card)" }}>
      <p className="text-[9px] font-black uppercase tracking-[0.15em] mb-1" style={{ color: faint }}>Matchup · {gameStatus(game)}</p>
      <h2 id={`matchup-title-${game.id}`} className="text-[16px] font-black mb-2">{away?.name ?? game.away.name} at {home?.name ?? game.home.name}</h2>
      <p className="text-[11px] mb-3" style={{ color: faint }}>{game.venue ?? "Venue unavailable"}{game.broadcasts.length > 0 ? ` · TV: ${game.broadcasts.join(", ")}` : ""}</p>

      <table className="w-full table-fixed text-[11px] mb-3">
        <caption className="text-left text-[10px] mb-2">Records: {seasonLabel} {competition}, NHL game feed. Outlook and value: Cap &amp; Crease models.</caption>
        <thead><tr className="border-b" style={{ borderColor: rule }}>
          <th scope="col" className="text-left py-2 w-[40%]">Comparison</th>
          <th scope="col" className="text-right py-2">{game.away.abbrev}<span className="block text-[9px] font-normal">Away</span></th>
          <th scope="col" className="text-right py-2">{game.home.abbrev}<span className="block text-[9px] font-normal">Home</span></th>
        </tr></thead>
        <tbody>{rows.map(([label, awayValue, homeValue]) => (
          <tr key={label} className="border-b" style={{ borderColor: rule }}>
            <th scope="row" className="text-left font-normal py-2 pr-1">{label}</th>
            <td className="text-right py-2 break-words">{awayValue}</td>
            <td className="text-right py-2 break-words">{homeValue}</td>
          </tr>
        ))}</tbody>
      </table>
      <p className="text-[10px] leading-relaxed mb-3" style={{ color: faint }}>Outlook and NAV use current rosters and contracts with 2025–26 model inputs. They describe roster strength and contract value, not the probability of winning this game.</p>

      <div className="border p-3 mb-3" style={{ borderColor: rule, background: "var(--paper-inset)" }}>
        <h3 className="text-[11px] font-black mb-1">Game-day lines &amp; starting goalies</h3>
        <p className="text-[11px] leading-relaxed">Reported lines and starters are not available in this view yet. The team pages show a model depth chart; tonight&apos;s combinations, scratches and goalie choices can differ.</p>
        <a href={game.nhlUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-11 text-[11px] underline" style={{ color: "var(--ledger-red)" }}>NHL game centre ↗</a>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[game.away, game.home].map(team => (
          <Link key={team.id} href={`/teams/${team.abbrev.toLowerCase()}?${gameSelectionQuery(game)}`} className="inline-flex items-center justify-center min-h-11 border px-2 text-center text-[11px] font-black" style={{ borderColor: rule, color: "var(--ledger-red)" }}>
            {team.abbrev} team analytics →
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function TonightsGames({ teams = [], matchupId = null, onMatchupChange, homeStrip = false }: {
  teams?: MatchupTeamOutlook[];
  matchupId?: number | null;
  onMatchupChange?: (id: number | null) => void;
  homeStrip?: boolean;
}) {
  const [board, setBoard] = useState<NhlGamesBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true, inFlight = false;
    const controller = new AbortController();
    const load = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/nhl/games", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("The NHL game schedule is temporarily unavailable.");
        const next: NhlGamesBoard = await response.json();
        if (alive) { setBoard(next); setError(null); }
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "The NHL game schedule is temporarily unavailable.");
      } finally { inFlight = false; }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 60_000);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [retry]);

  const selected = board?.games.find(g => g.id === matchupId);
  const dateLabel = board ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${board.date}T12:00:00Z`)) : "Today";

  return (
    <div>
      <h2 className="text-[16px] font-black mb-1">Tonight&apos;s games</h2>
      <p className="text-[11px] mb-2" style={{ color: faint }}>{dateLabel} · NHL schedule day and start times in Eastern Time. Select a game to compare the teams.</p>
      {board && <p className="text-[10px] mb-3" style={{ color: faint }}>NHL game feed · Last successful update {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(board.retrievedAt))}. Refreshes every minute while this view is open.</p>}
      {error && <div role="alert" className="border p-3 mb-3" style={{ borderColor: rule }}>
        <p className="text-[11px]">{error}{board ? " Showing the last successful update; scores and status may have changed." : ""}</p>
        <button type="button" onClick={() => setRetry(n => n + 1)} className="min-h-11 text-[11px] underline">Try again</button>
      </div>}
      {!board && !error && <p role="status" className="text-[11px] py-6">Loading tonight&apos;s NHL games…</p>}
      {board?.games.length === 0 && <p role="status" className="border p-5 text-[11px]" style={{ borderColor: rule }}>No NHL games are scheduled for {dateLabel}.</p>}

      <div className={homeStrip ? "flex gap-3 overflow-x-auto pb-2" : "grid grid-cols-1 md:grid-cols-3 gap-3"}>
        {board?.games.map(game => {
          if (homeStrip) return <Link key={game.id} href={`/teams?view=games&game=${game.id}&${gameSelectionQuery(game)}`} className="block shrink-0 w-60 border p-3 text-left no-underline" style={{ borderColor: rule, background: "var(--paper-card)", color: ink }}><GameCardSummary game={game} selected={false} /></Link>;
          return (
            <button key={game.id} type="button" aria-expanded={game.id === selected?.id} aria-controls={game.id === selected?.id ? `matchup-${game.id}` : undefined}
              onClick={() => onMatchupChange?.(game.id === matchupId ? null : game.id)} className="border p-3 text-left min-h-11"
              style={{ borderColor: game.id === selected?.id ? "var(--ledger-red)" : rule, background: "var(--paper-card)", color: ink }}>
              <GameCardSummary game={game} selected={game.id === selected?.id} />
            </button>
          );
        })}
      </div>
      {board && matchupId && !selected && <p role="status" className="text-[11px] mt-3">That game is not on today&apos;s NHL slate. Select one of today&apos;s games above.</p>}
      {selected && <MatchupComparison game={selected} teams={teams} />}
    </div>
  );
}
