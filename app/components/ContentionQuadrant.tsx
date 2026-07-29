"use client";

import React from "react";
import { CONTENTION_THRESHOLDS, classifyContention } from "@/app/armchair-gm/contention";

export interface ContentionData {
  present:      number;
  future:       number;
  quadrant:     "WIN_NOW" | "WINDOW_OPEN" | "WINDOW_OPENING" | "REBUILDING";
  presentLabel: string;
  futureLabel:  string;
}

const QUADRANT_META: Record<string, { label: string; color: string; bg: string }> = {
  WIN_NOW:        { label: "Win Now",        color: "#c8913a", bg: "rgba(200,145,58,0.10)" },
  WINDOW_OPEN:    { label: "Window Open",    color: "#2a7a3c", bg: "rgba(42,122,60,0.10)"  },
  WINDOW_OPENING: { label: "Window Opening", color: "#1a5fa8", bg: "rgba(26,95,168,0.10)"  },
  REBUILDING:     { label: "Rebuilding",     color: "#7a7a7a", bg: "rgba(120,120,120,0.10)"},
};

const PLOT_W = 176;
const PLOT_H = 136;
const PAD    = 20;

function ratingToX(v: number) { return PAD + (v / 10) * (PLOT_W - PAD * 2); }
function ratingToY(v: number) { return PAD + ((10 - v) / 10) * (PLOT_H - PAD * 2); }

// CXH7 — the chart reads the model's own thresholds instead of a 5.0/5.0
// crosshair it invented. Present has three bands and future two, so there are
// six regions, not four; each is labelled by asking `classifyContention` at
// its own centroid, which makes it impossible for the picture to contradict
// the verdict printed beneath it.
const T = CONTENTION_THRESHOLDS;
const X_PLAYOFF   = ratingToX(T.presentPlayoff);
const X_CONTENDER = ratingToX(T.presentContender);
const Y_OPEN      = ratingToY(T.futureOpen);
const Y_OPENING   = ratingToY(T.futureOpening);

const PRESENT_BANDS: [number, number][] = [
  [0, T.presentPlayoff],
  [T.presentPlayoff, T.presentContender],
  [T.presentContender, 10],
];
const FUTURE_BANDS: [number, number][] = [
  [0, T.futureOpen],
  [T.futureOpen, 10],
];

const REGIONS = PRESENT_BANDS.flatMap(([p0, p1]) =>
  FUTURE_BANDS.map(([f0, f1]) => {
    const present = (p0 + p1) / 2;
    const future = (f0 + f1) / 2;
    return {
      key: classifyContention(present, future),
      x: ratingToX(p0),
      y: ratingToY(f1),
      w: ratingToX(p1) - ratingToX(p0),
      h: ratingToY(f0) - ratingToY(f1),
    };
  }));

const TEAM_COLORS = ["var(--blue)", "var(--red)"];

export default function ContentionQuadrant({
  home, partner, homeTeamName, partnerTeamName,
}: {
  home:            ContentionData;
  partner:         ContentionData;
  homeTeamName:    string;
  partnerTeamName: string;
}) {
  const teams = [
    { data: home,    name: homeTeamName,    color: TEAM_COLORS[0] },
    { data: partner, name: partnerTeamName, color: TEAM_COLORS[1] },
  ];

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>

      {/* ── Scatter plot ── */}
      <div style={{ flexShrink: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 900, color: "var(--ledger-ink-faint)",
          textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 5,
          fontFamily: "'Courier Prime', monospace",
        }}>
          Contention Quadrant
        </div>
        <svg
          width={PLOT_W}
          height={PLOT_H}
          viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
          style={{ overflow: "visible", display: "block" }}
        >
          {/* Quadrant fills */}
          {/* Shading comes from the same regions as the labels — a cell can
              never be tinted one verdict and captioned another. */}
          {REGIONS.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={QUADRANT_META[r.key].bg} />
          ))}

          {/* Axes */}
          <line x1={PAD} y1={PAD} x2={PAD} y2={PLOT_H - PAD} stroke="#c8b890" strokeWidth={0.5} />
          <line x1={PAD} y1={PLOT_H - PAD} x2={PLOT_W - PAD} y2={PLOT_H - PAD} stroke="#c8b890" strokeWidth={0.5} />
          <line x1={X_PLAYOFF} y1={PAD} x2={X_PLAYOFF} y2={PLOT_H - PAD} stroke="#c8b890" strokeWidth={0.8} strokeDasharray="3 3" />
          <line x1={X_CONTENDER} y1={PAD} x2={X_CONTENDER} y2={PLOT_H - PAD} stroke="#c8b890" strokeWidth={0.8} strokeDasharray="3 3" />
          <line x1={PAD} y1={Y_OPEN} x2={PLOT_W - PAD} y2={Y_OPEN} stroke="#c8b890" strokeWidth={0.8} strokeDasharray="3 3" />
          <line x1={PAD} y1={Y_OPENING} x2={PLOT_W - PAD} y2={Y_OPENING} stroke="#c8b890" strokeWidth={0.4} strokeDasharray="1 4" opacity={0.7} />

          {/* Region labels, derived from the classifier so they cannot drift */}
          {REGIONS.map((r, i) => {
            const meta = QUADRANT_META[r.key];
            return (
              <text
                key={i}
                x={r.x + 3}
                y={r.y + 8}
                fontSize={5.5}
                fill={meta.color}
                fontFamily="'Courier Prime', monospace"
                fontWeight={700}>
                {meta.label.toUpperCase()}
              </text>
            );
          })}

          {/* Axis labels */}
          <text x={(PAD + PLOT_W - PAD) / 2} y={PLOT_H - 4} fontSize={6.5} fill="#8a7a5a" textAnchor="middle" fontFamily="'Courier Prime', monospace">
            Present →
          </text>
          <text
            x={7} y={(PAD + PLOT_H - PAD) / 2}
            fontSize={6.5} fill="#8a7a5a" textAnchor="middle"
            fontFamily="'Courier Prime', monospace"
            transform={`rotate(-90 7 ${(PAD + PLOT_H - PAD) / 2})`}
          >
            Future →
          </text>

          {/* Team dots */}
          {teams.map(({ data, name, color }, i) => {
            const cx = ratingToX(Math.min(9.8, Math.max(0.2, data.present)));
            const cy = ratingToY(Math.min(9.8, Math.max(0.2, data.future)));
            const anchor = cx > PLOT_W / 2 ? "end" : "start";
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={4.5} fill={color} opacity={0.85} />
                <text
                  x={anchor === "end" ? cx - 6 : cx + 6}
                  y={cy - 6}
                  fontSize={6.5} fill={color}
                  textAnchor={anchor}
                  fontFamily="'Courier Prime', monospace" fontWeight={700}
                >
                  {name.length > 14 ? name.slice(0, 13) + "…" : name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── Stat cards — always side-by-side ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 6,
        flex: "1 1 200px",
        alignSelf: "center",
      }}>
        {teams.map(({ data, name, color }, i) => {
          const meta = QUADRANT_META[data.quadrant];
          return (
            <div key={i} style={{
              background: meta.bg,
              border: `1px solid ${meta.color}40`,
              padding: "7px 8px",
            }}>
              <div style={{
                fontSize: 9, fontWeight: 900, color,
                fontFamily: "'Courier Prime', monospace",
                textTransform: "uppercase", letterSpacing: "0.07em",
                marginBottom: 2, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {name}
              </div>
              <div style={{
                fontSize: 10, fontWeight: 900, color: meta.color,
                fontFamily: "'Courier Prime', monospace", marginBottom: 5,
              }}>
                {meta.label}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 9.5, color: "var(--ledger-ink-faint)", fontFamily: "'Courier Prime', monospace", letterSpacing: "0.05em" }}>PRESENT</div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "var(--ledger-ink)", fontFamily: "'Courier Prime', monospace", lineHeight: 1.1 }}>
                    {data.present.toFixed(1)}
                  </div>
                  <div style={{ fontSize: 9.5, color: "var(--ledger-ink-faint)", fontFamily: "'Courier Prime', monospace" }}>{data.presentLabel}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, color: "var(--ledger-ink-faint)", fontFamily: "'Courier Prime', monospace", letterSpacing: "0.05em" }}>FUTURE</div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "var(--ledger-ink)", fontFamily: "'Courier Prime', monospace", lineHeight: 1.1 }}>
                    {data.future.toFixed(1)}
                  </div>
                  <div style={{ fontSize: 9.5, color: "var(--ledger-ink-faint)", fontFamily: "'Courier Prime', monospace" }}>{data.futureLabel}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
