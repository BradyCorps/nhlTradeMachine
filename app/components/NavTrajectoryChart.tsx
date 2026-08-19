"use client";

// ── NavTrajectoryChart — D3 waterfall of NAV components ──────────
// Renders a stacked waterfall showing how each NAV component
// (offense, defense, age, contract surplus, adjustments) builds
// to the final trade value. Uses d3-scale for positioning and
// d3-shape for the stacked bars. When multi-season data is
// available, this component can extend to a trajectory line chart.

import React, { useMemo, useState } from "react";
import { scaleLinear, scaleBand } from "d3-scale";

export interface NavStage {
  label: string;
  value: number;
  desc: string;
}

interface Props {
  stages: NavStage[];
  total: number;
  playerName?: string;
}

const POSITIVE_COLOR = "var(--ledger-green, #2a7a3f)";
const NEGATIVE_COLOR = "var(--ledger-red, #b83020)";
const TOTAL_COLOR = "var(--ledger-ink, #1a1a18)";

export default function NavTrajectoryChart({ stages, total, playerName }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const chartData = useMemo(() => {
    const items: { label: string; value: number; desc: string; start: number; end: number; isTotal: boolean }[] = [];
    let running = 0;

    for (const s of stages) {
      const start = running;
      const end = running + s.value;
      items.push({ label: s.label, value: s.value, desc: s.desc, start, end, isTotal: false });
      running = end;
    }

    items.push({ label: "NAV", value: total, desc: "Total X-NAV trade value", start: 0, end: total, isTotal: true });

    return items;
  }, [stages, total]);

  if (stages.length === 0) return null;

  const margin = { top: 24, right: 12, bottom: 40, left: 12 };
  const barWidth = 36;
  const gap = 8;
  const chartW = margin.left + margin.right + chartData.length * (barWidth + gap);
  const chartH = 200;
  const innerH = chartH - margin.top - margin.bottom;

  const allValues = chartData.flatMap(d => [d.start, d.end]);
  const minVal = Math.min(0, ...allValues);
  const maxVal = Math.max(0, ...allValues);
  const padding = (maxVal - minVal) * 0.1 || 10;

  const yScale = scaleLinear()
    .domain([minVal - padding, maxVal + padding])
    .range([innerH, 0]);

  const zeroY = yScale(0);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-[9px] font-black uppercase tracking-[0.18em]"
          style={{ color: "var(--ledger-ink-faint)" }}>
          Value Waterfall
        </span>
        <span className="font-mono text-[13px] font-black"
          style={{ color: "var(--ledger-ink)" }}>
          {total > 0 ? "+" : ""}{total}
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="w-full"
          style={{ maxWidth: chartW, minWidth: 280 }}
          role="img"
          aria-label={`NAV waterfall chart${playerName ? ` for ${playerName}` : ""}: ${stages.map(s => `${s.label} ${s.value > 0 ? "+" : ""}${s.value}`).join(", ")}, total ${total}`}
        >
          {/* Zero line */}
          <line
            x1={margin.left - 4}
            y1={margin.top + zeroY}
            x2={chartW - margin.right}
            y2={margin.top + zeroY}
            stroke="var(--ledger-ink)"
            strokeWidth={0.8}
            opacity={0.3}
          />
          <text
            x={margin.left - 6}
            y={margin.top + zeroY + 3}
            textAnchor="end"
            fill="var(--ledger-ink-faint)"
            fontSize={7}
            fontFamily="'Courier Prime', monospace"
          >
            0
          </text>

          {chartData.map((d, i) => {
            const x = margin.left + i * (barWidth + gap);
            const top = Math.min(d.start, d.end);
            const bottom = Math.max(d.start, d.end);
            const barY = margin.top + yScale(bottom);
            const barH = Math.max(1, yScale(top) - yScale(bottom));
            const isPositive = d.value >= 0;
            const fill = d.isTotal ? TOTAL_COLOR : isPositive ? POSITIVE_COLOR : NEGATIVE_COLOR;
            const isHovered = hoveredIdx === i;

            return (
              <g key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{ cursor: "default" }}
              >
                {/* Connector line from previous bar */}
                {i > 0 && !d.isTotal && (
                  <line
                    x1={x - gap}
                    y1={margin.top + yScale(d.start)}
                    x2={x}
                    y2={margin.top + yScale(d.start)}
                    stroke="var(--ledger-ink-faint)"
                    strokeWidth={0.8}
                    strokeDasharray="2,2"
                    opacity={0.4}
                  />
                )}

                {/* Bar */}
                <rect
                  x={x}
                  y={barY}
                  width={barWidth}
                  height={barH}
                  fill={fill}
                  opacity={isHovered ? 1 : d.isTotal ? 0.9 : 0.75}
                  rx={1}
                />

                {/* Value label above/below bar */}
                <text
                  x={x + barWidth / 2}
                  y={isPositive ? barY - 4 : barY + barH + 10}
                  textAnchor="middle"
                  fill={fill}
                  fontSize={8}
                  fontFamily="'Courier Prime', monospace"
                  fontWeight={700}
                >
                  {d.isTotal ? d.value : `${d.value > 0 ? "+" : ""}${d.value}`}
                </text>

                {/* Label below */}
                <text
                  x={x + barWidth / 2}
                  y={chartH - margin.bottom + 14}
                  textAnchor="middle"
                  fill="var(--ledger-ink)"
                  fontSize={7.5}
                  fontFamily="'Courier Prime', monospace"
                  fontWeight={700}
                  letterSpacing="0.04em"
                >
                  {d.label}
                </text>

                {/* Hover tooltip */}
                {isHovered && (
                  <foreignObject
                    x={x + barWidth / 2 - 60}
                    y={barY - 30}
                    width={120}
                    height={24}
                    style={{ overflow: "visible" }}
                  >
                    <div style={{
                      background: "var(--paper-card, var(--paper-bg))",
                      border: "0.5px solid var(--ledger-ink)",
                      borderRadius: 2,
                      padding: "2px 4px",
                      fontFamily: "'Courier Prime', monospace",
                      fontSize: 7,
                      color: "var(--ledger-ink)",
                      whiteSpace: "nowrap",
                      width: "fit-content",
                      transform: "translateX(-50%)",
                      marginLeft: "50%",
                    }}>
                      {d.desc}
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
