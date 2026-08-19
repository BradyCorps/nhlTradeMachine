"use client";

// ── NavTrajectoryChart — horizontal diverging bar chart ────────
// Shows each NAV component as a horizontal bar extending left
// (negative) or right (positive) from a centre zero line. Much
// more readable than the old vertical waterfall on mobile.

import React, { useState } from "react";
import { scaleLinear } from "d3-scale";

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

export default function NavTrajectoryChart({ stages, total, playerName }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (stages.length === 0) return null;

  const barH = 22;
  const gap = 4;
  const labelW = 44;
  const valueW = 52;
  const margin = { top: 4, right: 8, bottom: 4, left: 0 };
  const chartH = margin.top + margin.bottom + stages.length * (barH + gap) - gap;
  const chartW = 400;
  const barAreaW = chartW - labelW - valueW - margin.left - margin.right;

  const maxAbs = Math.max(10, ...stages.map(s => Math.abs(s.value)));
  const xScale = scaleLinear()
    .domain([-maxAbs * 1.05, maxAbs * 1.05])
    .range([0, barAreaW]);

  const zeroX = labelW + xScale(0);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em]"
          style={{ color: "var(--ledger-ink-faint)" }}>
          Value Breakdown
        </span>
        <span className="font-mono text-[14px] sm:text-[16px] font-black"
          style={{ color: "var(--ledger-ink)" }}>
          {total > 0 ? "+" : ""}{total}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${chartW} ${chartH}`}
        className="w-full"
        style={{ maxWidth: chartW }}
        role="img"
        aria-label={`NAV breakdown${playerName ? ` for ${playerName}` : ""}: ${stages.map(s => `${s.label} ${s.value > 0 ? "+" : ""}${s.value}`).join(", ")}, total ${total}`}
      >
        {/* Zero axis */}
        <line
          x1={zeroX} y1={margin.top - 2}
          x2={zeroX} y2={chartH - margin.bottom + 2}
          stroke="var(--ledger-ink)"
          strokeWidth={1}
          opacity={0.25}
        />

        {stages.map((s, i) => {
          const y = margin.top + i * (barH + gap);
          const isPositive = s.value >= 0;
          const fill = isPositive ? POSITIVE_COLOR : NEGATIVE_COLOR;
          const barStart = isPositive ? zeroX : labelW + xScale(s.value);
          const barW = Math.max(2, Math.abs(xScale(s.value) - xScale(0)));
          const isHovered = hoveredIdx === i;

          return (
            <g key={i}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onTouchStart={() => setHoveredIdx(i)}
              onTouchEnd={() => setHoveredIdx(null)}
              style={{ cursor: "default" }}
            >
              {/* Hit target — full row */}
              <rect
                x={0} y={y} width={chartW} height={barH}
                fill="transparent"
              />

              {/* Row background on hover */}
              {isHovered && (
                <rect
                  x={0} y={y} width={chartW} height={barH}
                  fill="var(--ledger-ink)"
                  opacity={0.04}
                  rx={2}
                />
              )}

              {/* Label */}
              <text
                x={labelW - 6}
                y={y + barH / 2 + 1}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--ledger-ink)"
                fontSize={11}
                fontFamily="'Courier Prime', 'Courier New', monospace"
                fontWeight={700}
              >
                {s.label}
              </text>

              {/* Bar */}
              <rect
                x={barStart}
                y={y + 3}
                width={barW}
                height={barH - 6}
                fill={fill}
                opacity={isHovered ? 1 : 0.8}
                rx={2}
              />

              {/* Value */}
              <text
                x={chartW - margin.right}
                y={y + barH / 2 + 1}
                textAnchor="end"
                dominantBaseline="middle"
                fill={fill}
                fontSize={12}
                fontFamily="'Courier Prime', 'Courier New', monospace"
                fontWeight={700}
              >
                {s.value > 0 ? "+" : ""}{s.value}
              </text>

              {/* Tooltip on hover */}
              {isHovered && (
                <foreignObject
                  x={labelW}
                  y={y + barH}
                  width={barAreaW + valueW}
                  height={24}
                  style={{ overflow: "visible", pointerEvents: "none" }}
                >
                  <div style={{
                    background: "var(--paper-card, var(--paper-bg))",
                    border: "1px solid var(--ledger-rule, #ccc)",
                    borderRadius: 3,
                    padding: "3px 8px",
                    fontFamily: "'Courier Prime', monospace",
                    fontSize: 10,
                    color: "var(--ledger-ink)",
                    whiteSpace: "nowrap",
                    width: "fit-content",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  }}>
                    {s.desc}
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
