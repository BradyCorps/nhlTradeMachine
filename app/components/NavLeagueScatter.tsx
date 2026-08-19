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
}

const CURRENT_COLOR = "var(--ledger-red, #b83020)";
const PEER_COLOR = "var(--ledger-ink, #1a1a18)";

interface BrushRect {
  x0: number; y0: number;
  x1: number; y1: number;
}

export default function NavLeagueScatter({ peers, currentPlayer, playerName }: Props) {
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

  const sortedOff = [...offVals].sort((a, b) => a - b);
  const sortedDef = [...defVals].sort((a, b) => a - b);
  const medOff = sortedOff[Math.floor(sortedOff.length / 2)];
  const medDef = sortedDef[Math.floor(sortedDef.length / 2)];

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
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em]"
          style={{ color: "var(--ledger-ink-faint)" }}>
          League Context
        </span>
        <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.12em]"
          style={{ color: "var(--ledger-ink-faint)" }}>
          {all.length} same-position peers
          {activeBrush ? ` · ${brushedPlayers.length} selected` : " · drag to select"}
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxWidth: W, cursor: brushing ? "crosshair" : "default" }}
        role="img"
        aria-label={`Scatter plot of offensive vs defensive value for ${playerName} and ${peers.length} position peers`}
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
                opacity={isHov ? 0.7 : isBrushed ? 0.6 : 0.18}
                stroke={isHov ? PEER_COLOR : isBrushed ? "var(--ledger-green, #2a7a3f)" : "none"}
                strokeWidth={isHov || isBrushed ? 1 : 0}
                onMouseEnter={() => { if (!brushing) setHoveredId(p.id); }}
                onMouseLeave={() => { if (!brushing) setHoveredId(null); }}
                style={{ cursor: "default", transition: "opacity 0.15s, r 0.15s" }}
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
            padding: "2px 6px",
            fontFamily: "'Courier Prime', monospace",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--ledger-ink)",
            whiteSpace: "nowrap",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}>
            {hoveredPeer.name} ({hoveredPeer.nav})
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
                className="flex items-center justify-between py-0.5 px-1"
                style={{
                  fontFamily: "'Courier Prime', monospace",
                  fontSize: 11,
                  color: p.id === currentPlayer.id ? CURRENT_COLOR : "var(--ledger-ink)",
                  fontWeight: p.id === currentPlayer.id ? 800 : 400,
                  borderBottom: "1px solid var(--ledger-rule)",
                  opacity: 0.9,
                }}
              >
                <span>{p.name}</span>
                <span style={{ fontWeight: 700 }}>
                  {p.nav > 0 ? "+" : ""}{p.nav}
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
