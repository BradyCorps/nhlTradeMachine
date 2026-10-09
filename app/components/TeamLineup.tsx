"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { observedQuery, observedLabel, type ObservedSelection, type ObservedStats } from "@/app/lib/observed-season";
import { seasonStat } from "@/app/lib/team-season-stats";
import { storedManualLineupSchema, type LineupPlayer, type ManualTeamLineup } from "@/app/lib/manual-team-lineups";

export default function TeamLineup({ teamId, selection, roster, children, compact = false, stats }: {
  teamId: string; selection: ObservedSelection; roster: LineupPlayer[]; children: ReactNode;
  compact?: boolean; stats?: Record<string, ObservedStats>;
}) {
  const query = `team=${teamId}&${observedQuery(selection)}`;
  const [state, setState] = useState<{ query: string; lineup: ManualTeamLineup | null; failed: boolean }>({ query: "", lineup: null, failed: false });
  const [model, setModel] = useState(false);
  useEffect(() => {
    let controller: AbortController | undefined;
    let active = true;
    setModel(false);
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        const response = await fetch(`/api/team-lineups?${query}`, { cache: "no-store", signal });
        const body = await response.json();
        if (!response.ok) throw new Error();
        const lineup = body.lineup === null ? null : storedManualLineupSchema.parse(body.lineup);
        if (lineup && (lineup.teamId !== teamId || lineup.season !== selection.season || lineup.gameType !== selection.gameType)) throw new Error();
        if (active && !signal.aborted) setState({ query, lineup, failed: false });
      } catch {
        if (active && !signal.aborted) setState(previous => ({ query, lineup: previous.query === query ? previous.lineup : null, failed: true }));
      }
    };
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; controller?.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [query, teamId, selection.season, selection.gameType]);

  const current = state.query === query ? state : { lineup: null, failed: false };
  const lineup = current.lineup;
  const players = new Map(roster.filter(p => p.teamId === teamId).map(p => [String(p.id), p]));
  const entries = lineup ? [...lineup.forwards.flat(), ...lineup.defense.flat(), ...lineup.goalies, ...lineup.scratches] : [];
  const needsReview = entries.some(id => id !== null && !players.has(id));
  const playerLink = (id: string | null) => {
    if (id === null) return <span className="text-[11px]">Unfilled</span>;
    const player = players.get(id);
    const row = stats?.[id];
    const observed = row?.season === selection.season && row.gameType === selection.gameType && (row.coverage === "available" || row.coverage === "zero-games") ? row : undefined;
    return player ? <div><Link className="min-h-11 flex items-center text-[11px] font-bold underline" href={`/players/${encodeURIComponent(id)}?${observedQuery(selection)}`}>{player.name}</Link>
      {stats && <p className="text-[10px] tabular-nums" style={{ color: "var(--ledger-ink-faint)" }}>{observed ? player.position === "G"
        ? `${seasonStat(observed.games)} GP · ${seasonStat(observed.savePct, 3)} SV% · ${seasonStat(observed.gaa, 2)} GAA`
        : <><span className="sm:hidden">{seasonStat(observed.games)} GP · {seasonStat(observed.points)} PTS</span><span className="hidden sm:inline">{seasonStat(observed.games)} GP · {seasonStat(observed.goals)} G · {seasonStat(observed.assists)} A · {seasonStat(observed.points)} PTS</span></>
        : "Stats unavailable"}</p>}
      </div>
      : <span className="text-[11px]">Unavailable — roster changed</span>;
  };

  return <div>
    {current.failed && <p role="alert" className="text-[11px] mb-2">{lineup ? "Manual lineup refresh failed; showing the last loaded version." : "Manual lineup unavailable. The model depth chart is shown below."}</p>}
    {lineup && <div className="flex flex-wrap gap-2 mb-3">
      <button type="button" aria-pressed={!model} className="min-h-11 border px-3 text-[11px]" onClick={() => setModel(false)}>Projected lineup</button>
      <button type="button" aria-pressed={model} className="min-h-11 border px-3 text-[11px]" onClick={() => setModel(true)}>Model depth chart</button>
    </div>}
    {lineup && !model ? <section aria-label="Manual projected lineup">
      <h3 className="text-[13px] font-black">Manual projected lineup</h3>
      <p className="text-[11px] my-2">As of {lineup.asOfDate} · Updated {new Date(lineup.updatedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} Eastern. Kept until updated; not a confirmed game lineup or starter announcement.</p>
      {(lineup.source || lineup.sourceUrl) && <p className="text-[11px] mb-2">Source: {lineup.sourceUrl ? <a className="underline break-words" href={lineup.sourceUrl} target="_blank" rel="noopener noreferrer">{lineup.source || "Lineup report"}</a> : lineup.source}</p>}
      {needsReview && <p role="alert" className="text-[11px] mb-2">This lineup needs review: a selected player is no longer in the current assigned roster.</p>}
      {stats && <p className="text-[10px] mb-3">Player stats: {observedLabel(selection)} · NHL season totals across teams.</p>}
      <div className={compact ? "grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4" : ""}>
      <div className="min-w-0">
      <h4 className="text-[11px] font-black">Forwards · LW / C / RW</h4>
      {lineup.forwards.map((line, i) => <div key={i} className="my-2"><p className="text-[10px]">Line {i + 1}</p><div className="grid grid-cols-3 gap-2">{line.map((id, j) => <div key={j} className="min-w-0">{playerLink(id)}</div>)}</div></div>)}
      </div>
      <div className="min-w-0">
      <h4 className={`text-[11px] font-black ${compact ? "" : "mt-3"}`}>Defence</h4>
      {lineup.defense.map((pair, i) => <div key={i} className="my-2"><p className="text-[10px]">Pair {i + 1}</p><div className="grid grid-cols-2 gap-2">{pair.map((id, j) => <div key={j} className="min-w-0">{playerLink(id)}</div>)}</div></div>)}
      <h4 className="text-[11px] font-black mt-3">Goalie order · starter unconfirmed</h4>
      <div className={compact ? "grid grid-cols-2 gap-2" : ""}>{lineup.goalies.map((id, i) => <div key={i} className="flex items-center gap-2"><span className="text-[10px]">{i + 1}.</span>{playerLink(id)}</div>)}</div>
      </div>
      </div>
      {!!lineup.scratches.length && <><h4 className="text-[11px] font-black mt-3">Reported scratches</h4><ul>{lineup.scratches.map(id => <li key={id}>{playerLink(id)}</li>)}</ul></>}
    </section> : children}
  </div>;
}
