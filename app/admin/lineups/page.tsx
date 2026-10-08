"use client";

import { useEffect, useState } from "react";
import { TEAMS_DB } from "@/app/lib/db";
import { DEFAULT_OBSERVED_SELECTION, observedQuery, type ObservedSelection } from "@/app/lib/observed-season";
import { nhlToday } from "@/app/lib/nhl-games";
import { emptyManualLineup, type LineupPlayer, type ManualLineupInput, type ManualTeamLineup } from "@/app/lib/manual-team-lineups";
import { adminErrorMessage, readAdminResponse } from "../admin-response";

interface Loaded { query: string; lineup: ManualTeamLineup | null; players: LineupPlayer[] }
const field = "block min-h-11 w-full min-w-0 border px-2 text-[12px] bg-transparent";

export default function AdminLineups() {
  const [teamId, setTeamId] = useState("WPG");
  const [selection, setSelection] = useState<ObservedSelection>(DEFAULT_OBSERVED_SELECTION);
  const [loadedState, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<ManualLineupInput>(() => emptyManualLineup("WPG", DEFAULT_OBSERVED_SELECTION, nhlToday()));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const query = `team=${teamId}&${observedQuery(selection)}`;

  const loaded = loadedState?.query === query ? loadedState : null;

  useEffect(() => {
    const controller = new AbortController();
    setLoaded(null); setError(""); setMessage(""); setDirty(false);
    fetch(`/api/admin/team-lineups?${query}`, { cache: "no-store", signal: controller.signal })
      .then(response => readAdminResponse<Omit<Loaded, "query">>(response, "Could not load lineup"))
      .then(data => {
        if (controller.signal.aborted) return;
        setLoaded({ ...data, query });
        const saved = data.lineup;
        setDraft(saved ? { teamId: saved.teamId, season: saved.season, gameType: saved.gameType, asOfDate: saved.asOfDate,
          source: saved.source, sourceUrl: saved.sourceUrl, forwards: saved.forwards, defense: saved.defense, goalies: saved.goalies, scratches: saved.scratches }
          : emptyManualLineup(teamId, selection, nhlToday()));
      }).catch(e => { if (!controller.signal.aborted) setError(adminErrorMessage(e, "Could not load lineup")); });
    return () => controller.abort();
  }, [query, teamId, selection, reload]);

  const edit = (next: ManualLineupInput) => { setDraft(next); setDirty(true); setMessage(""); };
  const write = async (remove = false) => {
    if (!loaded) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/team-lineups", { method: remove ? "DELETE" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remove ? { teamId, ...selection, expectedRevision: loaded.lineup?.revision }
          : { lineup: draft, expectedRevision: loaded.lineup?.revision ?? null }) });
      const data = await readAdminResponse<{ lineup: ManualTeamLineup | null }>(response, "Could not save lineup");
      setLoaded({ ...loaded, lineup: data.lineup }); setDirty(false);
      if (remove) setDraft(emptyManualLineup(teamId, selection, nhlToday()));
      setMessage(remove ? "Manual lineup removed. The public page uses the model depth chart." : "Projected lineup saved. The public page refreshes within one minute; reload to see it immediately.");
    } catch (e) { setError(adminErrorMessage(e, "Could not save lineup")); }
    finally { setBusy(false); }
  };

  const picker = (label: string, value: string | null, positions: string[], change: (value: string | null) => void) => <label className="block min-w-0 text-[11px]" key={label}>
    {label}<select className={field} value={value ?? ""} onChange={e => change(e.target.value || null)} disabled={!loaded || busy}>
      <option value="">Unfilled</option>
      {loaded?.players.filter(p => positions.includes(p.position)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      {value && !loaded?.players.some(p => p.id === value) && <option value={value}>Unavailable player — clear or replace</option>}
    </select>
  </label>;

  return <main className="admin-page p-4 sm:p-8 max-w-4xl" style={{ color: "var(--ledger-ink)", background: "var(--paper)" }}>
    <h1 className="text-xl font-black mb-3">Team projected lineups</h1>
    <p className="text-[12px] mb-4">Arrange each team from lineup news. Saved lineups stay visible until updated, with their as-of date shown. The model remains available separately. Roster membership and statistics are managed independently.</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
      <label className="text-[12px]">Team<select className={field} value={teamId} disabled={busy || dirty} onChange={e => setTeamId(e.target.value)}>{TEAMS_DB.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="text-[12px]">Competition<select className={field} value={selection.gameType} disabled={busy || dirty} onChange={e => setSelection({ ...selection, gameType: Number(e.target.value) as 2 | 3 })}><option value={2}>Regular season</option><option value={3}>Playoffs</option></select></label>
    </div>
    <p className="text-[11px] mb-3">Season {selection.season.slice(0, 4)}–{selection.season.slice(6)}. Add missing players or change roster exclusions in <a className="underline" href="/admin/contracts">Contracts</a>, then reload this editor.</p>
    {error && <p role="alert" className="text-[12px] my-3">{error}</p>}
    {message && <p role="status" className="text-[12px] my-3">{message}</p>}
    {!loaded && !error && <p role="status">Loading roster and lineup…</p>}
    <button type="button" className="min-h-11 border px-3 text-[12px] mb-3" disabled={busy} onClick={() => setReload(n => n + 1)}>{dirty ? "Discard changes and reload" : "Reload roster and lineup"}</button>
    {loaded && <>
      {dirty && <p className="text-[11px] mb-3">Save or discard changes before changing teams.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <label className="text-[12px]">As-of date<input className={field} type="date" value={draft.asOfDate} disabled={busy} onChange={e => edit({ ...draft, asOfDate: e.target.value })} /></label>
        <label className="text-[12px]">Source or reporter (optional)<input className={field} maxLength={160} value={draft.source} disabled={busy} onChange={e => edit({ ...draft, source: e.target.value })} /></label>
        <label className="text-[12px] sm:col-span-2">Source link (optional)<input className={field} type="url" maxLength={1000} value={draft.sourceUrl} disabled={busy} onChange={e => edit({ ...draft, sourceUrl: e.target.value })} /></label>
      </div>
      <h2 className="font-black text-sm">Forwards</h2>
      {draft.forwards.map((line, i) => <div className="grid grid-cols-3 gap-2 my-3" key={i}>{line.map((id, j) => picker(`Line ${i + 1} ${["LW", "C", "RW"][j]}`, id, ["C", "W", "L", "R"], value => edit({ ...draft, forwards: draft.forwards.map((row, n) => n === i ? row.map((p, k) => k === j ? value : p) : row) })))}</div>)}
      <h2 className="font-black text-sm mt-4">Defence</h2>
      {draft.defense.map((pair, i) => <div className="grid grid-cols-2 gap-2 my-3" key={i}>{pair.map((id, j) => picker(`Pair ${i + 1} ${j === 0 ? "left" : "right"}`, id, ["D"], value => edit({ ...draft, defense: draft.defense.map((row, n) => n === i ? row.map((p, k) => k === j ? value : p) : row) })))}</div>)}
      <h2 className="font-black text-sm mt-4">Goalie order · starter unconfirmed</h2>
      <div className="grid grid-cols-2 gap-2 my-3">{draft.goalies.map((id, i) => picker(`Goalie ${i + 1}`, id, ["G"], value => edit({ ...draft, goalies: draft.goalies.map((p, j) => j === i ? value : p) })))}</div>
      <label className="block text-[12px] my-4">Reported scratches (optional; select multiple)
        <select multiple size={5} className={field} value={draft.scratches} disabled={busy} onChange={e => edit({ ...draft, scratches: Array.from(e.target.selectedOptions, o => o.value) })}>{loaded.players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}{draft.scratches.filter(id => !loaded.players.some(p => p.id === id)).map(id => <option key={id} value={id}>Unavailable player — deselect</option>)}</select>
      </label>
      <div className="flex flex-wrap gap-3 mt-4">
        <button type="button" className="min-h-11 border px-4 font-bold text-[12px]" disabled={busy || !dirty} onClick={() => void write()}>Save projected lineup</button>
        <button type="button" className="min-h-11 border px-4 text-[12px]" disabled={busy || !loaded.lineup} onClick={() => void write(true)}>Remove manual lineup</button>
        <a className="min-h-11 flex items-center underline text-[12px]" href={`/teams/${teamId.toLowerCase()}?${observedQuery(selection)}`} target="_blank" rel="noopener noreferrer">View public team page</a>
      </div>
    </>}
  </main>;
}
