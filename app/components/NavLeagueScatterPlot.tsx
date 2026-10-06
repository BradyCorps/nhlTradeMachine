"use client";
// The Recharts half of NavLeagueScatter, in its own file so it can be code-split.
import React from "react";
import {
  CartesianGrid, LabelList, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { SELECTED_STYLE, signedNav, type ScatterPeer } from "@/app/lib/league-scatter";

const MONO = "'Courier Prime', monospace";
const INK = "var(--ledger-ink, #1a1a18)";
const FAINT = "var(--ledger-ink-faint)";
const RULE = "var(--ledger-rule)";
const CURRENT_COLOR = "var(--ledger-red, #b83020)";

// In-chart quadrant labels are short enough for two per row at 320px; the full
// wording is in the figure description.
const QUADRANT_SHORT = {
  "both-above": "Above median: both",
  "off-only": "Above median: offence",
  "def-only": "Above median: defence",
  "both-below": "Below median: both",
} as const;

export type Datum = ScatterPeer & { shortName: string };

/** One marker: circle, diamond or square, so series differ by more than colour. */
function Marker({ cx, cy, shape, r, fill, fillOpacity = 1, stroke = "none", strokeWidth = 0 }: {
  cx?: number; cy?: number; shape: "circle" | "diamond" | "square"; r: number;
  fill: string; fillOpacity?: number; stroke?: string; strokeWidth?: number;
}) {
  if (cx == null || cy == null || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const common = { fill, fillOpacity, stroke, strokeWidth };
  if (shape === "diamond") return <path d={`M${cx},${cy - r * 1.25}L${cx + r * 1.25},${cy}L${cx},${cy + r * 1.25}L${cx - r * 1.25},${cy}Z`} {...common} />;
  if (shape === "square") return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} {...common} />;
  return <circle cx={cx} cy={cy} r={r} {...common} />;
}

function Tip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: Datum }> }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div style={{
      background: "var(--paper-card, var(--paper-bg))", border: `1px solid ${RULE}`, borderRadius: 3, padding: "4px 8px",
      fontFamily: MONO, fontSize: 10, color: INK, boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
    }}>
      <div style={{ fontWeight: 700 }}>{p.name} · {p.teamId}</div>
      <div style={{ color: FAINT }}>OFF {Math.round(p.off)} · DEF {Math.round(p.def)} · NAV {signedNav(p.nav)}</div>
    </div>
  );
}


export interface ScatterPlotProps {
  xDomain: [number, number];
  yDomain: [number, number];
  med: { off: number; def: number };
  background: Datum[];
  highlighted: Datum[];
  selected: Datum[];
  current: Datum;
  playerName: string;
  onPointClick: (d: unknown) => void;
}

export default function NavLeagueScatterPlot({ xDomain, yDomain, med, background, highlighted, selected, current, playerName, onPointClick }: ScatterPlotProps) {
  return (
        <div style={{ width: "100%", height: "clamp(300px, 56vw, 420px)" }} data-testid="league-scatter-plot">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 14, right: 14, bottom: 30, left: 4 }} accessibilityLayer={false}>
              <CartesianGrid stroke="var(--ledger-rule-light, #ddd2b8)" strokeOpacity={0.5} strokeDasharray="2 4" />
              <XAxis type="number" dataKey="off" domain={xDomain} allowDataOverflow
                tickFormatter={v => String(Math.round(v))} tickLine={false}
                tick={{ fill: FAINT, fontSize: 10, fontFamily: MONO }}
                label={{ value: "Offensive contribution, NAV points", position: "insideBottom", offset: -18, fill: FAINT, fontSize: 10, fontFamily: MONO }} />
              <YAxis type="number" dataKey="def" domain={yDomain} allowDataOverflow width={44}
                tickFormatter={v => String(Math.round(v))} tickLine={false}
                tick={{ fill: FAINT, fontSize: 10, fontFamily: MONO }}
                label={{ value: "Defensive contribution, NAV points", angle: -90, position: "insideLeft", offset: 6, style: { textAnchor: "middle" }, fill: FAINT, fontSize: 10, fontFamily: MONO }} />

              {/* Neutral quadrant labels: position relative to the cohort medians. */}
              <ReferenceArea x1={med.off} x2={xDomain[1]} y1={med.def} y2={yDomain[1]} fill="none" stroke="none"
                label={{ value: QUADRANT_SHORT["both-above"], position: "insideTopRight", fill: FAINT, fontSize: 9, fontFamily: MONO, opacity: 0.8, className: "nls-quad" }} />
              <ReferenceArea x1={xDomain[0]} x2={med.off} y1={med.def} y2={yDomain[1]} fill="none" stroke="none"
                label={{ value: QUADRANT_SHORT["def-only"], position: "insideTopLeft", fill: FAINT, fontSize: 9, fontFamily: MONO, opacity: 0.8, className: "nls-quad" }} />
              <ReferenceArea x1={med.off} x2={xDomain[1]} y1={yDomain[0]} y2={med.def} fill="none" stroke="none"
                label={{ value: QUADRANT_SHORT["off-only"], position: "insideBottomRight", fill: FAINT, fontSize: 9, fontFamily: MONO, opacity: 0.8, className: "nls-quad" }} />
              <ReferenceArea x1={xDomain[0]} x2={med.off} y1={yDomain[0]} y2={med.def} fill="none" stroke="none"
                label={{ value: QUADRANT_SHORT["both-below"], position: "insideBottomLeft", fill: FAINT, fontSize: 9, fontFamily: MONO, opacity: 0.8, className: "nls-quad" }} />
              <ReferenceLine x={med.off} stroke={FAINT} strokeDasharray="4 3" strokeOpacity={0.7} />
              <ReferenceLine y={med.def} stroke={FAINT} strokeDasharray="4 3" strokeOpacity={0.7} />

              <Tooltip cursor={false} content={<Tip />} isAnimationActive={false} />

              {/* Subdued league distribution (clickable to add). */}
              <Scatter name="Cohort" data={background} isAnimationActive={false} onClick={onPointClick}
                shape={(p: { cx?: number; cy?: number }) => <Marker cx={p.cx} cy={p.cy} shape="circle" r={3.2} fill={INK} fillOpacity={0.2} />} />
              {/* Search matches: ringed, not relabelled, not removed from the cohort. */}
              <Scatter name="Search matches" data={highlighted} isAnimationActive={false} onClick={onPointClick}
                shape={(p: { cx?: number; cy?: number }) => <Marker cx={p.cx} cy={p.cy} shape="circle" r={5} fill="var(--paper-bg, #fff)" fillOpacity={0.9} stroke={INK} strokeWidth={1.75} />} />
              {/* Selected comparison players: labelled. */}
              {selected.map((p, i) => (
                <Scatter key={p.id} name={p.name} data={[p]} isAnimationActive={false} onClick={onPointClick}
                  shape={(s: { cx?: number; cy?: number }) => <Marker cx={s.cx} cy={s.cy} shape={SELECTED_STYLE[i].shape} r={6} fill={SELECTED_STYLE[i].color} stroke="var(--paper-bg, #fff)" strokeWidth={1.5} />}>
                  <LabelList dataKey="shortName" position="top" offset={9} style={{ fill: SELECTED_STYLE[i].color, fontSize: 10, fontFamily: MONO, fontWeight: 700 }} />
                </Scatter>
              ))}
              {/* The dossier player: always highlighted and labelled, drawn last. */}
              <Scatter name={playerName} data={[current]} isAnimationActive={false}
                shape={(s: { cx?: number; cy?: number }) => <Marker cx={s.cx} cy={s.cy} shape="circle" r={7} fill={CURRENT_COLOR} stroke="var(--paper-bg, #fff)" strokeWidth={2} />}>
                <LabelList dataKey="shortName" position="top" offset={10} style={{ fill: CURRENT_COLOR, fontSize: 10, fontFamily: MONO, fontWeight: 800 }} />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
  );
}
