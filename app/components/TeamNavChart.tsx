"use client";

import React, { useEffect, useMemo, useState } from "react";
import { scaleLinear } from "d3-scale";
import { HorizontalScrollCue } from "@/app/components/HorizontalScrollCue";
import type { TeamNavDim } from "@/app/lib/teams-url-state";

interface TeamNavDatum {
  name: string;
  abbrev: string;
  /** Positive-assets-only combined total ("X-NAV+") — Σ max(0, nav) per
   *  player. Equals fNav + dNav + gNav. NOT the team's real signed NAV total
   *  (shown elsewhere on the page); bars here can't render a negative value,
   *  so this dimension is deliberately the floored one — see team-nav-split.ts. */
  xnav: number;
  fNav: number;
  dNav: number;
  gNav: number;
  goalDiff: number;
  phase: string;
}

type Dim = TeamNavDim;

interface Props {
  data: TeamNavDatum[];
  /** Controlled dim — omit to let the chart own its own toggle state. */
  dim?: Dim;
  onDimChange?: (dim: Dim) => void;
}

// The four views the chart switches between. `xnav` is the combined total;
// the three splits decompose it by position. Order is the toggle order.
const DIMS: { key: Dim; label: string; blurb: string }[] = [
  // "+" is deliberate and load-bearing: this is the positive-assets-only
  // total (Σ max(0, nav)), not the team's real signed NAV shown elsewhere on
  // the page — this chart's bars have no way to render a negative value.
  { key: "xnav", label: "X-NAV+", blurb: "Combined roster value (positive assets only)" },
  { key: "fNav", label: "F-NAV", blurb: "Forwards only, positive assets" },
  { key: "dNav", label: "D-NAV", blurb: "Defense only, positive assets" },
  { key: "gNav", label: "G-NAV", blurb: "Goaltending only, positive assets" },
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

// Standard visually-hidden style: off-screen for sighted readers, still in the
// accessibility tree for screen readers. Inline so it doesn't depend on a
// Tailwind `sr-only` class being present in the build.
const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
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

/** Narrow viewport → default to a top-10 view that fits without a 620px
 *  horizontal scroll. Starts false so the server and first client render agree
 *  (no hydration mismatch); flips after mount if the screen is small. */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

export default function TeamNavChart({ data, dim: controlledDim, onDimChange }: Props) {
  const [internalDim, setInternalDim] = useState<Dim>("xnav");
  const dim = controlledDim ?? internalDim;
  const setDim = onDimChange ?? setInternalDim;
  const [hoveredAbbrev, setHoveredAbbrev] = useState<string | null>(null);
  // null = auto (all on desktop, top-10 on mobile); a boolean is the reader's
  // explicit override of that default.
  const [showAllOverride, setShowAllOverride] = useState<boolean | null>(null);
  const reduceMotion = usePrefersReducedMotion();
  const isMobile = useIsMobile();

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

  const TOP_N = 10;
  const canCollapse = ranked.length > TOP_N;
  const showAll = showAllOverride ?? !isMobile;
  // The plotted subset. Full-league facts (median, the screen-reader table)
  // always come from `ranked`, so a collapsed view never misreports the league.
  const visible = showAll || !canCollapse ? ranked : ranked.slice(0, TOP_N);

  const n = visible.length;
  const margin = { top: 24, right: 12, bottom: 30, left: 12 };
  // All 32 need width (three-letter labels legible; scrolls on mobile); the
  // top-10 view is sized to fit a phone with no scroll.
  const chartW = showAll ? Math.max(720, n * 28) : Math.max(320, n * 34);
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

  // Median of the active dimension across the WHOLE league (values sorted), so
  // the reference line means the same thing in the top-10 and full views.
  const median = ranked[Math.floor(ranked.length / 2)]?.value ?? 0;
  const medianY = baseline - yScale(median);

  // A 2px floor so a zero-value bar is still a visible tick, expressed as the
  // scaleY factor the bar rect (full plotH tall) is squeezed to.
  const minK = 2 / plotH;
  const scaleYFor = (value: number) => Math.max(minK, yScale(value) / plotH);
  const xFor = (rank: number) => margin.left + rank * bandW;

  const trans = reduceMotion ? undefined : "transform 620ms cubic-bezier(0.4, 0, 0.2, 1)";
  const rankByAbbrev = new Map(visible.map((d, i) => [d.abbrev, i]));

  return (
    <div className="border mb-5" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-card)" }}>
      <div className="px-3 py-2 border-b flex flex-wrap items-center justify-between gap-2"
        style={{ borderColor: "var(--ledger-rule)" }}>
        <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em]"
          style={{ color: "var(--ledger-ink)" }}>
          League {active.label} Rankings
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

      <div className="px-3 pt-2 flex items-center justify-between gap-2 font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.12em]"
        style={{ color: "var(--ledger-ink-faint)" }}>
        <span>{active.blurb} · {showAll ? `${ranked.length} teams` : `top ${TOP_N} of ${ranked.length}`}</span>
        {canCollapse && (
          <button
            onClick={() => setShowAllOverride(!showAll)}
            aria-expanded={showAll}
            className="font-mono text-[8px] sm:text-[9px] font-black uppercase tracking-[0.12em] underline cursor-pointer"
            style={{ color: "var(--ledger-ink-faint)", background: "none", border: "none" }}
          >
            {showAll ? `Show top ${TOP_N}` : `Show all ${ranked.length}`}
          </button>
        )}
      </div>

      <div className="overflow-x-auto" role="region" aria-label="League NAV rankings chart" tabIndex={0}>
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="w-full"
          style={{ maxWidth: chartW, minWidth: Math.min(chartW, 620) }}
          role="img"
          aria-label={`Column chart ranking ${showAll ? `all ${ranked.length}` : `the top ${n} of ${ranked.length}`} NHL teams by ${active.label} (${active.blurb}). Top: ${ranked[0]?.name} at ${Math.round(ranked[0]?.value ?? 0)}. Full ranking follows in a table.`}
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
              MEDIAN {Math.round(median).toLocaleString()}
            </text>
          </g>

          {visible.map((d) => {
            const rank = rankByAbbrev.get(d.abbrev) ?? 0;
            const fill = PHASE_COLORS[d.phase] || "var(--ledger-ink)";
            const isHovered = hoveredAbbrev === d.abbrev;
            const k = scaleYFor(d.value);
            const topY = baseline - plotH * k;

            return (
              <g key={d.abbrev}
                role="button"
                tabIndex={0}
                aria-pressed={isHovered}
                aria-label={`${d.name}, ${d.phase}, ${active.label} ${Math.round(d.value).toLocaleString()}, goal differential ${d.goalDiff > 0 ? "+" : ""}${d.goalDiff}`}
                style={{ transform: `translateX(${xFor(rank)}px)`, transition: trans, cursor: "pointer" }}
                onMouseEnter={() => setHoveredAbbrev(d.abbrev)}
                onMouseLeave={() => setHoveredAbbrev(null)}
                onFocus={() => setHoveredAbbrev(d.abbrev)}
                onBlur={() => setHoveredAbbrev(null)}
                onClick={() => setHoveredAbbrev(prev => (prev === d.abbrev ? null : d.abbrev))}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setHoveredAbbrev(prev => (prev === d.abbrev ? null : d.abbrev));
                  } else if (event.key === "Escape") {
                    setHoveredAbbrev(null);
                  }
                }}
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
            const d = visible.find(r => r.abbrev === hoveredAbbrev);
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
      <HorizontalScrollCue label="Swipe or scroll for the full league chart" className="px-3" />

      {/* Screen-reader ranking — the column chart is role="img" with only the
          leader in its label, so a non-visual reader gets the full ordered
          table here (kept off-screen, updates with the active dimension). */}
      <table style={SR_ONLY}>
        <caption>{`League ${active.label} rankings — ${active.blurb}, ${ranked.length} teams`}</caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Team</th>
            <th scope="col">Competitive phase</th>
            <th scope="col">{active.label}</th>
            <th scope="col">Goal differential</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((d, i) => (
            <tr key={d.abbrev}>
              <th scope="row">{i + 1}</th>
              <td>{d.name}</td>
              <td>{d.phase}</td>
              <td>{Math.round(d.value).toLocaleString()}</td>
              <td>{d.goalDiff > 0 ? "+" : ""}{d.goalDiff}</td>
            </tr>
          ))}
        </tbody>
      </table>

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
