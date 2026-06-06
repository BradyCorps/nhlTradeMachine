"use client";

import React from "react";
import { calcPlayerTimeline } from "@/app/lib/player-timeline";
import type { AssetInput } from "@/app/lib/xnav-engine";

const W   = 280;
const H   = 130;
const PAD = { top: 20, right: 10, bottom: 28, left: 28 };

const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top  - PAD.bottom;

function navColor(nav: number): string {
  if (nav >= 160) return "#2a7a3c";  // elite — green
  if (nav >= 100) return "#1a5fa8";  // good  — blue
  if (nav >= 50)  return "#c8913a";  // okay  — amber
  if (nav >= 0)   return "#7a7a7a";  // poor  — grey
  return "#b83020";                   // negative — red
}

export default function PlayerTimeline({ asset }: { asset: AssetInput }) {
  const years = calcPlayerTimeline(asset);
  if (years.length === 0) return null;

  const maxNav  = Math.max(...years.map(y => Math.max(y.nav, 10)), 50);
  const minNav  = Math.min(...years.map(y => y.nav), 0);
  const navSpan = Math.max(maxNav - Math.min(minNav, 0), 10);

  const n     = years.length;
  const gap   = 4;
  const bw    = Math.floor((plotW - gap * (n - 1)) / n);

  // Y axis: 0 baseline or minNav if negative
  const yZero  = PAD.top + plotH - Math.max(0, (0 - Math.min(minNav, 0)) / navSpan * plotH);
  const toY    = (nav: number) => PAD.top + plotH - ((nav - Math.min(minNav, 0)) / navSpan * plotH);

  // Extension boundary — first year with different capHit
  const extStartYear = years.findIndex((y, i) => i > 0 && y.capHit !== years[0].capHit);

  return (
    <div>
      <div style={{
        fontSize: 9, fontWeight: 900, color: "var(--ledger-ink-faint)",
        textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 6,
        fontFamily: "'Courier Prime', monospace",
      }}>
        Contract Projection
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", overflow: "visible" }}>

        {/* Y-axis ticks */}
        {[0, Math.round(maxNav / 2), maxNav].map(tick => {
          const y = toY(tick);
          return (
            <g key={tick}>
              <line x1={PAD.left - 3} y1={y} x2={PAD.left} y2={y}
                stroke="#c8b890" strokeWidth={0.5} />
              <text x={PAD.left - 5} y={y + 3.5} fontSize={6.5} fill="#8a7a5a"
                textAnchor="end" fontFamily="'Courier Prime', monospace">
                {tick}
              </text>
            </g>
          );
        })}

        {/* Zero baseline */}
        <line x1={PAD.left} y1={yZero} x2={PAD.left + plotW} y2={yZero}
          stroke="#c8b890" strokeWidth={0.5} />

        {/* Left axis */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH}
          stroke="#c8b890" strokeWidth={0.5} />

        {/* Extension boundary marker */}
        {extStartYear > 0 && (
          <line
            x1={PAD.left + extStartYear * (bw + gap) - gap / 2}
            y1={PAD.top}
            x2={PAD.left + extStartYear * (bw + gap) - gap / 2}
            y2={PAD.top + plotH}
            stroke="#c8913a" strokeWidth={0.8} strokeDasharray="2 2" opacity={0.6}
          />
        )}

        {/* Bars */}
        {years.map((y, i) => {
          const x  = PAD.left + i * (bw + gap);
          const bh = Math.abs(toY(y.nav) - yZero);
          const by = y.nav >= 0 ? toY(y.nav) : yZero;
          const color = navColor(y.nav);
          const labelY = y.nav >= 0 ? toY(y.nav) - 3 : yZero + bh + 9;

          return (
            <g key={i}>
              {/* Bar */}
              <rect x={x} y={by} width={bw} height={Math.max(bh, 1)} fill={color} opacity={0.85} />

              {/* NAV value label */}
              <text x={x + bw / 2} y={labelY} fontSize={6.5} fill={color}
                textAnchor="middle" fontWeight={900}
                fontFamily="'Courier Prime', monospace">
                {y.nav > 0 ? `+${y.nav}` : y.nav}
              </text>

              {/* Year label */}
              <text x={x + bw / 2} y={H - PAD.bottom + 10} fontSize={7} fill="#8a7a5a"
                textAnchor="middle" fontFamily="'Courier Prime', monospace">
                Yr {y.year}
              </text>

              {/* Age label */}
              <text x={x + bw / 2} y={H - PAD.bottom + 19} fontSize={6} fill="#b8a070"
                textAnchor="middle" fontFamily="'Courier Prime', monospace">
                {y.age}
              </text>
            </g>
          );
        })}

        {/* Extension label */}
        {extStartYear > 0 && (
          <text
            x={PAD.left + extStartYear * (bw + gap)}
            y={PAD.top - 5}
            fontSize={6} fill="#c8913a"
            fontFamily="'Courier Prime', monospace" fontWeight={900}
          >
            EXT
          </text>
        )}

        {/* Axis label */}
        <text x={PAD.left + plotW / 2} y={H - 1} fontSize={6.5} fill="#8a7a5a"
          textAnchor="middle" fontFamily="'Courier Prime', monospace">
          Contract Year  ·  Age
        </text>

      </svg>
    </div>
  );
}