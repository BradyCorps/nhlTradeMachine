"use client";
// ── Roster tab (RL2) ─────────────────────────────────────────────
//
// The roster listing used to live inside Season Results under "Team Numbers",
// which meant you could only read your own roster *after* simulating a season.
// It sits ahead of Lineups now, because you read a roster before you set lines.
//
// The first version of this tab was one flat table with a two-line badge block
// under every name, and it was tall and thin — a screenful showed eight
// players and told you their points. It reads like a roster page now: three
// tables (forwards, defence, goaltenders) with subtotals, one line per player,
// sortable headings, and the columns a GM actually opens the tab for. Goalies
// get goalie columns instead of three zeroes where the scoring goes.
//
// The grouping, column sets and sort are all in `app/lib/roster-table.ts` so
// they can be tested; this file draws them and owns nothing but state.
//
// Rows expand into the SAME analytics the offseason screens use —
// `ExpandedStats` from OFF4 — rather than a second implementation that would
// drift from it. Outlook is composed alongside rather than pushed into that
// shared component: this is a GM surface, so it wants the analytics-desk read
// (PA12) the same way RL3 chose it for the trade card, but the offseason
// screens should not silently change shape because the roster tab wanted a
// panel.

import React, { useMemo, useState } from "react";
import type { Asset, Team, XNAVResult } from "@/app/lib/trade-types";
import { displayPosition } from "@/app/lib/display-position";
import { ExpandedStats, ZERO_XNAV } from "@/app/components/OffseasonPlayerAnalytics";
import { PlayerOutlook } from "@/app/components/PlayerOutlook";
import { PlayerAvatar } from "@/app/components/PlayerAvatar";
import { AssetBadges } from "@/app/components/AssetBadges";
import {
  buildRosterRows, projectedSeasonIndex, rosterTotals, simTeamFor,
  type RosterRow,
} from "@/app/lib/roster-view";
import {
  ariaSortFor, clauseLabel, columnsFor, groupRosterRows, nextSort, sortRosterRows,
  unitTotals, type RosterColumn, type RosterSort, type RosterUnit,
} from "@/app/lib/roster-table";
import { teamLeadership, letterFor } from "@/app/lib/team-leadership";
import { lineupContributionScore } from "@/app/lib/lineup-ranking";
import { SEASON } from "@/app/lib/season-config";

const MONO = "var(--font-mono, 'Courier Prime', monospace)";

function navColor(nav: number | null): string {
  if (nav == null) return "var(--ledger-ink-faint)";
  if (nav >= 150) return "var(--ledger-green)";
  if (nav < 0) return "var(--ledger-red)";
  return "var(--ledger-ink)";
}

/** Ink for a term cell: an expiring deal is the one worth noticing. */
function termColor(asset: Asset): string {
  if (asset.pendingExtension) return "var(--ledger-green)";
  if (asset.expiresThisOffseason) return "var(--ledger-amber)";
  return "var(--ledger-ink-faint)";
}

const cellPad = "py-1 px-1.5";

// ── One unit's table ─────────────────────────────────────────────

function UnitTable({
  unit, label, rows, navMap, leadership, openId, setOpenId,
}: {
  unit: RosterUnit;
  label: string;
  rows: RosterRow[];
  navMap: Record<string, XNAVResult>;
  leadership: ReturnType<typeof teamLeadership>;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const columns = columnsFor(unit);
  const [sort, setSort] = useState<RosterSort | null>(null);
  const ordered = useMemo(() => sortRosterRows(rows, sort, columns), [rows, sort, columns]);
  const totals = useMemo(() => unitTotals(rows), [rows]);

  // The rank number is the reading order, not a property of the player — it
  // renumbers with the sort rather than following a row around.
  const headingId = `roster-unit-${unit}`;

  return (
    <div className="mt-2">
      <div
        className="flex items-baseline justify-between gap-2 flex-wrap py-0.5 px-1.5"
        style={{ background: "var(--ledger-cream)", borderTop: "1px solid var(--ledger-rule)" }}>
        <h4 id={headingId} className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: "var(--ledger-ink)" }}>
          {label} <span style={{ color: "var(--ledger-ink-faint)" }}>({totals.players})</span>
        </h4>
        <p className="text-[10px] tabular-nums" style={{ color: "var(--ledger-ink-faint)" }}>
          {unit !== "G" && <>{totals.points} PTS · </>}
          {totals.avgAge != null && <>avg {totals.avgAge} · </>}
          ${totals.capHit.toFixed(1)}M
        </p>
      </div>

      <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 620 }} aria-labelledby={headingId}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--ledger-rule)" }}>
            <th scope="col" className={`text-[9px] ${cellPad}`} style={{ width: 22, color: "var(--ledger-ink-faint)" }}>
              <span className="sr-only">Order</span>
            </th>
            {columns.map(col => (
              <SortableHeading
                key={col.key}
                column={col}
                sort={sort}
                onPick={() => setSort(current => nextSort(current, col))}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map((row, i) => {
            const p = row.asset;
            const nav = navMap?.[p.id] ?? ZERO_XNAV;
            const open = openId === p.id;

            return (
              <React.Fragment key={p.id}>
                <tr style={{ background: i % 2 === 0 ? "transparent" : "var(--ledger-cream)" }}>
                  <td className={`text-[9px] ${cellPad} tabular-nums text-right`} style={{ color: "var(--ledger-ink-faint)" }}>
                    {i + 1}
                  </td>
                  {columns.map(col => (
                    <Cell
                      key={col.key}
                      column={col}
                      row={row}
                      nav={nav}
                      letter={letterFor(p.name, leadership)}
                      open={open}
                      onToggle={() => setOpenId(open ? null : p.id)}
                    />
                  ))}
                </tr>

                {open && (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-1.5 pb-2">
                      {/* The full badge ledger lives here now — awards, injury
                          risk, scenery — where there is room for two lines. */}
                      <AssetBadges asset={p} xnav={nav} />
                      <ExpandedStats p={p} nav={nav} />
                      {p.developmentProfile && (
                        <div className="mt-1.5">
                          <PlayerOutlook asset={p} />
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortableHeading({ column, sort, onPick }: {
  column: RosterColumn;
  sort: RosterSort | null;
  onPick: () => void;
}) {
  const active = sort?.key === column.key;
  return (
    <th
      scope="col"
      aria-sort={ariaSortFor(sort, column)}
      className={`text-[9px] uppercase tracking-wider ${cellPad}`}
      style={{ textAlign: column.align, fontWeight: 900 }}>
      <button
        type="button"
        onClick={onPick}
        title={column.title ? `${column.title} — click to sort` : "Click to sort"}
        className="dense-tap hover:underline"
        style={{
          color: active ? "var(--ledger-ink)" : "var(--ledger-ink-faint)",
          background: "none", border: "none", padding: 0, cursor: "pointer",
          font: "inherit", letterSpacing: "inherit", textTransform: "inherit",
        }}>
        {column.label}
        {/* The caret only appears on the sorted column, so the heading row
            stays quiet instead of showing twelve arrows. */}
        {active && <span aria-hidden="true">{sort!.direction === "asc" ? " ▲" : " ▼"}</span>}
      </button>
    </th>
  );
}

/**
 * One cell.
 *
 * Everything but the name column is text the column produced — the table never
 * re-derives a value the sort would then disagree with. The name column is the
 * exception because it is the row's control.
 */
function Cell({ column, row, nav, letter, open, onToggle }: {
  column: RosterColumn;
  row: RosterRow;
  nav: XNAVResult;
  letter: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  const p = row.asset;

  if (column.key === "name") {
    return (
      // A hard cap here is what makes `truncate` bite: without it the table
      // widens to the longest name and pushes the numbers off the screen.
      <td className={cellPad} style={{ maxWidth: 240 }}>
        <div className="flex items-center gap-1.5 min-w-0">
          <PlayerAvatar name={p.name} position={p.position} size={20}
            playerId={p.id} teamId={p.teamId} headshot={p.headshot} />
          <button
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} stats for ${p.name}`}
            className="dense-tap text-[11px] font-bold text-left hover:underline"
            style={{ color: "var(--ledger-ink)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            {p.name}
          </button>
          {letter && (
            <span
              title={letter === "C" ? "Captain" : "Alternate captain"}
              className="text-[8px] font-black shrink-0"
              style={{ border: "1px solid var(--ledger-ink-faint)", padding: "0 2px" }}>
              {letter}
            </span>
          )}
          {row.breakoutTag && (
            <span className="text-[8px] font-black shrink-0" style={{ color: "var(--ledger-green)" }}>
              {row.breakoutTag.replace("_", " ")}
            </span>
          )}
          <AssetBadges asset={p} xnav={nav} compact />
        </div>
      </td>
    );
  }

  if (column.key === "pos") {
    return (
      <td className={`text-[10px] ${cellPad}`} style={{ color: "var(--ledger-ink-faint)" }}>
        {displayPosition(p.position, p.secondaryPosition)}
      </td>
    );
  }

  if (column.key === "nav") {
    return (
      <td className={`text-[11px] ${cellPad} text-right tabular-nums font-black`} style={{ color: navColor(row.nav) }}>
        {column.format(row)}
      </td>
    );
  }

  if (column.key === "term") {
    const clause = clauseLabel(p);
    return (
      <td className={`text-[10px] ${cellPad} text-right tabular-nums`} style={{ color: termColor(p) }}>
        {column.format(row)}
        {clause && (
          <span className="ml-1 text-[8px] font-black" title={clause === "NMC" ? "No-movement clause" : "No-trade clause"}
            style={{ color: "var(--ledger-red)" }}>
            {clause}
          </span>
        )}
      </td>
    );
  }

  const emphasis = column.key === "pts";
  return (
    <td
      className={`${emphasis ? "text-[11px] font-black" : "text-[10px]"} ${cellPad} tabular-nums`}
      style={{
        textAlign: column.align,
        color: emphasis ? "var(--ledger-ink)" : "var(--ledger-ink-faint)",
      }}>
      {column.format(row)}
    </td>
  );
}

// ── One club ─────────────────────────────────────────────────────

function RosterTable({
  team, rows, navMap, simulated,
}: {
  team: Team;
  rows: RosterRow[];
  navMap: Record<string, XNAVResult>;
  simulated: boolean;
}) {
  // Held at club level: opening a forward closes an open goalie, so only one
  // analytics panel is ever pushing the tables apart.
  const [openId, setOpenId] = useState<string | null>(null);
  const totals = useMemo(() => rosterTotals(rows), [rows]);
  const groups = useMemo(() => groupRosterRows(rows), [rows]);
  const leadership = useMemo(
    () => teamLeadership(
      rows.map(r => r.asset),
      p => lineupContributionScore(p as any, navMap?.[p.id ?? ""]?.total),
    ),
    [rows, navMap],
  );

  return (
    <section className="overflow-x-auto" style={{ fontFamily: MONO }}>
      <header
        className="py-1 px-2"
        style={{ background: "var(--ledger-cream)", border: "1px solid var(--ledger-rule)" }}>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h3 className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "var(--ledger-ink)" }}>
            {team.name}
          </h3>
          <p className="text-[10px] tabular-nums" style={{ color: "var(--ledger-ink-faint)" }}>
            {/* Which numbers these are, stated rather than implied. The Roster
                tab and the Season Review both show points, and a reader who
                cannot tell them apart will believe one of them is wrong. */}
            <span
              className="font-black uppercase tracking-[0.1em]"
              title={simulated
                ? "What these players did in the season you simulated, carried forward as their current form."
                : "Last completed season, scaled to games played. Simulate a year and this becomes those results."}
              style={{ color: simulated ? "var(--ledger-green)" : "var(--ledger-ice)" }}>
              {simulated ? `${SEASON.label} results` : `${SEASON.replaySeason} baseline`}
            </span>
            {" · "}{totals.players} players · {totals.points} PTS · ${totals.capHit.toFixed(1)}M
          </p>
        </div>
      </header>

      {groups.map(g => (
        <UnitTable
          key={g.unit}
          unit={g.unit}
          label={g.label}
          rows={g.rows}
          navMap={navMap}
          leadership={leadership}
          openId={openId}
          setOpenId={setOpenId}
        />
      ))}

      {groups.length === 0 && (
        <p className="text-[11px] py-4 text-center" style={{ color: "var(--ledger-ink-faint)" }}>
          No players on this roster.
        </p>
      )}
    </section>
  );
}

export function RosterTab({
  teams, homeRoster, partnerRoster, navMap, simData,
}: {
  teams: [Team, Team];
  homeRoster: Asset[];
  partnerRoster: Asset[];
  navMap: Record<string, XNAVResult>;
  simData: unknown;
}) {
  const home = useMemo(() => {
    const idx = projectedSeasonIndex(simTeamFor(simData, teams[0]?.id));
    return { rows: buildRosterRows(homeRoster, navMap, idx), simulated: idx != null };
  }, [homeRoster, navMap, simData, teams]);

  const partner = useMemo(() => {
    const idx = projectedSeasonIndex(simTeamFor(simData, teams[1]?.id));
    return { rows: buildRosterRows(partnerRoster, navMap, idx), simulated: idx != null };
  }, [partnerRoster, navMap, simData, teams]);

  return (
    <div className="grid gap-3 px-2 py-2">
      {/* The Roster tab and Season Results answer different questions, and
          both of them show points. Naming the job here — and pointing at the
          other — stops the overlap reading as a contradiction. */}
      <p className="text-[10px] leading-relaxed" style={{ color: "var(--ledger-ink-faint)" }}>
        <span className="font-black uppercase tracking-[0.14em]" style={{ color: "var(--ledger-ink)" }}>
          Who you hold.
        </span>{" "}
        Click a heading to sort, a name to expand. For how a simulated season compared
        with expectation — ΔXP, NOIV, who beat their contract — see
        <span className="font-black"> Sim → Season Review</span>.
      </p>

      <RosterTable team={teams[0]} rows={home.rows} navMap={navMap} simulated={home.simulated} />
      {teams[1] && (
        <RosterTable team={teams[1]} rows={partner.rows} navMap={navMap} simulated={partner.simulated} />
      )}
    </div>
  );
}
