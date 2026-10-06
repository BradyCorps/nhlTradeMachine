"use client";

// ── NavLeagueScatter — league-context scatter ────────────────────
// Where a dossier player sits among same-position peers on two NAV
// contributions: offensive (x) and defensive (y), in NAV points. They are the
// OFF and DEF stage values from the player's X-NAV breakdown — not percentiles
// and not overall player ratings.
//
// Rendered with Recharts. The server page still computes every plotted value;
// this component only draws and filters. The cohort and the median reference
// lines never change with search or selection (see app/lib/league-scatter.ts).
//
// Keyboard and touch: there is deliberately no tab stop per point. Players are
// found with the search box (shared PlayerPicker), added up to three at a time,
// and read in an ordinary table; tapping a point also toggles it.

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import PlayerPicker from "@/app/components/PlayerPicker";
import type { ScatterPlotProps } from "@/app/components/NavLeagueScatterPlot";
import { HorizontalScrollCue } from "@/app/components/HorizontalScrollCue";
import {
  MAX_COMPARISONS, MIN_PLOTTED, SELECTED_STYLE, QUADRANT_LABEL, axisDomain, chartLabels, comparisonRows, leagueMedians, matchingIds,
  quadrantOf, signedDelta, signedNav, toggleComparison, type ScatterPeer,
} from "@/app/lib/league-scatter";

export type { ScatterPeer } from "@/app/lib/league-scatter";

interface Props {
  peers: ScatterPeer[];
  currentPlayer: ScatterPeer;
  playerName: string;
  /** Names the exact cohort the cloud is drawn from (e.g. "forwards · ≥20 GP ·
   *  2025-26"), so the reader knows who these dots are, not just "peers". */
  cohortLabel?: string;
}

const MONO = "'Courier Prime', monospace";
const INK = "var(--ledger-ink, #1a1a18)";
const FAINT = "var(--ledger-ink-faint)";
const RULE = "var(--ledger-rule)";
const CURRENT_COLOR = "var(--ledger-red, #b83020)";

// Recharts is ~350 KiB of JS. The chart is loaded after hydration, in its own chunk, behind a
// placeholder of the same height so nothing shifts; every value is also in the tables below.
const ScatterPlot = dynamic<ScatterPlotProps>(() => import("@/app/components/NavLeagueScatterPlot"), {
  ssr: false,
  loading: () => (
    <div role="status" className="flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.14em]"
      style={{ width: "100%", height: "clamp(300px, 56vw, 420px)", color: FAINT }}>
      Loading chart… exact values are in the tables below.
    </div>
  ),
});

type Datum = ScatterPeer & { shortName: string };
const lastName = (p: ScatterPeer): string => p.name.split(" ").slice(-1)[0];

export default function NavLeagueScatter({ peers, currentPlayer, playerName, cohortLabel }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  // The cohort. Nothing below this block may add to, remove from or reorder it.
  const all = useMemo(() => [currentPlayer, ...peers], [currentPlayer, peers]);
  const cohortIds = useMemo(() => new Set(all.map(p => p.id)), [all]);
  const med = useMemo(() => leagueMedians(all), [all]);
  const xDomain = useMemo(() => axisDomain(all.map(p => p.off), 20), [all]);
  const yDomain = useMemo(() => axisDomain(all.map(p => p.def), 10), [all]);

  const byId = useMemo(() => new Map(all.map(p => [p.id, p])), [all]);
  const selected = useMemo(
    () => selectedIds.map(id => byId.get(id)).filter((p): p is ScatterPeer => p != null),
    [selectedIds, byId],
  );
  const matches = useMemo(() => matchingIds(peers, query), [peers, query]);
  const playerQuadrant = quadrantOf(currentPlayer, med);

  // Only the dossier player and the selection are labelled; disambiguate shared last names among them.
  const labels = chartLabels([currentPlayer, ...selected]);
  const toDatum = (p: ScatterPeer): Datum => ({ ...p, shortName: labels.get(p.id) ?? lastName(p) });
  const selectedSet = new Set(selectedIds);
  const background = useMemo(
    () => peers.filter(p => !selectedSet.has(p.id) && !matches.has(p.id)).map(toDatum),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [peers, selectedIds, matches],
  );
  const highlighted = useMemo(
    () => peers.filter(p => !selectedSet.has(p.id) && matches.has(p.id)).map(toDatum),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [peers, selectedIds, matches],
  );
  const options = useMemo(
    () => peers.filter(p => !selectedSet.has(p.id)).map(p => ({ id: p.id, name: p.name, position: "", teamId: p.teamId }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [peers, selectedIds],
  );
  const rows = useMemo(() => comparisonRows(currentPlayer, selected), [currentPlayer, selected]);
  const tablePlayers = useMemo(
    () => [...all].sort((a, b) => b.nav - a.nav || a.name.localeCompare(b.name)),
    [all],
  );

  // Too few peers to place a meaningful league cloud. Guarded AFTER every hook
  // so hook order stays constant across renders (rules-of-hooks).
  if (all.length < MIN_PLOTTED) return null;

  const apply = (id: string) => {
    const r = toggleComparison(selectedIds, id, currentPlayer.id, cohortIds);
    setSelectedIds(r.next);
    const name = byId.get(id)?.name ?? "player";
    setNotice(
      r.change === "added" ? `${name} added to the comparison.`
        : r.change === "removed" ? `${name} removed from the comparison.`
        : r.change === "rejected" && r.reason === "full" ? `At most ${MAX_COMPARISONS} comparison players. Remove one first.`
        : "");
  };
  const clickPoint = (d: unknown) => {
    const datum = (d as { id?: string; payload?: { id?: string } } | null);
    const id = datum?.id ?? datum?.payload?.id;
    if (id) apply(id);
  };
  const reset = () => { setSelectedIds([]); setNotice("Comparisons cleared."); };
  const full = selectedIds.length >= MAX_COMPARISONS;

  const figureDescription =
    `Scatter plot of offensive contribution (horizontal) against defensive contribution (vertical), both in NAV points, for ${playerName} and ${peers.length} same-position peers. ` +
    `Dashed lines mark the cohort medians, offence ${Math.round(med.off)} and defence ${Math.round(med.def)}. ` +
    `${playerName} is in the "${QUADRANT_LABEL[playerQuadrant]}" quadrant. ` +
    `${selected.length} comparison ${selected.length === 1 ? "player" : "players"} selected. The tables below list the exact values.`;

  return (
    <section aria-label="League context" className="nls border p-4 mb-4"
      style={{ borderColor: RULE, background: "var(--paper-card, var(--paper-inset))" }}>
      <style>{`
        /* Recharts layers take focus when a point is clicked and show a heavy browser
           outline around the whole plot. They are not keyboard stops (see header), so
           this removes no real focus indicator. */
        .nls .recharts-surface g:focus, .nls .recharts-surface g:focus-visible, .nls .recharts-wrapper:focus, .nls .recharts-wrapper:focus-visible { outline: none; }
        /* In-chart quadrant text collides below this width; the caption says it in words. */
        @media (max-width: 479px) { .nls .nls-quad { display: none; } }
      `}</style>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-0.5">
        <h3 className="font-mono text-[10px] sm:text-[11px] font-black uppercase tracking-[0.12em] sm:tracking-[0.18em]" style={{ color: FAINT }}>
          League Context
        </h3>
        <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.12em]" style={{ color: FAINT }}>
          {all.length} plotted
        </span>
      </div>
      <p className="mb-1 font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.12em]" style={{ color: FAINT }}>
        Ranked among {cohortLabel ?? "same-position peers"}
      </p>
      <p className="mb-3 font-mono text-[10px] leading-relaxed" style={{ color: "var(--ledger-ink-body, var(--ledger-ink))" }}>
        Both axes are <strong>contributions to X-NAV, in NAV points</strong> (the OFF and DEF rows of the value breakdown).
        They are not percentiles and not overall player ratings.
      </p>

      {/* Search and selection */}
      <div className="mb-3 flex flex-wrap items-start gap-x-4 gap-y-2">
        <PlayerPicker
          label={`Add up to ${MAX_COMPARISONS} comparison players`}
          options={options}
          value=""
          onChange={id => { if (id) apply(id); }}
          onQueryChange={setQuery}
          disabled={full}
          placeholder={full ? `${MAX_COMPARISONS} selected` : "Search by name or team"}
          rule={full ? `Limit reached: remove a player to add another.` : "Matches are highlighted on the chart."}
          hideCount
        />
        <div className="flex-1 min-w-[180px]">
          <div className="text-[9px] font-black font-mono uppercase tracking-[0.14em] mb-1" style={{ color: FAINT }}>
            Comparing ({selected.length}/{MAX_COMPARISONS})
          </div>
          <ul className="flex flex-wrap gap-1.5" aria-label="Selected comparison players">
            {selected.length === 0 && <li className="font-mono text-[10px]" style={{ color: FAINT }}>None selected.</li>}
            {selected.map((p, i) => (
              <li key={p.id}>
                <button type="button" onClick={() => apply(p.id)}
                  aria-label={`Remove ${p.name} from the comparison`}
                  className="font-mono text-[11px] font-bold px-2 border inline-flex items-center gap-1.5"
                  style={{ minHeight: 44, borderColor: SELECTED_STYLE[i].color, color: INK, background: "var(--paper-bg)" }}>
                  <span aria-hidden="true" style={{ color: SELECTED_STYLE[i].color }}>{SELECTED_STYLE[i].glyph}</span>
                  {p.name}
                  <span aria-hidden="true" style={{ color: FAINT }}>✕</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={reset} disabled={selected.length === 0}
            className="mt-1 font-mono text-[10px] font-black uppercase tracking-[0.12em] underline px-1"
            style={{ minHeight: 44, color: selected.length ? INK : FAINT, background: "transparent", border: 0, cursor: selected.length ? "pointer" : "default" }}>
            Reset comparisons
          </button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="mb-1 font-mono text-[10px] min-h-[1.2em]" style={{ color: FAINT }}>
        {notice || (query.trim() ? `${matches.size} ${matches.size === 1 ? "player matches" : "players match"} “${query.trim()}” and ${matches.size === 1 ? "is" : "are"} highlighted. The cohort and medians are unchanged.` : "")}
      </p>

      {/* The chart. No tab stop per point; see header comment. */}
      <figure role="group" aria-label={figureDescription} className="m-0">
        <ScatterPlot
          xDomain={xDomain} yDomain={yDomain} med={med}
          background={background} highlighted={highlighted} selected={selected.map(toDatum)}
          current={toDatum(currentPlayer)} playerName={playerName} onPointClick={clickPoint}
        />
        <figcaption className="mt-1 font-mono text-[9px] leading-relaxed" style={{ color: FAINT }}>
          Dashed lines are the medians of all {all.length} plotted players (offence {Math.round(med.off)}, defence {Math.round(med.def)}); they do not
          change with search or selection. Right of the vertical line is above the median on offence; above the horizontal line is above the median on defence. <span className="sm:hidden">Tap a faint point to add it.</span>
          <span className="hidden sm:inline">Click a faint point to add it.</span> Selected players are the only ones labelled.
        </figcaption>
      </figure>

      {/* Exact values for the dossier player and the selection. */}
      <div className="mt-3 overflow-x-auto" role="region" aria-label="Selected players: exact contributions" tabIndex={0}>
        <table className="w-full font-mono" style={{ borderCollapse: "collapse" }}>
          <caption className="text-left text-[9px] font-black uppercase tracking-[0.12em] pb-1" style={{ color: FAINT }}>
            Exact contributions, NAV points
          </caption>
          <thead>
            <tr style={{ borderBottom: `1px solid ${RULE}` }}>
              <th scope="col" className="px-2 py-1 text-left text-[9px] font-black uppercase" style={{ color: FAINT }}>Player</th>
              <th scope="col" className="px-2 py-1 text-right text-[9px] font-black uppercase" style={{ color: FAINT }}>
                <abbr title="Offensive contribution to NAV" style={{ textDecoration: "none" }}>OFF</abbr>
              </th>
              <th scope="col" className="px-2 py-1 text-right text-[9px] font-black uppercase" style={{ color: FAINT }}>
                <abbr title="Defensive contribution to NAV" style={{ textDecoration: "none" }}>DEF</abbr>
              </th>
              <th scope="col" className="px-2 py-1 text-right text-[9px] font-black uppercase" style={{ color: FAINT }}>NAV</th>
</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${RULE}` }}>
                <th scope="row" className="px-2 py-1 text-left text-[11px] font-bold" style={{ color: r.isCurrent ? CURRENT_COLOR : INK }}>
                  {!r.isCurrent && <span aria-hidden="true" style={{ color: SELECTED_STYLE[i - 1].color }}>{SELECTED_STYLE[i - 1].glyph} </span>}
                  {r.name}{r.isCurrent ? " · this player" : ""}
                  <span className="block text-[9px] font-normal" style={{ color: FAINT }}>
                    {r.teamId}
                    {r.vs && <> · vs {lastName(currentPlayer)}: OFF {signedDelta(r.vs.off)} · DEF {signedDelta(r.vs.def)} · NAV {signedDelta(r.vs.nav)}</>}
                  </span>
                </th>
                <td className="px-2 py-1 text-right text-[11px] tabular-nums">{Math.round(r.off)}</td>
                <td className="px-2 py-1 text-right text-[11px] tabular-nums">{Math.round(r.def)}</td>
                <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">{signedNav(r.nav)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-3 border-t pt-1" style={{ borderColor: RULE }}>
        <summary className="flex min-h-11 cursor-pointer items-center font-mono text-[9px] font-black uppercase tracking-[0.12em]" style={{ color: FAINT }}>
          Compare all plotted players in a table
        </summary>
        <p className="mb-1 font-mono text-[10px]" style={{ color: FAINT }}>
          Read-only. Add a player to the comparison with the search box above.
        </p>
        <HorizontalScrollCue label="Swipe or scroll for all comparison columns" />
        <div className="overflow-x-auto" role="region" aria-label="League context player table" tabIndex={0} style={{ maxHeight: 360, overflowY: "auto" }}>
          <table className="w-full font-mono" style={{ borderCollapse: "collapse", minWidth: 420 }}>
            <caption className="sr-only">
              Offensive and defensive contribution to NAV, and NAV, for {playerName} and {peers.length} same-position peers
            </caption>
            <thead>
              <tr style={{ borderBottom: `1px solid ${RULE}` }}>
                {([["Player", "left"], ["Team", "left"], ["OFF", "right"], ["DEF", "right"], ["NAV", "right"]] as const).map(([label, align]) => (
                  <th key={label} scope="col" className="px-2 py-2 text-[9px] font-black uppercase tracking-[0.1em]" style={{ color: FAINT, textAlign: align }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tablePlayers.map(p => {
                const isCurrent = p.id === currentPlayer.id;
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${RULE}`, background: selectedSet.has(p.id) ? "var(--paper-inset)" : "transparent" }}>
                    <th scope="row" className="px-2 py-1 text-left text-[10px] font-bold" style={{ color: isCurrent ? CURRENT_COLOR : INK }}>
                      {p.name}{isCurrent ? " · this player" : ""}{selectedSet.has(p.id) ? " · selected" : ""}
                    </th>
                    <td className="px-2 py-1 text-left text-[10px]" style={{ color: FAINT }}>{p.teamId}</td>
                    <td className="px-2 py-1 text-right text-[10px] tabular-nums">{Math.round(p.off)}</td>
                    <td className="px-2 py-1 text-right text-[10px] tabular-nums">{Math.round(p.def)}</td>
                    <td className="px-2 py-1 text-right text-[10px] font-bold tabular-nums">{signedNav(p.nav)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
