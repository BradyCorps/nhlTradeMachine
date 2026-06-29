"use client";
// ── TeamStrand — Franchise DNA visualization ─────────────────────────────────
// Double helix encoding team-aggregate analytics.
//   OFF strand (navy, above centre): OPS/SCR · xG · NOIV · TOI+
//   DEF strand (red,  below centre): DPS/DEF · SUPP · Usage · OZ
//
// Amplitude fix: each trait owns exactly W/4 of the width. Amplitude is
// constant within that section. Sections only change at sine zero-crossings
// (sin = 0 there) so there is zero visual discontinuity. Node circles sit
// exactly on the path by construction — no blending artefacts.

import React from "react";

export interface TeamStrandData {
  off: { OPS: number; xG: number; NOIV: number; TOI: number };
  def: { DPS: number; SUPP: number; Usage: number; OZ: number };
}

// Championship-calibre benchmarks (normalised 0–1, calibrated to opsMax=7 / dpsMax=4.5)
// Championship teams average ~4 OPS across their top-13 → 4/7 ≈ 0.57
export const CHAMP_TEMPLATE: TeamStrandData = {
  off: { OPS: 0.57, xG: 0.54, NOIV: 0.58, TOI: 0.68 },
  def: { DPS: 0.55, SUPP: 0.58, Usage: 0.62, OZ: 0.52 },
};

// Median NHL team — calibrated to real roster averages:
// League avg top-13 OPS ≈ 2.3 → 2.3/7 = 0.33; DPS ≈ 1.4 → 1.4/4.5 = 0.31
export const LEAGUE_AVERAGE: TeamStrandData = {
  off: { OPS: 0.33, xG: 0.40, NOIV: 0.50, TOI: 0.43 },
  def: { DPS: 0.31, SUPP: 0.48, Usage: 0.50, OZ: 0.50 },
};

// Playoff threshold ≈ 80% of championship template
const PLAYOFF: TeamStrandData = {
  off: { OPS: CHAMP_TEMPLATE.off.OPS * 0.80, xG: CHAMP_TEMPLATE.off.xG * 0.80,
         NOIV: CHAMP_TEMPLATE.off.NOIV * 0.80, TOI: CHAMP_TEMPLATE.off.TOI * 0.80 },
  def: { DPS: CHAMP_TEMPLATE.def.DPS * 0.80, SUPP: CHAMP_TEMPLATE.def.SUPP * 0.80,
         Usage: CHAMP_TEMPLATE.def.Usage * 0.80, OZ: CHAMP_TEMPLATE.def.OZ * 0.80 },
};

const N          = 4;
const STEPS      = 200;
const OFF_LABELS = ["OPS", "xG", "NOIV", "TOI+"] as const;
const DEF_LABELS = ["DPS", "SUPP", "Use",  "OZ"  ] as const;

const toOff = (s: TeamStrandData) => [s.off.OPS, s.off.xG, s.off.NOIV, s.off.TOI];
const toDef = (s: TeamStrandData) => [s.def.DPS, s.def.SUPP, s.def.Usage, s.def.OZ];
const avg   = (v: number[])       => v.reduce((a, b) => a + b, 0) / v.length;

interface Props {
  strand:   TeamStrandData;
  teamName: string;
  label?:   string;
  compare?: TeamStrandData;
}

export default function TeamStrand({ strand, teamName, label, compare }: Props) {
  const W   = 340;
  const H   = 160;
  const PAD = 16;   // vertical breathing room for edge labels
  const cy  = H / 2;
  const AMP = 46;

  const NAVY = "#1a2e5c";
  const RED  = "#b83020";
  const GOLD = "#9a7d58";
  const GRAY = "#888888";
  const MONO = "'Courier Prime', monospace";

  const freq = (2 * Math.PI) / W;
  const sm   = N / 2;   // sineM(4) = 2.0 → 2 full cycles

  // ── Section-based path: trait i owns [i·W/N … (i+1)·W/N] ─────────────────
  // Amplitude is constant inside a section; sections change at x = k·W/N
  // where sin(freq·x·sm) = 0, so no visual discontinuity at boundaries.
  const buildPath = (vals: number[], flip: boolean): string =>
    Array.from({ length: STEPS + 1 }, (_, step) => {
      const x   = (step / STEPS) * W;
      const ti  = Math.min(N - 1, Math.floor((x / W) * N));
      const amp = AMP * (0.28 + vals[ti] * 0.72);
      const y   = cy + (flip ? 1 : -1) * amp * Math.sin(freq * x * sm);
      return `${step === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");

  // Uniform-amplitude path for reference lines
  const buildRef = (uniformVal: number, flip: boolean): string =>
    Array.from({ length: 81 }, (_, i) => {
      const x   = (i / 80) * W;
      const amp = AMP * (0.28 + uniformVal * 0.72);
      const y   = cy + (flip ? 1 : -1) * amp * Math.sin(freq * x * sm);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");

  // ── Node geometry ──────────────────────────────────────────────────────────
  // Peak of i-th half-cycle: x = (2i+1)/(2N)·W
  // At this x, traitIdx = i exactly → amp = vals[i] → node sits on path ✓
  const nodeX = (i: number) => ((2 * i + 1) / (2 * N)) * W;

  const nodeY = (val: number, i: number, flip: boolean) => {
    const x = nodeX(i);
    return cy + (flip ? 1 : -1) * AMP * (0.28 + val * 0.72) * Math.sin(freq * x * sm);
  };

  // True when the node renders above the centre line
  const isAbove = (i: number, flip: boolean) =>
    (flip ? 1 : -1) * Math.sin(freq * nodeX(i) * sm) < 0;

  // Label x — clamp away from SVG edges
  const labelX = (i: number) => Math.max(20, Math.min(W - 20, nodeX(i)));

  // Label y — offset clear of the node, clamped inside PAD margins
  const labelY = (val: number, i: number, flip: boolean) => {
    const y     = nodeY(val, i, flip);
    const above = isAbove(i, flip);
    return above
      ? Math.max(PAD + 6,       y - 8)
      : Math.min(H - PAD - 2,   y + 14);
  };

  const offVals = toOff(strand);
  const defVals = toDef(strand);
  const offScore = Math.round(avg(offVals) * 100);
  const defScore = Math.round(avg(defVals) * 100);


  return (
    <div style={{ fontFamily: MONO }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "baseline", marginBottom: 4, padding: "0 2px" }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: "var(--ledger-ink)",
                       letterSpacing: "0.05em", overflow: "hidden",
                       textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "62%" }}>
          {teamName}
          {label && (
            <span style={{ color: "var(--ledger-ink-faint)", fontWeight: 400, fontSize: 9 }}>
              {" · "}{label}
            </span>
          )}
        </span>
        <span style={{ fontSize: 9, fontWeight: 900, flexShrink: 0 }}>
          <span style={{ color: NAVY }}>OFF {offScore}</span>
          <span style={{ color: "var(--ledger-ink-faint)", margin: "0 3px" }}>·</span>
          <span style={{ color: RED }}>DEF {defScore}</span>
        </span>
      </div>

      {/* Helix SVG */}
      <svg viewBox={`0 0 ${W} ${H}`}
           style={{ width: "100%", display: "block", overflow: "visible" }}>

        {/* League average (gray, faint) */}
        <path d={buildRef(avg(toOff(LEAGUE_AVERAGE)), false)} fill="none"
              stroke={GRAY} strokeWidth="1" strokeDasharray="2,5" opacity="0.40"/>
        <path d={buildRef(avg(toDef(LEAGUE_AVERAGE)), true)} fill="none"
              stroke={GRAY} strokeWidth="1" strokeDasharray="2,5" opacity="0.40"/>

        {/* Playoff threshold */}
        <path d={buildRef(avg(toOff(PLAYOFF)), false)} fill="none"
              stroke="#2a7a44" strokeWidth="1.2" strokeDasharray="3,4" opacity="0.55"/>
        <path d={buildRef(avg(toDef(PLAYOFF)), true)} fill="none"
              stroke="#2a7a44" strokeWidth="1.2" strokeDasharray="3,4" opacity="0.55"/>

        {/* Championship template */}
        <path d={buildRef(avg(toOff(CHAMP_TEMPLATE)), false)} fill="none"
              stroke={GOLD} strokeWidth="1.5" strokeDasharray="6,4" opacity="0.70"/>
        <path d={buildRef(avg(toDef(CHAMP_TEMPLATE)), true)} fill="none"
              stroke={GOLD} strokeWidth="1.5" strokeDasharray="6,4" opacity="0.70"/>

        {/* Compare overlay */}
        {compare && (<>
          <path d={buildPath(toOff(compare), false)} fill="none"
                stroke={NAVY} strokeWidth="1.5" opacity="0.28" strokeDasharray="5,3"/>
          <path d={buildPath(toDef(compare), true)} fill="none"
                stroke={RED} strokeWidth="1.5" opacity="0.28" strokeDasharray="5,3"/>
        </>)}

        {/* 3D helix — full-weight strands with crossover layering */}
        {(() => {
          const crossXs: number[] = [];
          for (let k = 0; ; k++) {
            const x = W * (1 + 2 * k) / (4 * sm);
            if (x > W) break;
            crossXs.push(x);
          }
          const bounds = [0, ...crossXs, W];
          const OL = 1.5;

          const sectionPath = (vals: number[], flip: boolean, xS: number, xE: number): string =>
            Array.from({ length: STEPS + 1 }, (_, step) => {
              const x = (step / STEPS) * W;
              if (x < xS - OL || x > xE + OL) return null;
              const ti = Math.min(N - 1, Math.floor((x / W) * N));
              const amp = AMP * (0.28 + vals[ti] * 0.72);
              const y = cy + (flip ? 1 : -1) * amp * Math.sin(freq * x * sm);
              return `${x.toFixed(1)} ${y.toFixed(1)}`;
            }).filter((s): s is string => s !== null)
              .map((s, i) => `${i === 0 ? "M" : "L"} ${s}`).join(" ");

          const sections = bounds.slice(0, -1).map((xS, k) => ({
            xS, xE: bounds[k + 1],
            offFront: Math.cos(freq * ((xS + bounds[k + 1]) / 2) * sm) > 0,
          }));

          return (<>
            {/* Layer 1: back strand sections */}
            {sections.map(({ xS, xE, offFront }, k) => (
              <path key={`bk-${k}`} d={sectionPath(offFront ? defVals : offVals, offFront, xS, xE)}
                    fill="none" stroke={offFront ? RED : NAVY} strokeWidth="2.5" opacity="0.90"/>
            ))}
            {/* Layer 2: knockout border — background-colored outline on front strand */}
            {sections.map(({ xS, xE, offFront }, k) => (
              <path key={`ko-${k}`} d={sectionPath(offFront ? offVals : defVals, !offFront, xS, xE)}
                    fill="none" stroke="var(--ledger-cream, #f5efe0)" strokeWidth="5.5"
                    strokeLinecap="round"/>
            ))}
            {/* Layer 3: front strand sections */}
            {sections.map(({ xS, xE, offFront }, k) => (
              <path key={`fg-${k}`} d={sectionPath(offFront ? offVals : defVals, !offFront, xS, xE)}
                    fill="none" stroke={offFront ? NAVY : RED} strokeWidth="2.5" opacity="0.90"/>
            ))}
          </>);
        })()}

        {/* OFF labels */}
        {OFF_LABELS.map((lbl, i) => (
          <g key={`off-${i}`}>
            <text x={labelX(i)} y={labelY(offVals[i], i, false)}
                  textAnchor="middle" fontSize="7.5" fill={NAVY}
                  fontWeight="900" fontFamily={MONO}>
              {lbl}
            </text>
          </g>
        ))}

        {/* DEF labels */}
        {DEF_LABELS.map((lbl, i) => (
          <g key={`def-${i}`}>
            <text x={labelX(i)} y={labelY(defVals[i], i, true)}
                  textAnchor="middle" fontSize="7.5" fill={RED}
                  fontWeight="900" fontFamily={MONO}>
              {lbl}
            </text>
          </g>
        ))}
      </svg>

      {/* Legend — below the SVG, no overlap with helix */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px",
                    marginTop: 5, padding: "0 2px" }}>
        {([
          { stroke: NAVY,      dash: "",    label: "OFF",        w: 2.5 },
          { stroke: RED,       dash: "",    label: "DEF",        w: 2.5 },
          { stroke: GOLD,      dash: "5,3", label: "Champ",      w: 1.5 },
          { stroke: "#2a7a44", dash: "3,4", label: "Playoff",    w: 1.2 },
          { stroke: GRAY,      dash: "2,5", label: "League avg", w: 1.0 },
        ] as const).map(({ stroke, dash, label: l, w }) => (
          <span key={l} style={{ display: "inline-flex", alignItems: "center",
                                  gap: 3, fontSize: 7, color: stroke,
                                  fontFamily: MONO, fontWeight: 700 }}>
            <svg width="14" height="7" style={{ flexShrink: 0 }}>
              <line x1="0" y1="3.5" x2="14" y2="3.5"
                    stroke={stroke} strokeWidth={w}
                    strokeDasharray={dash || undefined}/>
            </svg>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}