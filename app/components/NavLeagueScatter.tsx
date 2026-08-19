"use client";

// ── NavLeagueScatter — league-context scatter plot ─────────────
// Plots same-position peers on a 2D scatter (OFF value vs DEF
// value by default) so the reader can see where a player sits
// relative to the league at a glance. The current player is
// highlighted with a larger, labeled marker.

import React, { useState, useMemo } from "react";
import { scaleLinear } from "d3-scale";

export interface ScatterPeer {
  id: string;
  name: string;
  teamId: string;
  off: number;
  def: number;
  nav: number;
  age: number;
}

interface Props {
  peers: ScatterPeer[];
  currentPlayer: ScatterPeer;
  playerName: string;
}

const CURRENT_COLOR = "var(--ledger-red, #b83020)";
const PEER_COLOR = "var(--ledger-ink, #1a1a18)";
const QUADRANT_LABELS = [
  { x: "right", y: "top", label: "Elite" },
  { x: "left", y: "top", label: "Defensive" },
  { x: "right", y: "bottom", label: "Offensive" },
  { x: "left", y: "bottom", label: "Depth" },
];

export default function NavLeagueScatter({ peers, currentPlayer, playerName }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const all = useMemo(() => [currentPlayer, ...peers], [currentPlayer, peers]);

  if (all.length < 5) return null;

  const margin = { top: 24, right: 16, bottom: 36, left: 44 };
  const W = 400;
  const H = 280;
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const offVals = all.map(p => p.off);
  const defVals = all.map(p => p.def);
  const offPad = (Math.max(...offVals) - Math.min(...offVals)) * 0.08 || 20;
  const defPad = (Math.max(...defVals) - Math.min(...defVals)) * 0.08 || 10;

  const xScale = scaleLinear()
    .domain([Math.min(...offVals) - offPad, Math.max(...offVals) + offPad])
    .range([0, innerW]);

  const yScale = scaleLinear()
    .domain([Math.min(...defVals) - defPad, Math.max(...defVals) + defPad])
    .range([innerH, 0]);

  const medOff = offVals.sort((a, b) => a - b)[Math.floor(offVals.length / 2)];
  const medDef = defVals.sort((a, b) => a - b)[Math.floor(defVals.length / 2)];

  const hoveredPeer = hoveredId ? all.find(p => p.id === hoveredId) : null;

  return (
    <div className="border p-4 mb-4" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-card, var(--paper-inset))" }}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em]"
          style={{ color: "var(--ledger-ink-faint)" }}>
          League Context
        </span>
        <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.12em]"
          style={{ color: "var(--ledger-ink-faint)" }}>
          {all.length} same-position peers
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxWidth: W }}
        role="img"
        aria-label={`Scatter plot of offensive vs defensive value for ${playerName} and ${peers.length} position peers`}
      >
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Quadrant lines at median */}
          <line
            x1={xScale(medOff)} y1={0}
            x2={xScale(medOff)} y2={innerH}
            stroke="var(--ledger-ink-faint)"
            strokeWidth={0.8}
            strokeDasharray="3,3"
            opacity={0.3}
          />
          <line
            x1={0} y1={yScale(medDef)}
            x2={innerW} y2={yScale(medDef)}
            stroke="var(--ledger-ink-faint)"
            strokeWidth={0.8}
            strokeDasharray="3,3"
            opacity={0.3}
          />

          {/* Quadrant labels */}
          <text x={innerW - 4} y={8} textAnchor="end"
            fill="var(--ledger-ink-faint)" fontSize={7} opacity={0.4}
            fontFamily="'Courier Prime', monospace" fontWeight={700}>
            ELITE TWO-WAY
          </text>
          <text x={4} y={8} textAnchor="start"
            fill="var(--ledger-ink-faint)" fontSize={7} opacity={0.4}
            fontFamily="'Courier Prime', monospace" fontWeight={700}>
            DEFENSIVE
          </text>
          <text x={innerW - 4} y={innerH - 4} textAnchor="end"
            fill="var(--ledger-ink-faint)" fontSize={7} opacity={0.4}
            fontFamily="'Courier Prime', monospace" fontWeight={700}>
            OFFENSIVE
          </text>
          <text x={4} y={innerH - 4} textAnchor="start"
            fill="var(--ledger-ink-faint)" fontSize={7} opacity={0.4}
            fontFamily="'Courier Prime', monospace" fontWeight={700}>
            DEPTH
          </text>

          {/* Peer dots */}
          {peers.map(p => {
            const cx = xScale(p.off);
            const cy = yScale(p.def);
            const isHov = hoveredId === p.id;
            return (
              <circle
                key={p.id}
                cx={cx} cy={cy}
                r={isHov ? 5 : 3.5}
                fill={PEER_COLOR}
                opacity={isHov ? 0.7 : 0.18}
                stroke={isHov ? PEER_COLOR : "none"}
                strokeWidth={isHov ? 1 : 0}
                onMouseEnter={() => setHoveredId(p.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ cursor: "default", transition: "opacity 0.15s" }}
              />
            );
          })}

          {/* Current player — on top */}
          <circle
            cx={xScale(currentPlayer.off)}
            cy={yScale(currentPlayer.def)}
            r={6}
            fill={CURRENT_COLOR}
            stroke="var(--paper-bg, #fff)"
            strokeWidth={2}
          />
          <text
            x={xScale(currentPlayer.off)}
            y={yScale(currentPlayer.def) - 10}
            textAnchor="middle"
            fill={CURRENT_COLOR}
            fontSize={9}
            fontFamily="'Courier Prime', monospace"
            fontWeight={700}
          >
            {playerName.split(" ").pop()}
          </text>

          {/* Hovered peer label */}
          {hoveredPeer && hoveredPeer.id !== currentPlayer.id && (
            <g>
              <rect
                x={xScale(hoveredPeer.off) - 2}
                y={yScale(hoveredPeer.def) - 22}
                width={hoveredPeer.name.length * 5.5 + 12}
                height={16}
                fill="var(--paper-card, var(--paper-bg))"
                stroke="var(--ledger-rule)"
                strokeWidth={0.5}
                rx={2}
              />
              <text
                x={xScale(hoveredPeer.off) + 2}
                y={yScale(hoveredPeer.def) - 11}
                fill="var(--ledger-ink)"
                fontSize={8}
                fontFamily="'Courier Prime', monospace"
                fontWeight={700}
              >
                {hoveredPeer.name} ({hoveredPeer.nav})
              </text>
            </g>
          )}
        </g>

        {/* Axis labels */}
        <text
          x={W / 2} y={H - 4}
          textAnchor="middle"
          fill="var(--ledger-ink-faint)"
          fontSize={9}
          fontFamily="'Courier Prime', monospace"
          fontWeight={700}
          letterSpacing="0.1em"
        >
          OFFENSIVE VALUE
        </text>
        <text
          x={10} y={H / 2}
          textAnchor="middle"
          fill="var(--ledger-ink-faint)"
          fontSize={9}
          fontFamily="'Courier Prime', monospace"
          fontWeight={700}
          letterSpacing="0.1em"
          transform={`rotate(-90,10,${H / 2})`}
        >
          DEFENSIVE VALUE
        </text>
      </svg>
    </div>
  );
}
