"use client";
// ── Roster tab (RL2) ─────────────────────────────────────────────
//
// The roster listing used to live inside Season Results under "Team Numbers",
// which meant you could only read your own roster *after* simulating a season.
// It sits ahead of Lineups now, because you read a roster before you set lines.
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
import { AssetBadges } from "@/app/components/AssetBadges";
import {
  buildRosterRows, projectedSeasonIndex, rosterTotals, simTeamFor,
  type RosterRow,
} from "@/app/lib/roster-view";
import { teamLeadership, letterFor } from "@/app/lib/team-leadership";
import { lineupContributionScore } from "@/app/lib/lineup-ranking";

const MONO = "var(--font-mono, 'Courier Prime', monospace)";

const COLUMNS = ["#", "Player", "Pos", "GP", "G", "A", "PTS", "TOI", "X-NAV", "CAP"] as const;

function navColor(nav: number | null): string {
  if (nav == null) return "var(--ledger-ink-faint)";
  if (nav >= 150) return "var(--ledger-green)";
  if (nav < 0) return "var(--ledger-red)";
  return "var(--ledger-ink)";
}

function RosterTable({
  team, rows, navMap, simulated,
}: {
  team: Team;
  rows: RosterRow[];
  navMap: Record<string, XNAVResult>;
  simulated: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const totals = useMemo(() => rosterTotals(rows), [rows]);
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
        className="flex items-baseline justify-between gap-3 flex-wrap py-1.5 px-2"
        style={{ background: "var(--ledger-cream)", border: "1px solid var(--ledger-rule)" }}>
        <h3 className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "var(--ledger-ink)" }}>
          {team.name}
        </h3>
        <p className="text-[10px]" style={{ color: "var(--ledger-ink-faint)" }}>
          {totals.players} skaters · {totals.goals}G · {totals.assists}A · {totals.points} PTS ·{" "}
          ${totals.capHit.toFixed(1)}M
          {" · "}
          <span style={{ color: simulated ? "var(--ledger-green)" : "var(--ledger-ink-faint)" }}>
            {simulated ? "Simulated season" : "Pre-season baseline"}
          </span>
        </p>
      </header>

      <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 620 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--ledger-rule)" }}>
            {COLUMNS.map((h, i) => (
              <th
                key={h}
                scope="col"
                className="text-[10px] uppercase tracking-wider py-1 px-1.5"
                style={{
                  color: "var(--ledger-ink-faint)",
                  textAlign: i <= 2 ? "left" : "right",
                  fontWeight: 900,
                }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const p = row.asset;
            const nav = navMap?.[p.id] ?? ZERO_XNAV;
            const open = openId === p.id;
            const letter = letterFor(p.name, leadership);

            return (
              <React.Fragment key={p.id}>
                <tr style={{ background: i % 2 === 0 ? "transparent" : "var(--ledger-cream)" }}>
                  <td className="text-[10px] py-1.5 px-1.5 tabular-nums" style={{ color: "var(--ledger-ink-faint)" }}>
                    {i + 1}
                  </td>
                  <td className="py-1.5 px-1.5">
                    <button
                      onClick={() => setOpenId(open ? null : p.id)}
                      aria-expanded={open}
                      aria-label={`${open ? "Collapse" : "Expand"} stats for ${p.name}`}
                      className="tap-target text-[12px] font-bold text-left hover:underline"
                      style={{ color: "var(--ledger-ink)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      {p.name}
                      {letter && (
                        <span
                          title={letter === "C" ? "Captain" : "Alternate captain"}
                          className="ml-1.5 text-[9px] font-black"
                          style={{ border: "1px solid var(--ledger-ink-faint)", padding: "0 3px" }}>
                          {letter}
                        </span>
                      )}
                      {row.breakoutTag && (
                        <span className="ml-1.5 text-[9px] font-black" style={{ color: "var(--ledger-green)" }}>
                          {row.breakoutTag.replace("_", " ")}
                        </span>
                      )}
                    </button>
                    <div className="mt-0.5">
                      <AssetBadges asset={p} xnav={nav} />
                    </div>
                  </td>
                  <td className="text-[10px] py-1.5 px-1.5" style={{ color: "var(--ledger-ink-faint)" }}>
                    {displayPosition(p.position, p.secondaryPosition)}
                  </td>
                  <td className="text-[10px] py-1.5 px-1.5 text-right tabular-nums">{row.games}</td>
                  <td className="text-[10px] py-1.5 px-1.5 text-right tabular-nums">{row.goals}</td>
                  <td className="text-[10px] py-1.5 px-1.5 text-right tabular-nums">{row.assists}</td>
                  <td className="text-[11px] py-1.5 px-1.5 text-right tabular-nums font-black">{row.points}</td>
                  <td className="text-[10px] py-1.5 px-1.5 text-right tabular-nums" style={{ color: "var(--ledger-ink-faint)" }}>
                    {row.toi.toFixed(1)}
                  </td>
                  <td className="text-[11px] py-1.5 px-1.5 text-right tabular-nums font-black" style={{ color: navColor(row.nav) }}>
                    {row.nav ?? "—"}
                  </td>
                  <td className="text-[10px] py-1.5 px-1.5 text-right tabular-nums" style={{ color: "var(--ledger-ink-faint)" }}>
                    ${(p.capHit * (1 - (p.retainedPct ?? 0))).toFixed(1)}M
                  </td>
                </tr>

                {open && (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-1.5 pb-2">
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

          {rows.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="text-[11px] py-4 text-center" style={{ color: "var(--ledger-ink-faint)" }}>
                No skaters on this roster.
              </td>
            </tr>
          )}
        </tbody>
      </table>
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
    <div className="grid gap-4 px-2 py-3">
      <RosterTable team={teams[0]} rows={home.rows} navMap={navMap} simulated={home.simulated} />
      {teams[1] && (
        <RosterTable team={teams[1]} rows={partner.rows} navMap={navMap} simulated={partner.simulated} />
      )}
    </div>
  );
}
