"use client";

// ── NavLeagueScatter — league-context scatter plot ─────────────
// Plots same-position peers on a 2D scatter (OFF value vs DEF
// value by default) so the reader can see where a player sits
// relative to the league at a glance. The current player is
// highlighted with a larger, labeled marker.
//
// Supports brushable selection: drag a rectangle to list the
// players inside it.

import React, { useState, useMemo, useRef, useCallback } from "react";
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
  /** Names the exact cohort the cloud is drawn from (e.g. "forwards · ≥20 GP ·
   *  2025-26"), so the reader knows who these dots are, not just "peers". */
  cohortLabel?: string;
}

const CURRENT_COLOR = "var(--ledger-red, #b83020)";
const PEER_COLOR = "var(--ledger-ink, #1a1a18)";

// Fixed layout — module-level so the coordinate callbacks have a stable
// reference (no changing hook dependency).
const margin = { top: 24, right: 16, bottom: 36, left: 44 };
const W = 400;
const H = 280;

// ── Hexbin density (self-contained; no d3-hexbin dependency) ────
// With ~250 peers the cloud overplots near the median and a reader can't tell a
// crowded region from a sparse one. A faint single-hue hex wash UNDER the dots
// carries that density (sequential: darker = more players in the cell) without
// competing with the categorical dots on top. Standard pointy-top hex binning,
// ported from d3-hexbin's core so the tessellation is exact.
const HEX_R = 16;
const HEX_PATH = (() => {
  const a = Math.PI / 3;
  return Array.from({ length: 6 }, (_, i) => {
    const ang = i * a;
    return `${i === 0 ? "M" : "L"}${(Math.sin(ang) * HEX_R).toFixed(2)},${(-Math.cos(ang) * HEX_R).toFixed(2)}`;
  }).join("") + "Z";
})();

interface HexCell { x: number; y: number; count: number }
function hexbinCells(pts: { x: number; y: number }[], radius: number): HexCell[] {
  const dx = radius * 2 * Math.sin(Math.PI / 3);
  const dy = radius * 1.5;
  const map = new Map<string, HexCell>();
  for (const { x, y } of pts) {
    const py = y / dy;
    let pj = Math.round(py);
    let pi = Math.round(x / dx - (pj & 1 ? 0.5 : 0));
    const py1 = py - pj;
    if (Math.abs(py1) * 3 > 1) {
      const px = x / dx - (pj & 1 ? 0.5 : 0);
      const px1 = px - pi;
      const pi2 = pi + (px < pi ? -1 : 1) / 2;
      const pj2 = pj + (py < pj ? -1 : 1);
      const px2 = px - pi2;
      const py2 = py - pj2;
      if (px1 * px1 + py1 * py1 > px2 * px2 + py2 * py2) { pi = pi2 + (pj & 1 ? 1 : -1) / 2; pj = pj2; }
    }
    const key = `${pi}-${pj}`;
    const cell = map.get(key);
    if (cell) cell.count += 1;
    else map.set(key, { x: (pi + (pj & 1 ? 0.5 : 0)) * dx, y: pj * dy, count: 1 });
  }
  return [...map.values()];
}

interface BrushRect {
  x0: number; y0: number;
  x1: number; y1: number;
}

export default function NavLeagueScatter({ peers, currentPlayer, playerName, cohortLabel }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Brush state
  const [brushing, setBrushing] = useState(false);
  const [brush, setBrush] = useState<BrushRect | null>(null);
  const [activeBrush, setActiveBrush] = useState<BrushRect | null>(null);
  const brushStartRef = useRef<{ x: number; y: number } | null>(null);

  const all = useMemo(() => [currentPlayer, ...peers], [currentPlayer, peers]);

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

  const sortedOff = [...offVals].sort((a, b) => a - b);
  const sortedDef = [...defVals].sort((a, b) => a - b);
  const medOff = sortedOff[Math.floor(sortedOff.length / 2)];
  const medDef = sortedDef[Math.floor(sortedDef.length / 2)];

  // Which quadrant the current player falls in — spoken in the aria label so a
  // screen-reader user learns WHERE he sits, not just that a scatter exists.
  const playerQuadrant = currentPlayer.off >= medOff
    ? (currentPlayer.def >= medDef ? "elite two-way" : "offensive")
    : (currentPlayer.def >= medDef ? "defensive" : "depth");

  const hoveredPeer = hoveredId ? all.find(p => p.id === hoveredId) : null;

  // Convert mouse event to SVG-space coordinates
  const toSvgCoords = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX - margin.left,
      y: (e.clientY - rect.top) * scaleY - margin.top,
    };
  }, []);

  // Brush handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start brush on background clicks (not on dots)
    const target = e.target as SVGElement;
    if (target.tagName === "circle") return;
    const pt = toSvgCoords(e);
    if (!pt) return;
    brushStartRef.current = pt;
    setBrushing(true);
    setBrush(null);
    setActiveBrush(null);
    setHoveredId(null);
  }, [toSvgCoords]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (brushing && brushStartRef.current) {
      const pt = toSvgCoords(e);
      if (!pt) return;
      const r: BrushRect = {
        x0: Math.min(brushStartRef.current.x, pt.x),
        y0: Math.min(brushStartRef.current.y, pt.y),
        x1: Math.max(brushStartRef.current.x, pt.x),
        y1: Math.max(brushStartRef.current.y, pt.y),
      };
      setBrush(r);
    }
  }, [brushing, toSvgCoords]);

  const onMouseUp = useCallback(() => {
    if (brushing && brush) {
      const width = brush.x1 - brush.x0;
      const height = brush.y1 - brush.y0;
      if (width > 5 || height > 5) {
        setActiveBrush(brush);
      } else {
        setActiveBrush(null);
      }
    }
    setBrushing(false);
    setBrush(null);
    brushStartRef.current = null;
  }, [brushing, brush]);

  // Players inside the active brush
  const brushedPlayers = useMemo(() => {
    if (!activeBrush) return [];
    return all.filter(p => {
      const cx = xScale(p.off);
      const cy = yScale(p.def);
      return cx >= activeBrush.x0 && cx <= activeBrush.x1
        && cy >= activeBrush.y0 && cy <= activeBrush.y1;
    }).sort((a, b) => b.nav - a.nav);
  }, [activeBrush, all, xScale, yScale]);

  // Density hexbins for the whole cloud, in plot-pixel space. Cells with a
  // single player are dropped so the wash marks genuine crowding, not scatter.
  const hexBins = useMemo(() => {
    const cells = hexbinCells(all.map(p => ({ x: xScale(p.off), y: yScale(p.def) })), HEX_R)
      .filter(c => c.count >= 2);
    const maxCount = cells.reduce((m, c) => Math.max(m, c.count), 1);
    return { cells, maxCount };
  }, [all, xScale, yScale]);

  // Too few peers to place a meaningful league cloud. Guarded AFTER every hook
  // so hook order stays constant across renders (rules-of-hooks).
  if (all.length < 5) return null;

  // Current brush rect (while dragging or active)
  const displayBrush = brush || activeBrush;

  // Hover tooltip position in container-relative pixels
  const getTooltipStyle = (): React.CSSProperties | null => {
    if (!hoveredPeer || hoveredPeer.id === currentPlayer.id || !svgRef.current || !containerRef.current) return null;
    const svgRect = svgRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const scaleRatio = svgRect.width / W;
    const dotX = (margin.left + xScale(hoveredPeer.off)) * scaleRatio + svgRect.left - containerRect.left;
    const dotY = (margin.top + yScale(hoveredPeer.def)) * scaleRatio + svgRect.top - containerRect.top;
    return {
      position: "absolute" as const,
      left: dotX,
      top: dotY - 28,
      transform: "translateX(-50%)",
      pointerEvents: "none" as const,
      zIndex: 10,
    };
  };

  const tooltipStyle = getTooltipStyle();

  return (
    <div ref={containerRef} className="border p-4 mb-4" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-card, var(--paper-inset))", position: "relative" }}>
      <div className="flex items-baseline justify-between mb-0.5">
        <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em]"
          style={{ color: "var(--ledger-ink-faint)" }}>
          League Context
        </span>
        <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.12em]"
          style={{ color: "var(--ledger-ink-faint)" }}>
          {all.length} plotted
          {activeBrush ? ` · ${brushedPlayers.length} selected` : " · drag to select"}
        </span>
      </div>
      <div className="mb-2 font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.12em]"
        style={{ color: "var(--ledger-ink-faint)" }}>
        Ranked among {cohortLabel ?? "same-position peers"}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxWidth: W, cursor: brushing ? "crosshair" : "default" }}
        role="img"
        aria-label={`Scatter plot of offensive value (horizontal) vs defensive value (vertical) for ${playerName} and ${peers.length} same-position peers, split into four quadrants at the league median, with denser regions of the league shaded. ${playerName} sits in the ${playerQuadrant} quadrant.`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          if (brushing) {
            setBrushing(false);
            setBrush(null);
            brushStartRef.current = null;
          }
          setHoveredId(null);
        }}
      >
        <defs>
          <clipPath id="scatter-plot-clip">
            <rect x={0} y={0} width={innerW} height={innerH} />
          </clipPath>
        </defs>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Density wash — darker where more of the league sits (under the dots) */}
          <g clipPath="url(#scatter-plot-clip)">
            {hexBins.cells.map((c, i) => (
              <path
                key={`hex-${i}`}
                d={HEX_PATH}
                transform={`translate(${c.x.toFixed(2)},${c.y.toFixed(2)})`}
                fill="var(--ledger-ink)"
                opacity={0.04 + ((c.count - 1) / Math.max(1, hexBins.maxCount - 1)) * 0.14}
                stroke="none"
              />
            ))}
          </g>

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

          {/* Axis ticks — numeric scale so a reader can read a dot's OFF/DEF
              value off the plot, not just its quadrant. */}
          {xScale.ticks(4).map(v => (
            <g key={`xt-${v}`}>
              <line x1={xScale(v)} y1={innerH} x2={xScale(v)} y2={innerH + 3}
                stroke="var(--ledger-ink-faint)" strokeWidth={0.6} opacity={0.5} />
              <text x={xScale(v)} y={innerH + 11} textAnchor="middle"
                fill="var(--ledger-ink-faint)" fontSize={7} opacity={0.7}
                fontFamily="'Courier Prime', monospace">
                {Math.round(v)}
              </text>
            </g>
          ))}
          {yScale.ticks(4).map(v => (
            <g key={`yt-${v}`}>
              <line x1={-3} y1={yScale(v)} x2={0} y2={yScale(v)}
                stroke="var(--ledger-ink-faint)" strokeWidth={0.6} opacity={0.5} />
              <text x={-5} y={yScale(v) + 2.5} textAnchor="end"
                fill="var(--ledger-ink-faint)" fontSize={7} opacity={0.7}
                fontFamily="'Courier Prime', monospace">
                {Math.round(v)}
              </text>
            </g>
          ))}

          {/* Quadrant labels */}
          <text x={innerW - 4} y={8} textAnchor="end"
            fill="var(--ledger-ink-faint)" fontSize={9} opacity={0.55}
            fontFamily="'Courier Prime', monospace" fontWeight={700}>
            ELITE TWO-WAY
          </text>
          <text x={4} y={8} textAnchor="start"
            fill="var(--ledger-ink-faint)" fontSize={9} opacity={0.55}
            fontFamily="'Courier Prime', monospace" fontWeight={700}>
            DEFENSIVE
          </text>
          <text x={innerW - 4} y={innerH - 4} textAnchor="end"
            fill="var(--ledger-ink-faint)" fontSize={9} opacity={0.55}
            fontFamily="'Courier Prime', monospace" fontWeight={700}>
            OFFENSIVE
          </text>
          <text x={4} y={innerH - 4} textAnchor="start"
            fill="var(--ledger-ink-faint)" fontSize={9} opacity={0.55}
            fontFamily="'Courier Prime', monospace" fontWeight={700}>
            DEPTH
          </text>

          {/* Brush rectangle */}
          {displayBrush && (
            <rect
              x={displayBrush.x0}
              y={displayBrush.y0}
              width={displayBrush.x1 - displayBrush.x0}
              height={displayBrush.y1 - displayBrush.y0}
              fill="var(--ledger-ink)"
              opacity={0.06}
              stroke="var(--ledger-ink)"
              strokeWidth={1}
              strokeOpacity={0.3}
              strokeDasharray="3,2"
              rx={2}
            />
          )}

          {/* Peer dots */}
          {peers.map(p => {
            const cx = xScale(p.off);
            const cy = yScale(p.def);
            const isHov = hoveredId === p.id;
            const isBrushed = activeBrush
              && cx >= activeBrush.x0 && cx <= activeBrush.x1
              && cy >= activeBrush.y0 && cy <= activeBrush.y1;
            return (
              <circle
                key={p.id}
                cx={cx} cy={cy}
                r={isHov ? 5 : isBrushed ? 4.5 : 3.5}
                fill={isBrushed ? "var(--ledger-green, #2a7a3f)" : PEER_COLOR}
                opacity={isHov ? 0.85 : isBrushed ? 0.6 : 0.28}
                stroke={isHov ? PEER_COLOR : isBrushed ? "var(--ledger-green, #2a7a3f)" : "none"}
                strokeWidth={isHov || isBrushed ? 1 : 0}
                onMouseEnter={() => { if (!brushing) setHoveredId(p.id); }}
                onMouseLeave={() => { if (!brushing) setHoveredId(null); }}
                onClick={() => setHoveredId(prev => (prev === p.id ? null : p.id))}
                style={{ cursor: "pointer", transition: "opacity 0.15s, r 0.15s" }}
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

      {/* HTML hover tooltip — outside SVG so it never clips */}
      {tooltipStyle && hoveredPeer && hoveredPeer.id !== currentPlayer.id && (
        <div style={tooltipStyle}>
          <div style={{
            background: "var(--paper-card, var(--paper-bg))",
            border: "1px solid var(--ledger-rule, #ccc)",
            borderRadius: 3,
            padding: "3px 7px",
            fontFamily: "'Courier Prime', monospace",
            fontSize: 10,
            color: "var(--ledger-ink)",
            whiteSpace: "nowrap",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            textAlign: "center",
          }}>
            <div style={{ fontWeight: 700 }}>{hoveredPeer.name}</div>
            <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)" }}>
              OFF {Math.round(hoveredPeer.off)} · DEF {Math.round(hoveredPeer.def)} · NAV {hoveredPeer.nav > 0 ? "+" : ""}{hoveredPeer.nav}
            </div>
          </div>
        </div>
      )}

      {/* Brushed-player list */}
      {activeBrush && brushedPlayers.length > 0 && (
        <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--ledger-rule)" }}>
          <div className="flex items-baseline justify-between mb-1">
            <span className="font-mono text-[9px] sm:text-[10px] font-black uppercase tracking-[0.12em]"
              style={{ color: "var(--ledger-ink-faint)" }}>
              Selected Players
            </span>
            <button
              onClick={() => setActiveBrush(null)}
              className="font-mono text-[9px] uppercase tracking-[0.1em]"
              style={{ color: "var(--ledger-ink-faint)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
            >
              Clear
            </button>
          </div>
          <div className="grid gap-0" style={{ maxHeight: 160, overflowY: "auto" }}>
            {brushedPlayers.slice(0, 20).map(p => (
              <div key={p.id}
                className="flex items-center justify-between gap-2 py-0.5 px-1"
                style={{
                  fontFamily: "'Courier Prime', monospace",
                  fontSize: 11,
                  color: p.id === currentPlayer.id ? CURRENT_COLOR : "var(--ledger-ink)",
                  fontWeight: p.id === currentPlayer.id ? 800 : 400,
                  borderBottom: "1px solid var(--ledger-rule)",
                  opacity: 0.9,
                }}
              >
                <span className="truncate">{p.name}</span>
                <span className="flex items-baseline gap-2 shrink-0 tabular-nums">
                  <span style={{ fontSize: 9, color: "var(--ledger-ink-faint)" }}>
                    OFF {Math.round(p.off)} · DEF {Math.round(p.def)}
                  </span>
                  <span style={{ fontWeight: 700, minWidth: 34, textAlign: "right" }}>
                    {p.nav > 0 ? "+" : ""}{p.nav}
                  </span>
                </span>
              </div>
            ))}
            {brushedPlayers.length > 20 && (
              <div className="py-0.5 px-1 font-mono text-[10px]" style={{ color: "var(--ledger-ink-faint)" }}>
                +{brushedPlayers.length - 20} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
