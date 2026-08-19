"use client";

// ── GoalieEdgePanel — NHL EDGE shot-location detail ──────────────
//
// The goalie dossier used to print the skater stat row: goals, assists,
// points, plus-minus. This is what belongs there instead — the shot data
// split by where the shot came from, which is the only place a goalie's
// job is actually visible.
//
// The reading the panel is built around is the DELTA against the league
// at each location. A raw .864 means nothing on its own; .864 against a
// league .811 on high-danger shots is the single most repeatable goalie
// skill signal the feed carries. So the bar encodes the gap, the goalie's
// own figure is the headline, and the league average sits beside it in
// muted ink rather than being left for the reader to remember.
//
// Percentiles are always printed as a number as well as coloured — a
// reader who cannot separate the greens still gets the rank.

import React, { useState } from "react";
import { scaleLinear } from "d3-scale";
import type { GoalieZoneKey } from "@/app/lib/nhl-player-feed";

export interface GoalieZoneSplitView {
  zone: GoalieZoneKey;
  savePct: number | null;
  savePctLeagueAvg: number | null;
  percentile: number | null;
  shotsAgainst: number | null;
  saves: number | null;
  goalsAgainst: number | null;
}

export interface GoalieEdgeView {
  gamesPlayed: number | null;
  wins: number | null;
  losses: number | null;
  otLosses: number | null;
  gaa: number | null;
  savePct: number | null;
  shotsAgainst: number | null;
  saves: number | null;
  goalsAgainst: number | null;
  highDangerSavePct: number | null;
  highDangerGoalsAgainst: number | null;
  startsAbove900Pct: number | null;
  zones: GoalieZoneSplitView[];
}

interface Props {
  detail: GoalieEdgeView;
  playerName: string;
}

const ZONE_LABEL: Record<GoalieZoneKey, string> = {
  all: "All Locations", high: "High-Danger", mid: "Mid-Range", long: "Long-Range",
};

const ZONE_DESC: Record<GoalieZoneKey, string> = {
  all:  "Every shot on goal faced.",
  high: "Shots from within 29 ft of the centre of the goal, bounded by lines from the face-off dots to 2 ft outside each post.",
  mid:  "Shots from outside the high-danger area but inside long range.",
  long: "Shots from the perimeter — the ones a goalie is expected to stop.",
};

// Draw order is fixed rather than taken from the feed, so the panel reads
// the same for every goalie regardless of how the payload was ordered.
const ZONE_ORDER: GoalieZoneKey[] = ["all", "high", "mid", "long"];

const GOOD = "var(--ledger-green, #2a7a3f)";
const BAD = "var(--ledger-red, #b83020)";
const ink = "var(--ledger-ink)";
const faint = "var(--ledger-ink-faint)";
const rule = "var(--ledger-rule)";

/** ".906" — save percentages are read as three decimals without the zero. */
const pct3 = (v: number | null): string =>
  v == null ? "—" : v.toFixed(3).replace(/^0/, "");

const int = (v: number | null): string =>
  v == null ? "—" : Math.round(v).toLocaleString();

/** Percentile chip. The number is always shown; colour only reinforces it. */
function PercentileChip({ value }: { value: number | null }) {
  if (value == null) return null;
  const band = value >= 81 ? "high" : value >= 51 ? "mid" : "low";
  const bg = band === "high" ? GOOD : band === "mid" ? "var(--ledger-ink)" : "transparent";
  const fg = band === "low" ? faint : "var(--paper-bg, #fff)";
  const suffix = (n: number) => {
    const t = n % 10, h = n % 100;
    if (t === 1 && h !== 11) return "st";
    if (t === 2 && h !== 12) return "nd";
    if (t === 3 && h !== 13) return "rd";
    return "th";
  };
  return (
    <span
      className="font-mono text-[9px] font-black px-1.5 py-0.5 border"
      style={{
        background: bg,
        color: fg,
        borderColor: band === "low" ? rule : "transparent",
        opacity: band === "low" ? 0.75 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {value < 50 ? "<50th" : `${Math.round(value)}${suffix(Math.round(value))}`}
    </span>
  );
}

function HeroStat({ label, value, percentile, hint }: {
  label: string; value: string; percentile: number | null; hint?: string;
}) {
  return (
    <div className="px-3 py-2 border" style={{ borderColor: rule, background: "var(--paper-inset)" }} title={hint}>
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <span className="font-mono text-[8px] font-black uppercase tracking-[0.12em] leading-tight" style={{ color: faint }}>
          {label}
        </span>
        <PercentileChip value={percentile} />
      </div>
      <div className="font-mono text-[20px] font-black leading-none" style={{ color: ink, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

export default function GoalieEdgePanel({ detail, playerName }: Props) {
  const [hovered, setHovered] = useState<GoalieZoneKey | null>(null);

  const zones = ZONE_ORDER
    .map(z => detail.zones.find(s => s.zone === z))
    .filter((s): s is GoalieZoneSplitView => s != null && s.savePct != null);

  // Nothing worth a panel — the capture has not reached this goalie yet.
  if (zones.length === 0) return null;

  // Deltas are in save-percentage points; the scale is symmetric so a gap
  // above the league and the same gap below draw the same length.
  const deltas = zones.map(z =>
    z.savePct != null && z.savePctLeagueAvg != null ? z.savePct - z.savePctLeagueAvg : 0);
  const maxAbs = Math.max(0.02, ...deltas.map(Math.abs));

  const barW = 96;
  const x = scaleLinear().domain([-maxAbs, maxAbs]).range([0, barW]);
  const zeroX = x(0);

  const record = [detail.wins, detail.losses, detail.otLosses].every(v => v != null)
    ? `${detail.wins}-${detail.losses}-${detail.otLosses}`
    : null;

  return (
    <div className="border mb-4" style={{ borderColor: rule, background: "var(--paper-card, var(--paper-inset))" }}>
      <div className="px-3 py-2 border-b flex items-baseline justify-between gap-2" style={{ borderColor: rule }}>
        <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: ink }}>
          NHL Edge · Shot Locations
        </span>
        <span className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.12em]" style={{ color: faint }}>
          {record ? `${record} · ` : ""}{detail.gamesPlayed != null ? `${detail.gamesPlayed} GP` : ""}
        </span>
      </div>

      {/* Headline stats — the three the NHL leads its own goalie page with */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3">
        <HeroStat
          label="High-Danger SV%"
          value={pct3(detail.highDangerSavePct)}
          percentile={zones.find(z => z.zone === "high")?.percentile ?? null}
          hint={ZONE_DESC.high}
        />
        <HeroStat
          label="High-Danger GA"
          value={int(detail.highDangerGoalsAgainst)}
          percentile={null}
          hint="Goals allowed on shots from the high-danger area."
        />
        <HeroStat
          label="Starts > .900"
          value={detail.startsAbove900Pct != null ? `${detail.startsAbove900Pct.toFixed(1)}%` : "—"}
          percentile={null}
          hint="Share of starts finishing above a .900 save percentage — a game-by-game consistency read rather than a peak."
        />
      </div>

      {/* Per-location split — value, league average, and the gap between */}
      <div className="px-3 pb-3">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="font-mono text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: faint }}>
            By Location
          </span>
          <span className="font-mono text-[8px] uppercase tracking-[0.1em]" style={{ color: faint }}>
            vs NHL average
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 420 }}>
            <thead>
              <tr>
                {["", "SV%", "NHL", "GAP", "SA", "SV", "GA"].map((h, i) => (
                  <th key={i}
                    className="font-mono text-[8px] font-black uppercase tracking-[0.1em] pb-1"
                    style={{
                      color: faint,
                      textAlign: i === 0 ? "left" : i === 3 ? "center" : "right",
                      borderBottom: `1px solid ${rule}`,
                    }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zones.map(z => {
                const delta = z.savePct != null && z.savePctLeagueAvg != null
                  ? z.savePct - z.savePctLeagueAvg : null;
                const above = (delta ?? 0) >= 0;
                const color = delta == null ? faint : above ? GOOD : BAD;
                const isHov = hovered === z.zone;
                return (
                  <tr key={z.zone}
                    onMouseEnter={() => setHovered(z.zone)}
                    onMouseLeave={() => setHovered(null)}
                    title={ZONE_DESC[z.zone]}
                    style={{ background: isHov ? "color-mix(in srgb, var(--ledger-ink) 4%, transparent)" : "transparent" }}
                  >
                    <td className="font-mono text-[10px] font-black py-1 pr-2" style={{ color: ink, whiteSpace: "nowrap" }}>
                      {ZONE_LABEL[z.zone]}
                    </td>
                    <td className="font-mono text-[12px] font-black py-1 px-1"
                      style={{ color: ink, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {pct3(z.savePct)}
                    </td>
                    <td className="font-mono text-[11px] py-1 px-1"
                      style={{ color: faint, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {pct3(z.savePctLeagueAvg)}
                    </td>
                    <td className="py-1 px-1" style={{ width: barW + 8 }}>
                      {delta != null && (
                        <svg width={barW} height={14} style={{ display: "block", margin: "0 auto" }}
                          role="img"
                          aria-label={`${ZONE_LABEL[z.zone]}: ${above ? "above" : "below"} league average by ${Math.abs(delta * 1000).toFixed(0)} thousandths`}>
                          <line x1={zeroX} y1={0} x2={zeroX} y2={14}
                            stroke={ink} strokeWidth={1} opacity={0.25} />
                          <rect
                            x={above ? zeroX : x(delta)}
                            y={3}
                            width={Math.max(1.5, Math.abs(x(delta) - zeroX))}
                            height={8}
                            fill={color}
                            opacity={isHov ? 1 : 0.8}
                            rx={1}
                          />
                        </svg>
                      )}
                    </td>
                    <td className="font-mono text-[10px] py-1 px-1"
                      style={{ color: faint, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {int(z.shotsAgainst)}
                    </td>
                    <td className="font-mono text-[10px] py-1 px-1"
                      style={{ color: faint, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {int(z.saves)}
                    </td>
                    <td className="font-mono text-[10px] py-1 pl-1"
                      style={{ color: faint, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {int(z.goalsAgainst)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend — identity is never carried by colour alone */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 pt-2 border-t" style={{ borderColor: rule }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5" style={{ background: GOOD, opacity: 0.8 }} />
            <span className="font-mono text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: faint }}>
              Above NHL average
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5" style={{ background: BAD, opacity: 0.8 }} />
            <span className="font-mono text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: faint }}>
              Below
            </span>
          </span>
          <span className="font-mono text-[8px] uppercase tracking-[0.1em]" style={{ color: faint }}>
            SA shots against · SV saves · GA goals against
          </span>
        </div>

        <p className="font-mono text-[9px] leading-relaxed mt-2" style={{ color: faint }}>
          High-danger covers shots within 29 ft of the centre of the goal, bounded by lines drawn
          from the face-off dots to 2 ft outside each post. Only shots on goal count — blocked
          attempts, misses, and pucks off the post are not shots against.
        </p>
      </div>
    </div>
  );
}
