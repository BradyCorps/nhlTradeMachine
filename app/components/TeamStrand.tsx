"use client";
// ── TeamStrand — Franchise DNA visualization ──────────────────────────────────
// The team helix shows the roster's collective analytics profile against
// Championship and Playoff threshold benchmarks. Uses the same 4+4 trait
// structure as the player STRAND for design consistency, but aggregated
// across the top-13 contributors rather than a single player.
//
// OFF strand (navy, top): OPS/SCR · xG · NOIV · TOI+
// DEF strand (red, bottom): DPS/DEF · SUPP · Usage · OZ

import React from "react";

export interface TeamStrandData {
  off: { OPS: number; xG: number; NOIV: number; TOI: number };
  def: { DPS: number; SUPP: number; Usage: number; OZ: number };
}

// Championship-calibre team benchmarks (normalised 0–1).
// Derived from Stanley Cup finalist rosters 2022–2025.
export const CHAMP_TEMPLATE: TeamStrandData = {
  off: { OPS: 0.58, xG: 0.52, NOIV: 0.55, TOI: 0.68 },
  def: { DPS: 0.52, SUPP: 0.55, Usage: 0.60, OZ: 0.50 },
};

// Playoff-calibre threshold ≈ 80% of championship template
const playoffThreshold = (t: TeamStrandData): TeamStrandData => ({
  off: { OPS: t.off.OPS * 0.80, xG: t.off.xG * 0.80, NOIV: t.off.NOIV * 0.80, TOI: t.off.TOI * 0.80 },
  def: { DPS: t.def.DPS * 0.80, SUPP: t.def.SUPP * 0.80, Usage: t.def.Usage * 0.80, OZ: t.def.OZ * 0.80 },
});

const OFF_LABELS = ["OPS", "xG", "NOIV", "TOI+"] as const;
const DEF_LABELS = ["DPS", "SUPP", "Use",  "OZ" ] as const;

interface Props {
  strand:     TeamStrandData;
  teamName:   string;
  label?:     string;             // "Home" | "Partner" | "Post-trade"
  compare?:   TeamStrandData;     // show a second strand (post-trade overlay)
  W?: number; H?: number;
}

export default function TeamStrand({ strand, teamName, label, compare, W = 320, H = 130 }: Props) {
  const PLAYOFF = playoffThreshold(CHAMP_TEMPLATE);
  const cy = H / 2;
  const amplitude = 40;
  const N = 4;

  // Convert trait map to ordered array
  const toOff = (s: TeamStrandData) => [s.off.OPS, s.off.xG, s.off.NOIV, s.off.TOI];
  const toDef = (s: TeamStrandData) => [s.def.DPS, s.def.SUPP, s.def.Usage, s.def.OZ];

  // Build sine path with trait-driven amplitude at each node position
  const buildPath = (vals: number[], flip: boolean): string => {
    const freq = (2 * Math.PI) / W;
    const sm   = N / 2;           // sineM(4) = 2.0 → 2 full cycles
    const sign = flip ? 1 : -1;
    const pts: string[] = [];
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const x   = (i / steps) * W;
      // Interpolate amplitude based on progress through traits
      const pos = (x / W) * N;
      const lo  = Math.floor(pos) % N;
      const hi  = (lo + 1) % N;
      const t   = pos - Math.floor(pos);
      const amp = amplitude * (0.30 + (vals[lo] * (1 - t) + vals[hi] * t) * 0.70);
      const y   = cy + sign * amp * Math.sin(freq * x * sm);
      pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(" ");
  };

  // Reference path using uniform amplitude
  const buildRef = (avg: number, flip: boolean): string => {
    const freq = (2 * Math.PI) / W;
    const sm   = N / 2;
    const sign = flip ? 1 : -1;
    const amp  = amplitude * (0.30 + avg * 0.70);
    const pts: string[] = [];
    for (let i = 0; i <= 80; i++) {
      const x = (i / 80) * W;
      pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${(cy + sign * amp * Math.sin(freq * x * sm)).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  const avg = (vals: number[]) => vals.reduce((a, b) => a + b, 0) / vals.length;

  const offVals  = toOff(strand);
  const defVals  = toDef(strand);
  const champOff = toOff(CHAMP_TEMPLATE);
  const champDef = toDef(CHAMP_TEMPLATE);
  const playOff  = toOff(PLAYOFF);
  const playDef  = toDef(PLAYOFF);

  // Node positions for trait labels
  const nodeX = (i: number) => ((i + 0.5) / N) * W;
  const nodeY = (val: number, flip: boolean) => {
    const x = nodeX(0); // not used for label, just amplitude
    const amp = amplitude * (0.30 + val * 0.70);
    const sign = flip ? 1 : -1;
    const freq = (2 * Math.PI) / W;
    const sm   = N / 2;
    const nx   = nodeX(0);
    return cy + sign * amp * Math.sin(freq * nx * sm);
  };

  const NAVY = "var(--ledger-navy, #1a2e5c)";
  const RED  = "var(--ledger-red,  #b83020)";
  const GOLD = "var(--ledger-amber,#9a7d58)";
  const MONO = "'Courier Prime', monospace";

  const offScore = Math.round(avg(offVals) * 100);
  const defScore = Math.round(avg(defVals) * 100);

  return (
    <div style={{ fontFamily: MONO }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                    marginBottom: 4, padding: "0 2px" }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: "var(--ledger-ink)", letterSpacing: "0.05em" }}>
          {teamName}{label ? <span style={{ color: "var(--ledger-ink-faint)", fontWeight: 400 }}> · {label}</span> : null}
        </span>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.04em" }}>
          <span style={{ color: NAVY }}>OFF {offScore}</span>
          <span style={{ color: "var(--ledger-ink-faint)", margin: "0 4px" }}>·</span>
          <span style={{ color: RED  }}>DEF {defScore}</span>
        </span>
      </div>

      {/* Helix SVG */}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block", overflow: "visible" }}>
        {/* Championship reference */}
        <path d={buildRef(avg(champOff), false)} fill="none" stroke={GOLD}
          strokeWidth="1.5" strokeDasharray="6,4" opacity="0.6"/>
        <path d={buildRef(avg(champDef), true)}  fill="none" stroke={GOLD}
          strokeWidth="1.5" strokeDasharray="6,4" opacity="0.6"/>

        {/* Playoff threshold */}
        <path d={buildRef(avg(playOff), false)} fill="none" stroke="#2a7a44"
          strokeWidth="1" strokeDasharray="3,4" opacity="0.45"/>
        <path d={buildRef(avg(playDef), true)}  fill="none" stroke="#2a7a44"
          strokeWidth="1" strokeDasharray="3,4" opacity="0.45"/>

        {/* Ladder rungs */}
        {[1,2,3,4,5,6].map(i => {
          const x = (i / 7) * W;
          const freq = (2 * Math.PI) / W;
          const sm = N / 2;
          const offA = amplitude * (0.30 + avg(offVals) * 0.70);
          const defA = amplitude * (0.30 + avg(defVals) * 0.70);
          const oy = cy - offA * Math.sin(freq * x * sm);
          const dy = cy + defA * Math.sin(freq * x * sm);
          return <line key={i} x1={x} y1={oy} x2={x} y2={dy}
            stroke="var(--ledger-rule, #c8b890)" strokeWidth="0.8" opacity="0.25"/>;
        })}

        {/* Optional compare overlay (post-trade) */}
        {compare && (
          <>
            <path d={buildPath(toOff(compare), false)} fill="none" stroke={NAVY}
              strokeWidth="1.5" opacity="0.35" strokeDasharray="5,3"/>
            <path d={buildPath(toDef(compare), true)}  fill="none" stroke={RED}
              strokeWidth="1.5" opacity="0.35" strokeDasharray="5,3"/>
          </>
        )}

        {/* Main strands */}
        <path d={buildPath(defVals, true)}  fill="none" stroke={RED}  strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
        <path d={buildPath(offVals, false)} fill="none" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>

        {/* Trait node labels — OFF */}
        {OFF_LABELS.map((lbl, i) => {
          const x = nodeX(i);
          const freq = (2 * Math.PI) / W;
          const sm = N / 2;
          const amp = amplitude * (0.30 + offVals[i] * 0.70);
          const y = cy - amp * Math.sin(freq * x * sm);
          const above = y < cy;
          return (
            <g key={lbl}>
              <circle cx={x} cy={y} r="3" fill={NAVY} opacity="0.85"/>
              <text x={x} y={above ? y - 5 : y + 11} textAnchor="middle"
                fontSize="7" fill={NAVY} fontWeight="900" fontFamily={MONO} opacity="0.9">
                {lbl}
              </text>
            </g>
          );
        })}

        {/* Trait node labels — DEF */}
        {DEF_LABELS.map((lbl, i) => {
          const x = nodeX(i);
          const freq = (2 * Math.PI) / W;
          const sm = N / 2;
          const amp = amplitude * (0.30 + defVals[i] * 0.70);
          const y = cy + amp * Math.sin(freq * x * sm);
          const below = y > cy;
          return (
            <g key={lbl}>
              <circle cx={x} cy={y} r="3" fill={RED} opacity="0.85"/>
              <text x={x} y={below ? y + 11 : y - 5} textAnchor="middle"
                fontSize="7" fill={RED} fontWeight="900" fontFamily={MONO} opacity="0.9">
                {lbl}
              </text>
            </g>
          );
        })}

        {/* Legend */}
        <line x1="6" y1="10" x2="20" y2="10" stroke={NAVY} strokeWidth="2"/>
        <text x="23" y="14" fontSize="7" fill={NAVY} fontFamily={MONO} fontWeight="900">OFFENSE</text>
        <line x1="6" y1="22" x2="20" y2="22" stroke={RED} strokeWidth="2"/>
        <text x="23" y="26" fontSize="7" fill={RED} fontFamily={MONO} fontWeight="900">DEFENSE</text>
        <line x1="6" y1="34" x2="20" y2="34" stroke={GOLD} strokeWidth="1.5" strokeDasharray="5,3"/>
        <text x="23" y="38" fontSize="7" fill={GOLD} fontFamily={MONO}>CHAMP</text>
        <line x1="6" y1="46" x2="20" y2="46" stroke="#2a7a44" strokeWidth="1" strokeDasharray="3,3"/>
        <text x="23" y="50" fontSize="7" fill="#2a7a44" fontFamily={MONO}>PLAYOFF</text>
      </svg>
    </div>
  );
}