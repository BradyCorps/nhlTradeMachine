"use client";

import React, { useMemo } from "react";
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
  const sorted = useMemo(
    () => [...data].sort((a, b) => b.nav - a.nav),
    [data],
  );

  if (sorted.length === 0) return null;

  const margin = { top: 28, right: 52, bottom: 12, left: 42 };
  const barHeight = 18;
  const gap = 2;
  const totalHeight = margin.top + margin.bottom + sorted.length * (barHeight + gap);
  const chartWidth = 600;
  const innerW = chartWidth - margin.left - margin.right;

  const maxNav = Math.max(...sorted.map((d) => d.nav));
  const xScale = scaleLinear()
    .domain([0, maxNav * 1.05])
    .range([0, innerW]);

  const yScale = scaleBand<number>()
    .domain(sorted.map((_, i) => i))
    .range([0, sorted.length * (barHeight + gap)])
    .paddingInner(gap / (barHeight + gap));

  const median = sorted[Math.floor(sorted.length / 2)]?.nav ?? 0;

  return (
    <div
      className="border mb-5 overflow-x-auto"
      style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-card)" }}
    >
      <div
        className="px-3 py-2 border-b flex items-baseline gap-3"
        style={{ borderColor: "var(--ledger-rule)" }}
      >
        <span className="font-mono text-[10px] font-black uppercase tracking-[0.2em]"
          style={{ color: "var(--ledger-ink)" }}>
          League NAV Rankings
        </span>
        <span className="font-mono text-[8px] uppercase tracking-[0.12em]"
          style={{ color: "var(--ledger-ink-faint)" }}>
          Roster Asset Value
        </span>
      </div>

      <svg
        viewBox={`0 0 ${chartWidth} ${totalHeight}`}
        className="w-full"
        style={{ maxWidth: chartWidth, minWidth: 320 }}
      >
        {/* Median line */}
        <line
          x1={margin.left + xScale(median)}
          y1={margin.top - 6}
          x2={margin.left + xScale(median)}
          y2={totalHeight - margin.bottom}
          stroke="var(--ledger-ink-faint)"
          strokeWidth={1}
          strokeDasharray="3,3"
          opacity={0.5}
        />
        <text
          x={margin.left + xScale(median)}
          y={margin.top - 10}
          textAnchor="middle"
          fill="var(--ledger-ink-faint)"
          fontSize={7}
          fontFamily="'Courier Prime', 'Courier New', monospace"
          fontWeight={700}
        >
          MEDIAN
        </text>

        {sorted.map((d, i) => {
          const barW = xScale(d.nav);
          const y = margin.top + (yScale(i) ?? 0);
          const fill = PHASE_COLORS[d.phase] || "var(--ledger-ink)";

          return (
            <g key={d.abbrev}>
              {/* Rank + abbreviation */}
              <text
                x={margin.left - 4}
                y={y + barHeight / 2 + 1}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--ledger-ink)"
                fontSize={8}
                fontFamily="'Courier Prime', 'Courier New', monospace"
                fontWeight={700}
              >
                {d.abbrev}
              </text>

              {/* Bar */}
              <rect
                x={margin.left}
                y={y}
                width={Math.max(0, barW)}
                height={barHeight}
                fill={fill}
                opacity={0.85}
                rx={1}
              />

              {/* NAV value label */}
              <text
                x={margin.left + barW + 4}
                y={y + barHeight / 2 + 1}
                textAnchor="start"
                dominantBaseline="middle"
                fill="var(--ledger-ink)"
                fontSize={7.5}
                fontFamily="'Courier Prime', 'Courier New', monospace"
                fontWeight={700}
              >
                {Math.round(d.nav).toLocaleString()}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-t"
        style={{ borderColor: "var(--ledger-rule)" }}
      >
        {Object.entries(PHASE_COLORS).map(([phase, color]) => (
          <div key={phase} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ background: color, opacity: 0.85 }}
            />
            <span
              className="font-mono text-[8px] font-bold uppercase tracking-[0.1em]"
              style={{ color: "var(--ledger-ink-faint)" }}
            >
              {phase}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
