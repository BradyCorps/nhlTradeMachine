"use client";

// ── GravityHeatMap — D3 contour-based rink heat map ──────────────
// Renders the three gravity zone masses (OZ well, NZ well, DZ dome)
// as a smooth heat-map field on a half-rink or full-rink shape.
// Uses d3-contour for density estimation and d3-interpolate for
// color gradients. The output is pure SVG rendered through React.

import React, { useId, useMemo } from "react";
import { contours as d3Contours } from "d3-contour";
import { interpolateRgbBasis } from "d3-interpolate";
import { scaleLinear, scaleSequential } from "d3-scale";
import type { ZoneMasses, GravityTier } from "@/app/lib/gravity";
import { gravityTierColor } from "@/app/lib/gravity";

interface Props {
  masses: ZoneMasses;
  tier: GravityTier | null;
  force: number;
  isDefenseman: boolean;
  playerName?: string;
}

const W = 320;
const H = 160;
const RINK_X = 12;
const RINK_Y = 12;
const RINK_W = W - 24;
const RINK_H = H - 24;
const GRID_W = 64;
const GRID_H = 32;

function generateField(masses: ZoneMasses): number[] {
  const { oz, nz, dz } = masses;
  const values = new Array(GRID_W * GRID_H);

  const sources = [
    { x: GRID_W * 0.82, y: GRID_H * 0.5, m: oz, sigma: 8 },
    { x: GRID_W * 0.50, y: GRID_H * 0.5, m: nz, sigma: 10 },
    { x: GRID_W * 0.18, y: GRID_H * 0.5, m: -dz, sigma: 8 },
  ];

  for (let j = 0; j < GRID_H; j++) {
    for (let i = 0; i < GRID_W; i++) {
      let v = 0;
      for (const s of sources) {
        const dx = i - s.x;
        const dy = j - s.y;
        const r2 = dx * dx + dy * dy;
        v += s.m * Math.exp(-r2 / (2 * s.sigma * s.sigma));
      }
      values[j * GRID_W + i] = v;
    }
  }
  return values;
}

export default function GravityHeatMap({ masses, tier, force, isDefenseman, playerName }: Props) {
  const clipId = useId();
  const tierColor = tier ? gravityTierColor(tier) : "var(--ledger-ink-faint)";

  const { paths, colorScale, thresholds } = useMemo(() => {
    const field = generateField(masses);
    const maxAbs = Math.max(
      0.1,
      ...field.map(v => Math.abs(v)),
    );

    const nLevels = 12;
    const thresholds = Array.from({ length: nLevels }, (_, i) =>
      -maxAbs + (2 * maxAbs * (i + 1)) / (nLevels + 1)
    );

    const contourGen = d3Contours()
      .size([GRID_W, GRID_H])
      .thresholds(thresholds);

    const contourData = contourGen(field);

    const coolScale = interpolateRgbBasis(["#1a1a2e", "#16425b", "#2d7d9a", "#5fb5c8"]);
    const warmScale = interpolateRgbBasis(["#2a1a1a", "#7a2020", "#c44020", "#e8a040"]);

    const colorScale = (v: number) => {
      if (v >= 0) {
        const t = Math.min(1, v / maxAbs);
        return warmScale(t);
      } else {
        const t = Math.min(1, -v / maxAbs);
        return coolScale(t);
      }
    };

    const sx = scaleLinear().domain([0, GRID_W]).range([RINK_X, RINK_X + RINK_W]);
    const sy = scaleLinear().domain([0, GRID_H]).range([RINK_Y, RINK_Y + RINK_H]);

    const paths = contourData.map(c => {
      const d = c.coordinates.map(polygon =>
        polygon.map(ring =>
          ring.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join("L")
        ).map(r => `M${r}Z`).join("")
      ).join("");
      return { d, value: c.value, color: colorScale(c.value) };
    });

    return { paths, colorScale, thresholds };
  }, [masses]);

  const hasSignal = Math.abs(masses.oz) > 0.02 || Math.abs(masses.nz) > 0.02 || Math.abs(masses.dz) > 0.02;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-[9px] font-black uppercase tracking-[0.18em]"
          style={{ color: "var(--ledger-ink-faint)" }}>
          Territorial Heat Map
        </span>
        <span className="font-mono text-[11px] font-black" style={{ color: tierColor }}>
          {force > 0 ? "+" : ""}{force.toFixed(2)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxWidth: W, background: "var(--paper-card, var(--paper-bg))" }}
        role="img"
        aria-label={`Gravity heat map${playerName ? ` for ${playerName}` : ""}: OZ ${masses.oz > 0 ? "+" : ""}${masses.oz.toFixed(2)}, NZ ${masses.nz > 0 ? "+" : ""}${masses.nz.toFixed(2)}, DZ ${masses.dz > 0 ? "+" : ""}${masses.dz.toFixed(2)}`}
      >
        {/* Rink outline */}
        <rect
          x={RINK_X} y={RINK_Y} width={RINK_W} height={RINK_H} rx={RINK_H / 2.2}
          fill="none"
          stroke="var(--ledger-ink)"
          strokeWidth={1.5}
          opacity={0.4}
        />

        {/* Clip to rink shape */}
        <defs>
          <clipPath id={clipId}>
            <rect x={RINK_X + 1} y={RINK_Y + 1} width={RINK_W - 2} height={RINK_H - 2} rx={RINK_H / 2.2 - 1} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          {/* Heat map contours */}
          {hasSignal && paths.map((p, i) => (
            <path
              key={i}
              d={p.d}
              fill={p.color}
              opacity={0.55}
              stroke="none"
            />
          ))}
        </g>

        {/* Blue lines */}
        <line
          x1={RINK_X + RINK_W * 0.33} y1={RINK_Y + 2}
          x2={RINK_X + RINK_W * 0.33} y2={RINK_Y + RINK_H - 2}
          stroke="var(--ledger-ice, #1a4b5b)" strokeWidth={2} opacity={0.35}
        />
        <line
          x1={RINK_X + RINK_W * 0.67} y1={RINK_Y + 2}
          x2={RINK_X + RINK_W * 0.67} y2={RINK_Y + RINK_H - 2}
          stroke="var(--ledger-ice, #1a4b5b)" strokeWidth={2} opacity={0.35}
        />

        {/* Center line */}
        <line
          x1={RINK_X + RINK_W * 0.5} y1={RINK_Y + 2}
          x2={RINK_X + RINK_W * 0.5} y2={RINK_Y + RINK_H - 2}
          stroke="var(--ledger-red)" strokeWidth={1.2} opacity={0.3}
          strokeDasharray="3,3"
        />

        {/* Zone labels */}
        <text x={RINK_X + RINK_W * 0.16} y={RINK_Y + RINK_H - 6}
          textAnchor="middle" fill="var(--ledger-ink)" opacity={0.4}
          fontSize={8} fontFamily="'Courier Prime', monospace" fontWeight={700}>
          DZ
        </text>
        <text x={RINK_X + RINK_W * 0.50} y={RINK_Y + RINK_H - 6}
          textAnchor="middle" fill="var(--ledger-ink)" opacity={0.4}
          fontSize={8} fontFamily="'Courier Prime', monospace" fontWeight={700}>
          NZ
        </text>
        <text x={RINK_X + RINK_W * 0.84} y={RINK_Y + RINK_H - 6}
          textAnchor="middle" fill="var(--ledger-ink)" opacity={0.4}
          fontSize={8} fontFamily="'Courier Prime', monospace" fontWeight={700}>
          OZ
        </text>

        {/* Direction arrow */}
        <text x={W - 14} y={RINK_Y - 2}
          textAnchor="end" fill="var(--ledger-ink-faint)"
          fontSize={6} fontFamily="'Courier Prime', monospace" fontWeight={700}
          letterSpacing="0.12em" opacity={0.6}>
          ATTACKING →
        </text>
      </svg>

      {/* Color legend */}
      <div className="flex items-center justify-between mt-1.5">
        <span className="font-mono text-[7px] font-bold uppercase tracking-[0.1em]"
          style={{ color: "var(--ledger-ice, #2d7d9a)" }}>
          Suppression
        </span>
        <div className="flex-1 mx-2 h-1.5 rounded-sm" style={{
          background: "linear-gradient(to right, #2d7d9a, #5fb5c8, var(--paper-bg, #f5f0e8), #c44020, #e8a040)",
        }} />
        <span className="font-mono text-[7px] font-bold uppercase tracking-[0.1em]"
          style={{ color: "var(--ledger-red, #c44020)" }}>
          Attack
        </span>
      </div>
    </div>
  );
}
