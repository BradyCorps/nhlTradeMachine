"use client";

import React, { useMemo, useState } from "react";
import { scaleLinear, scaleBand } from "d3-scale";

interface TeamNavDatum {
  name: string;
  abbrev: string;
  nav: number;
  goalDiff: number;
  phase: string;
}

interface Props {
  data: TeamNavDatum[];
}

const PHASE_COLORS: Record<string, string> = {
  Contender: "var(--ledger-green, #2a7a3f)",
  Bubble: "var(--ledger-amber, #d4a017)",
  Retooling: "var(--ledger-ink-faint, #888)",
  Rebuilding: "var(--ledger-red, #b83020)",
  Tanking: "var(--ledger-red, #b83020)",
};

export default function TeamNavChart({ data }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const sorted = useMemo(
    () => [...data].sort((a, b) => b.nav - a.nav),
    [data],
  );

  if (sorted.length === 0) return null;

  const barH = 24;
  const gap = 3;
  const labelW = 48;
  const valueW = 56;
  const margin = { top: 20, right: 8, bottom: 8, left: 0 };
  const chartW = 520;
  const barAreaW = chartW - labelW - valueW - margin.left - margin.right;
  const chartH = margin.top + margin.bottom + sorted.length * (barH + gap) - gap;

  const maxNav = Math.max(...sorted.map(d => d.nav));
  const xScale = scaleLinear()
    .domain([0, maxNav * 1.08])
    .range([0, barAreaW]);

  const median = sorted[Math.floor(sorted.length / 2)]?.nav ?? 0;

  return (
    <div className="border mb-5" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-card)" }}>
      <div className="px-3 py-2 border-b flex items-baseline justify-between"
        style={{ borderColor: "var(--ledger-rule)" }}>
        <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em]"
          style={{ color: "var(--ledger-ink)" }}>
          League NAV Rankings
        </span>
        <span className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.12em]"
          style={{ color: "var(--ledger-ink-faint)" }}>
          Roster Asset Value · {sorted.length} teams
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="w-full"
          style={{ maxWidth: chartW, minWidth: 340 }}
          role="img"
          aria-label={`Bar chart ranking ${sorted.length} NHL teams by roster NAV. Top: ${sorted[0]?.name} at ${Math.round(sorted[0]?.nav ?? 0)}`}
        >
          {/* Median reference line */}
          <line
            x1={labelW + xScale(median)} y1={margin.top - 4}
            x2={labelW + xScale(median)} y2={chartH - margin.bottom}
            stroke="var(--ledger-ink-faint)"
            strokeWidth={1}
            strokeDasharray="3,3"
            opacity={0.35}
          />
          <text
            x={labelW + xScale(median)}
            y={margin.top - 8}
            textAnchor="middle"
            fill="var(--ledger-ink-faint)"
            fontSize={7}
            fontFamily="'Courier Prime', 'Courier New', monospace"
            fontWeight={700}
          >
            MEDIAN
          </text>

          {sorted.map((d, i) => {
            const y = margin.top + i * (barH + gap);
            const barW = Math.max(2, xScale(d.nav));
            const fill = PHASE_COLORS[d.phase] || "var(--ledger-ink)";
            const isHovered = hoveredIdx === i;

            return (
              <g key={d.abbrev}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{ cursor: "default" }}
              >
                {/* Full-row hit target */}
                <rect x={0} y={y} width={chartW} height={barH} fill="transparent" />

                {/* Row highlight on hover */}
                {isHovered && (
                  <rect x={0} y={y} width={chartW} height={barH}
                    fill="var(--ledger-ink)" opacity={0.04} rx={2} />
                )}

                {/* Rank + team abbreviation */}
                <text
                  x={labelW - 6}
                  y={y + barH / 2 + 1}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="var(--ledger-ink)"
                  fontSize={10}
                  fontFamily="'Courier Prime', 'Courier New', monospace"
                  fontWeight={isHovered ? 900 : 700}
                >
                  {d.abbrev}
                </text>

                {/* Bar */}
                <rect
                  x={labelW}
                  y={y + 3}
                  width={barW}
                  height={barH - 6}
                  fill={fill}
                  opacity={isHovered ? 1 : 0.8}
                  rx={2}
                />

                {/* NAV value */}
                <text
                  x={chartW - margin.right}
                  y={y + barH / 2 + 1}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill={fill}
                  fontSize={10}
                  fontFamily="'Courier Prime', 'Courier New', monospace"
                  fontWeight={700}
                >
                  {Math.round(d.nav).toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Hovered team tooltip — name + phase, rendered above all bars */}
          {hoveredIdx !== null && sorted[hoveredIdx] && (() => {
            const d = sorted[hoveredIdx];
            const y = margin.top + hoveredIdx * (barH + gap);
            const barW = xScale(d.nav);
            return (
              <foreignObject
                x={labelW + Math.min(barW + 6, barAreaW * 0.4)}
                y={y - 2}
                width={200}
                height={barH + 4}
                style={{ overflow: "visible", pointerEvents: "none" }}
              >
                <div style={{
                  background: "var(--paper-card, var(--paper-bg))",
                  border: "1px solid var(--ledger-rule, #ccc)",
                  borderRadius: 3,
                  padding: "2px 8px",
                  fontFamily: "'Courier Prime', monospace",
                  fontSize: 9,
                  color: "var(--ledger-ink)",
                  whiteSpace: "nowrap",
                  width: "fit-content",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}>
                  {d.name} · {d.phase} · GD {d.goalDiff > 0 ? "+" : ""}{d.goalDiff}
                </div>
              </foreignObject>
            );
          })()}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-t"
        style={{ borderColor: "var(--ledger-rule)" }}>
        {Object.entries(PHASE_COLORS).map(([phase, color]) => (
          <div key={phase} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ background: color, opacity: 0.85 }} />
            <span className="font-mono text-[8px] font-bold uppercase tracking-[0.1em]"
              style={{ color: "var(--ledger-ink-faint)" }}>
              {phase}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
