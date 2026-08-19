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

// The four views the chart switches between. `full` names the combined
// total; the three splits decompose it by position. Order matters — it is
// the order of the toggle.
const DIMS: { key: Dim; label: string; blurb: string }[] = [
  { key: "xnav", label: "X-NAV", blurb: "Combined roster value" },
  { key: "fNav", label: "F-NAV", blurb: "Forwards only" },
  { key: "dNav", label: "D-NAV", blurb: "Defense only" },
  { key: "gNav", label: "G-NAV", blurb: "Goaltending only" },
];

const PHASE_COLORS: Record<string, string> = {
  Contender: "var(--ledger-green, #2a7a3f)",
  Bubble: "var(--ledger-amber, #d4a017)",
  Retooling: "var(--ledger-ink-faint, #888)",
  Rebuilding: "var(--ledger-red, #b83020)",
  Tanking: "var(--ledger-red, #b83020)",
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

  // Rank order for the active dimension. Rows stay keyed by abbrev across
  // dimension switches, so React reuses each DOM node and the CSS transition
  // slides it to its new rank instead of the list snapping.
  const ranked = useMemo(() => {
    return data
      .map(d => ({ ...d, value: d[dim] }))
      .sort((a, b) => b.value - a.value);
  }, [data, dim]);

  if (ranked.length === 0) return null;

  const barH = 24;
  const gap = 3;
  const labelW = 48;
  const valueW = 56;
  const margin = { top: 20, right: 8, bottom: 8, left: 0 };
  const chartW = 520;
  const barAreaW = chartW - labelW - valueW - margin.left - margin.right;
  const chartH = margin.top + margin.bottom + ranked.length * (barH + gap) - gap;

  // Domain re-scales per dimension so each view uses the full bar width — a
  // team's G-NAV of 200 should not read as a stub beside an X-NAV of 3,000.
  const maxValue = Math.max(1, ...ranked.map(d => d.value));
  const xScale = scaleLinear().domain([0, maxValue * 1.08]).range([0, barAreaW]);

  // Median of the active dimension, in rank space (values are already sorted).
  const median = ranked[Math.floor(ranked.length / 2)]?.value ?? 0;
  const medianX = labelW + xScale(median);

  // A 2px floor so a zero-value bar is still a visible tick, expressed as the
  // scaleX factor the bar rect (full barAreaW wide) is squeezed to.
  const minK = 2 / barAreaW;
  const scaleXFor = (value: number) => Math.max(minK, xScale(value) / barAreaW);

  const rowTransition = reduceMotion ? undefined : "transform 620ms cubic-bezier(0.4, 0, 0.2, 1)";
  const barTransition = reduceMotion ? undefined : "transform 620ms cubic-bezier(0.4, 0, 0.2, 1)";

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
        {active.blurb} · {ranked.length} teams
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="w-full"
          style={{ maxWidth: chartW, minWidth: 340 }}
          role="img"
          aria-label={`Bar chart ranking ${ranked.length} NHL teams by ${active.label} (${active.blurb}). Top: ${ranked[0]?.name} at ${Math.round(ranked[0]?.value ?? 0)}`}
        >
          {/* Median reference line — slides as the dimension changes */}
          <g style={{ transform: `translateX(${medianX}px)`, transition: barTransition }}>
            <line
              x1={0} y1={margin.top - 4}
              x2={0} y2={chartH - margin.bottom}
              stroke="var(--ledger-ink-faint)"
              strokeWidth={1}
              strokeDasharray="3,3"
              opacity={0.35}
            />
            <text
              x={0} y={margin.top - 8}
              textAnchor="middle"
              fill="var(--ledger-ink-faint)"
              fontSize={7}
              fontFamily="'Courier Prime', 'Courier New', monospace"
              fontWeight={700}
            >
              MEDIAN
            </text>
          </g>

          {ranked.map((d) => {
            const rank = rankByAbbrev.get(d.abbrev) ?? 0;
            const y = margin.top + rank * (barH + gap);
            const fill = PHASE_COLORS[d.phase] || "var(--ledger-ink)";
            const isHovered = hoveredAbbrev === d.abbrev;

            return (
              <g key={d.abbrev}
                style={{ transform: `translateY(${y}px)`, transition: rowTransition, cursor: "default" }}
                onMouseEnter={() => setHoveredAbbrev(d.abbrev)}
                onMouseLeave={() => setHoveredAbbrev(null)}
              >
                {/* Full-row hit target */}
                <rect x={0} y={0} width={chartW} height={barH} fill="transparent" />

                {/* Row highlight on hover */}
                {isHovered && (
                  <rect x={0} y={0} width={chartW} height={barH}
                    fill="var(--ledger-ink)" opacity={0.04} rx={2} />
                )}

                {/* Team abbreviation */}
                <text
                  x={labelW - 6}
                  y={barH / 2 + 1}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="var(--ledger-ink)"
                  fontSize={10}
                  fontFamily="'Courier Prime', 'Courier New', monospace"
                  fontWeight={isHovered ? 900 : 700}
                >
                  {d.abbrev}
                </text>

                {/* Bar — full-width rect squeezed by scaleX so the growth
                    animates from the left edge on every dimension change */}
                <rect
                  x={labelW}
                  y={3}
                  width={barAreaW}
                  height={barH - 6}
                  fill={fill}
                  opacity={isHovered ? 1 : 0.8}
                  rx={2}
                  style={{
                    transformBox: "fill-box",
                    transformOrigin: "left",
                    transform: `scaleX(${scaleXFor(d.value)})`,
                    transition: barTransition,
                  }}
                />

                {/* Value for the active dimension */}
                <text
                  x={chartW - margin.right}
                  y={barH / 2 + 1}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill={fill}
                  fontSize={10}
                  fontFamily="'Courier Prime', 'Courier New', monospace"
                  fontWeight={700}
                >
                  {Math.round(d.value).toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Hovered team tooltip — name + phase + the active value */}
          {hoveredAbbrev !== null && (() => {
            const d = ranked.find(r => r.abbrev === hoveredAbbrev);
            if (!d) return null;
            const rank = rankByAbbrev.get(d.abbrev) ?? 0;
            const y = margin.top + rank * (barH + gap);
            const barW = xScale(d.value);
            return (
              <foreignObject
                x={labelW + Math.min(barW + 6, barAreaW * 0.4)}
                y={y - 2}
                width={220}
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
