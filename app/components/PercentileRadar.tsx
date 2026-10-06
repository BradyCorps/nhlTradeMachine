"use client";

// ── PercentileRadar — prototype alternative to the percentile bars ──
// Recharts radar over the card's EXISTING percentile rows (nothing is
// recalculated here). Review prototype: the bars stay available as "Detailed
// values".
//
// Honesty rules, all enforced by app/lib/percentile-radar.ts and tested:
//   • fixed 0–100 scale with a labelled 50th-percentile ring
//   • fixed axis order
//   • a missing percentile is never drawn: no dot, and no polygon at all unless
//     every axis is present (Recharts would otherwise plot a null at the centre)
//   • no polygon area, score or classification; usage metrics (ice time,
//     competition, zone starts) sit in the table, not on the radar

import React, { useState } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import {
  RADAR_DOMAIN, RADAR_REFERENCE, RADAR_TICKS, axisDetail, canDrawPolygon, radarChartData,
  type RadarMetric, type RadarModel,
} from "@/app/lib/percentile-radar";

const MONO = "'Courier Prime', monospace";
const INK = "#1c140a";
const FAINT = "#6e5a3d";
const PLAYER = "#9c2b1f";
const COMPARE = "#1a4b5b";

interface Pt { x: number; y: number }

export default function PercentileRadar({ model, playerName, compareName, peerLabel }: {
  model: RadarModel;
  playerName: string;
  compareName?: string;
  peerLabel: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const data = radarChartData(model);
  const metricAt = (i: number): RadarMetric | undefined => model.axes[i];
  const selected = [...model.axes, ...model.usage].find(m => m.key === active) ?? null;
  const hasCompare = model.compareComplete !== undefined && !!compareName;
  const drawPlayer = canDrawPolygon(model, "player");
  const drawCompare = hasCompare && canDrawPolygon(model, "compare");

  // Polygon renderers return null unless every axis is present.
  const polygon = (color: string, draw: boolean) =>
    function Shape(props: { points?: Pt[] }) {
      if (!draw || !props.points || props.points.length < 3) return null;
      return <polygon points={props.points.map(p => `${p.x},${p.y}`).join(" ")}
        fill={color} fillOpacity={0.14} stroke={color} strokeWidth={2} strokeLinejoin="round" />;
    };
  // Dots skip missing axes by index; Recharts places a null at radius 0.
  const dots = (color: string, series: "player" | "compare") =>
    function DotFn(props: { cx?: number; cy?: number; index?: number }) {
      const i = props.index ?? -1;
      const m = metricAt(i);
      const pct = series === "player" ? m?.player.pct : m?.compare?.pct;
      if (!m || pct == null || props.cx == null || props.cy == null) return <g />;
      return (
        <circle cx={props.cx} cy={props.cy} r={active === m.key ? 6 : 4} fill={color} stroke="#fffdf5" strokeWidth={1.25}
          style={{ cursor: "pointer" }} onClick={() => setActive(m.key)} />
      );
    };

  const Tick = (props: { x?: number; y?: number; index?: number; textAnchor?: "start" | "middle" | "end" | "inherit" }) => {
    const m = metricAt(props.index ?? -1);
    if (!m || props.x == null || props.y == null) return <g />;
    const unavailable = m.player.pct == null;
    return (
      <g onClick={() => setActive(m.key)} style={{ cursor: "pointer" }}>
        <text x={props.x} y={props.y} textAnchor={props.textAnchor ?? "middle"} fontSize={10} fontWeight={800} fontFamily={MONO} fill={INK}>
          {m.label}
        </text>
        <text x={props.x} y={(props.y ?? 0) + 11} textAnchor={props.textAnchor ?? "middle"} fontSize={10} fontFamily={MONO}
          fill={unavailable ? FAINT : PLAYER} fontWeight={700}>
          {unavailable ? "n/a" : m.player.pct}
        </text>
      </g>
    );
  };

  const allMetrics = [...model.axes, ...model.usage];
  const cellText = (c: { pct: number | null; formatted: string } | undefined) =>
    !c ? "" : c.pct == null ? "unavailable" : `${c.formatted} · ${c.pct}`;

  return (
    <div className="prad" style={{ fontFamily: MONO, color: INK }}>
      {/* Recharts layers take focus on click and draw a heavy outline round the plot;
          they are not keyboard stops, so this removes no real focus indicator. */}
      <style>{`.prad .recharts-surface g:focus, .prad .recharts-surface g:focus-visible, .prad .recharts-wrapper:focus, .prad .recharts-wrapper:focus-visible { outline: none; }`}</style>
      <div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: FAINT }}>
        Percentile radar (prototype) · vs {peerLabel} (≥20 GP)
      </div>

      <div role="group" aria-label={`Percentile radar for ${playerName}${compareName ? ` compared with ${compareName}` : ""}. Fixed scale 0 to 100; the dashed ring is the 50th percentile. The table below lists every value.`}
        style={{ width: "100%", height: "clamp(280px, 92vw, 380px)" }} data-testid="percentile-radar-plot">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="68%" margin={{ top: 20, right: 22, bottom: 20, left: 22 }} accessibilityLayer={false}>
            <PolarGrid stroke="#b8a070" strokeOpacity={0.6} />
            <PolarAngleAxis dataKey="axis" tick={Tick as never} />
            <PolarRadiusAxis angle={90 - 180 / data.length} domain={[RADAR_DOMAIN[0], RADAR_DOMAIN[1]]} ticks={[...RADAR_TICKS]} axisLine={false}
              tick={{ fontSize: 9, fill: FAINT, fontFamily: MONO }} />
            {/* 50th-percentile reference ring: constant, never null. */}
            <Radar name="50th percentile" dataKey="ref" stroke={FAINT} strokeDasharray="5 4" strokeWidth={1.5} fill="none" dot={false}
              isAnimationActive={false} legendType="none" />
            {hasCompare && (
              <Radar name={compareName} dataKey="compare" stroke={COMPARE} fill="none" isAnimationActive={false}
                shape={polygon(COMPARE, drawCompare) as never} dot={dots(COMPARE, "compare") as never} />
            )}
            <Radar name={playerName} dataKey="player" stroke={PLAYER} fill="none" isAnimationActive={false}
              shape={polygon(PLAYER, drawPlayer) as never} dot={dots(PLAYER, "player") as never} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <ul style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", listStyle: "none", margin: "2px 0 0", padding: 0, fontSize: 10 }}>
        <li><span aria-hidden="true" style={{ color: PLAYER }}>●</span> {playerName}</li>
        {hasCompare && <li><span aria-hidden="true" style={{ color: COMPARE }}>●</span> {compareName}</li>}
        <li><span aria-hidden="true" style={{ color: FAINT }}>┅</span> 50th percentile (middle of {peerLabel})</li>
      </ul>
      <p style={{ margin: "4px 0 0", fontSize: 10, lineHeight: 1.4, color: FAINT }}>
        Scale is fixed at 0–100 percentile. {drawPlayer ? "" : `${playerName} has at least one unavailable metric, so no polygon is drawn; only the available points are shown. A missing value is never plotted as zero or as the 50th. `}
        The shape and area are not a rating. Time on ice, competition and zone starts describe how a player is used, not how well he plays, so they are in the table and not on the radar.
      </p>

      {/* Details for the selected axis: reachable by tapping the radar or the table buttons. */}
      <div role="status" data-testid="radar-detail" aria-live="polite" style={{ minHeight: 34, margin: "6px 0", padding: "6px 8px", border: "1px solid #c8b890", background: "#efe6cc", fontSize: 11, lineHeight: 1.4 }}>
        {selected ? axisDetail(selected, playerName, hasCompare ? compareName : undefined) : "Select a metric in the table or tap a point for its value, percentile and group median."}
      </div>

      <div style={{ overflowX: "auto" }} role="region" aria-label="Percentile radar values" tabIndex={0}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <caption style={{ textAlign: "left", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: FAINT, paddingBottom: 3 }}>
            Value · percentile (0–100) for every metric. “unavailable” = not measured.
          </caption>
          <thead>
            <tr style={{ borderBottom: "1px solid #b8a070" }}>
              <th scope="col" style={{ textAlign: "left", padding: "3px 4px 3px 0" }}>Metric (unit)</th>
              <th scope="col" style={{ textAlign: "right", padding: "3px 4px" }}>{playerName.split(" ").slice(-1)[0]}</th>
              {hasCompare && <th scope="col" style={{ textAlign: "right", padding: "3px 4px" }}>{(compareName ?? "").split(" ").slice(-1)[0]}</th>}
              <th scope="col" style={{ textAlign: "right", padding: "3px 0 3px 4px" }}>Group median</th>
            </tr>
          </thead>
          <tbody>
            {(["production", "impact", "usage"] as const).map(group => {
              const list = allMetrics.filter(m => m.group === group);
              if (list.length === 0) return null;
              const title = group === "production" ? "Production (on the radar)"
                : group === "impact" ? "On-ice impact (on the radar)"
                : "Usage and context (role, not ability; not on the radar)";
              return (
                <React.Fragment key={group}>
                  <tr><th scope="rowgroup" colSpan={hasCompare ? 4 : 3} style={{ textAlign: "left", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: FAINT, padding: "6px 0 2px" }}>{title}</th></tr>
                  {list.map(m => (
                    <tr key={m.key} style={{ borderBottom: "1px solid #d8cba8", background: active === m.key ? "#efe6cc" : "transparent", verticalAlign: "top" }}>
                      <th scope="row" style={{ textAlign: "left", padding: "2px 4px 2px 0", fontWeight: 800 }}>
                        <button type="button" onClick={() => setActive(m.key)} aria-pressed={active === m.key}
                          aria-label={`Show details for ${m.label}`}
                          style={{ minHeight: 44, padding: "0 6px 0 0", background: "transparent", border: 0, textAlign: "left", font: "inherit", color: INK, cursor: "pointer" }}>
                          {m.label}
                          <span style={{ display: "block", fontSize: 9, fontWeight: 400, color: FAINT }}>{m.unit}</span>
                        </button>
                      </th>
                      <td style={{ textAlign: "right", padding: "2px 4px", fontVariantNumeric: "tabular-nums" }}>{cellText(m.player)}</td>
                      {hasCompare && <td style={{ textAlign: "right", padding: "2px 4px", fontVariantNumeric: "tabular-nums" }}>{cellText(m.compare)}</td>}
                      <td style={{ textAlign: "right", padding: "2px 0 2px 4px", fontVariantNumeric: "tabular-nums", color: FAINT }}>{m.player.median}</td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
