"use client";

import React, { useEffect, useMemo, useState } from "react";
import { scaleLinear } from "d3-scale";

interface TeamNavDatum {
  name: string;
  abbrev: string;
  /** rosterNAV — the combined total. Equals fNav + dNav + gNav. */
  xnav: number;
  fNav: number;
  dNav: number;
  gNav: number;
  goalDiff: number;
  phase: string;
}

interface Props {
  data: TeamNavDatum[];
}

type Dim = "xnav" | "fNav" | "dNav" | "gNav";

// The four views the chart switches between. `xnav` is the combined total;
// the three splits decompose it by position. Order is the toggle order.
const DIMS: { key: Dim; label: string; blurb: string }[] = [
  { key: "xnav", label: "X-NAV", blurb: "Combined roster value" },
  { key: "fNav", label: "F-NAV", blurb: "Forwards only" },
  { key: "dNav", label: "D-NAV", blurb: "Defense only" },
  { key: "gNav", label: "G-NAV", blurb: "Goaltending only" },
];

// Ordinal competitive stance, best → worst. Each phase gets a DISTINCT fill:
// Rebuilding and Tanking are both "down" states but must not read as one bar
// colour — Tanking takes a deeper red so the legend's two entries are actually
// separable on the chart.
const PHASE_COLORS: Record<string, string> = {
  Contender: "var(--ledger-green, #2a7a3f)",
  Bubble: "var(--ledger-amber, #d4a017)",
  Retooling: "var(--ledger-ink-faint, #888)",
  Rebuilding: "var(--ledger-red, #b83020)",
  Tanking: "#6f1109",
};

/** Respect the OS "reduce motion" setting — the re-sort animation is the
 *  whole point of this chart, but it is decoration, not information. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export default function TeamNavChart({ data }: Props) {
  const [dim, setDim] = useState<Dim>("xnav");
  const [hoveredAbbrev, setHoveredAbbrev] = useState<string | null>(null);
  const reduceMotion = usePrefersReducedMotion();

  const active = DIMS.find(d => d.key === dim) ?? DIMS[0];

  // Rank order for the active dimension. Columns stay keyed by abbrev across
  // dimension switches, so React reuses each DOM node and the CSS transition
  // slides it to its new rank instead of the list snapping.
  const ranked = useMemo(() => {
    return data
      .map(d => ({ ...d, value: d[dim] }))
      .sort((a, b) => b.value - a.value);
  }, [data, dim]);

  if (ranked.length === 0) return null;

  const n = ranked.length;
  const margin = { top: 24, right: 12, bottom: 30, left: 12 };
  // Wide enough that 32 three-letter labels stay legible; scrolls on mobile.
  const chartW = Math.max(720, n * 28);
  const chartH = 360;
  const plotW = chartW - margin.left - margin.right;
  const plotH = chartH - margin.top - margin.bottom;
  const baseline = margin.top + plotH;

  const bandW = plotW / n;
  const barPad = Math.min(6, bandW * 0.18);
  const barW = bandW - barPad * 2;

  // Domain re-scales per dimension so each view uses the full height — a
  // team's G-NAV of 200 should not read as a stub beside an X-NAV of 3,000.
  const maxValue = Math.max(1, ...ranked.map(d => d.value));
  const yScale = scaleLinear().domain([0, maxValue * 1.08]).range([0, plotH]);

  // Median of the active dimension (values are already sorted).
  const median = ranked[Math.floor(n / 2)]?.value ?? 0;
  const medianY = baseline - yScale(median);

  // A 2px floor so a zero-value bar is still a visible tick, expressed as the
  // scaleY factor the bar rect (full plotH tall) is squeezed to.
  const minK = 2 / plotH;
  const scaleYFor = (value: number) => Math.max(minK, yScale(value) / plotH);
  const xFor = (rank: number) => margin.left + rank * bandW;

  const trans = reduceMotion ? undefined : "transform 620ms cubic-bezier(0.4, 0, 0.2, 1)";
  const rankByAbbrev = new Map(ranked.map((d, i) => [d.abbrev, i]));

  return (
    <div className="border mb-5" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-card)" }}>
      <div className="px-3 py-2 border-b flex flex-wrap items-center justify-between gap-2"
        style={{ borderColor: "var(--ledger-rule)" }}>
        <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em]"
          style={{ color: "var(--ledger-ink)" }}>
          League X-NAV Rankings
        </span>

        {/* Dimension toggle — X-NAV / F / D / G */}
        <div className="flex items-stretch border" style={{ borderColor: "var(--ledger-rule)" }}
          role="tablist" aria-label="NAV dimension">
          {DIMS.map((d, i) => {
            const on = d.key === dim;
            return (
              <button
                key={d.key}
                role="tab"
                aria-selected={on}
                title={d.blurb}
                onClick={() => setDim(d.key)}
                className="font-mono text-[8px] sm:text-[9px] font-black uppercase tracking-[0.12em] px-2 py-1 cursor-pointer"
                style={{
                  background: on ? "var(--ledger-ink)" : "transparent",
                  color: on ? "var(--paper-card)" : "var(--ledger-ink-faint)",
                  borderLeft: i === 0 ? "none" : "1px solid var(--ledger-rule)",
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-3 pt-2 font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.12em]"
        style={{ color: "var(--ledger-ink-faint)" }}>
        {active.blurb} · {n} teams
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="w-full"
          style={{ maxWidth: chartW, minWidth: Math.min(chartW, 620) }}
          role="img"
          aria-label={`Column chart ranking ${n} NHL teams by ${active.label} (${active.blurb}). Top: ${ranked[0]?.name} at ${Math.round(ranked[0]?.value ?? 0)}`}
        >
          {/* Baseline */}
          <line x1={margin.left} y1={baseline} x2={chartW - margin.right} y2={baseline}
            stroke="var(--ledger-rule)" strokeWidth={1} />

          {/* Median reference line — rises/falls as the dimension changes */}
          <g style={{ transform: `translateY(${medianY}px)`, transition: trans }}>
            <line x1={margin.left} y1={0} x2={chartW - margin.right} y2={0}
              stroke="var(--ledger-ink-faint)" strokeWidth={1} strokeDasharray="3,3" opacity={0.35} />
            <text x={chartW - margin.right} y={-3} textAnchor="end"
              fill="var(--ledger-ink-faint)" fontSize={9} fontWeight={700}
              fontFamily="'Courier Prime', 'Courier New', monospace">
              MEDIAN
            </text>
          </g>

          {ranked.map((d) => {
            const rank = rankByAbbrev.get(d.abbrev) ?? 0;
            const fill = PHASE_COLORS[d.phase] || "var(--ledger-ink)";
            const isHovered = hoveredAbbrev === d.abbrev;
            const k = scaleYFor(d.value);
            const topY = baseline - plotH * k;

            return (
              <g key={d.abbrev}
                style={{ transform: `translateX(${xFor(rank)}px)`, transition: trans, cursor: "pointer" }}
                onMouseEnter={() => setHoveredAbbrev(d.abbrev)}
                onMouseLeave={() => setHoveredAbbrev(null)}
                onClick={() => setHoveredAbbrev(prev => (prev === d.abbrev ? null : d.abbrev))}
              >
                {/* Full-band hit target (bars + label strip) */}
                <rect x={0} y={margin.top} width={bandW} height={plotH + margin.bottom} fill="transparent" />

                {/* Column highlight on hover */}
                {isHovered && (
                  <rect x={0} y={margin.top} width={bandW} height={plotH}
                    fill="var(--ledger-ink)" opacity={0.05} />
                )}

                {/* Bar — full-height rect squeezed by scaleY so the growth
                    animates up from the baseline on every dimension change */}
                <rect
                  x={barPad}
                  y={margin.top}
                  width={barW}
                  height={plotH}
                  fill={fill}
                  opacity={isHovered ? 1 : 0.82}
                  rx={2}
                  style={{
                    transformBox: "fill-box",
                    transformOrigin: "bottom",
                    transform: `scaleY(${k})`,
                    transition: trans,
                  }}
                />

                {/* Value above the bar, on hover */}
                {isHovered && (
                  <text x={bandW / 2} y={topY - 4} textAnchor="middle"
                    fill={fill} fontSize={9} fontWeight={700}
                    fontFamily="'Courier Prime', 'Courier New', monospace">
                    {Math.round(d.value).toLocaleString()}
                  </text>
                )}

                {/* Team abbreviation under the column */}
                <text x={bandW / 2} y={baseline + 12} textAnchor="middle"
                  fill="var(--ledger-ink)" fontSize={8}
                  fontWeight={isHovered ? 900 : 600}
                  fontFamily="'Courier Prime', 'Courier New', monospace">
                  {d.abbrev}
                </text>
              </g>
            );
          })}

          {/* Hovered team tooltip — name + phase + active value + GD */}
          {hoveredAbbrev !== null && (() => {
            const d = ranked.find(r => r.abbrev === hoveredAbbrev);
            if (!d) return null;
            const rank = rankByAbbrev.get(d.abbrev) ?? 0;
            const cx = xFor(rank) + bandW / 2;
            const anchorLeft = cx > chartW / 2;
            return (
              <foreignObject
                x={anchorLeft ? cx - 210 : cx + 4}
                y={margin.top - 2}
                width={206}
                height={26}
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
                  marginLeft: anchorLeft ? "auto" : 0,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}>
                  {d.name} · {d.phase} · {active.label} {Math.round(d.value).toLocaleString()} · GD {d.goalDiff > 0 ? "+" : ""}{d.goalDiff}
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
