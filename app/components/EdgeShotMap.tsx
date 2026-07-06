"use client";

// ── EDGE Shot Map — shots-on-goal zone map + zone time ────────
// Newspaper rendition of NHL EDGE's skater detail: an offensive-half
// rink with the league's 17 shot areas, filled by shot-count percentile,
// plus the location summary and zone-time splits. Data comes from
// /api/player-edge/{nhlId} (the nightly nhl_snapshots feed).

import React, { useEffect, useState } from "react";

interface SogDetail { area: string; shots: number; shotsPercentile: number }
interface SogSummary {
  locationCode: string;
  shots: number; shotsPercentile: number; shotsLeagueAvg: number;
  goals: number; shootingPctg: number; shootingPctgLeagueAvg: number;
}
interface EdgePayload {
  capturedAt: number;
  sogDetails: SogDetail[];
  sogSummary: SogSummary[];
  zoneTime: {
    offensiveZonePctg: number; offensiveZonePercentile: number; offensiveZoneLeagueAvg: number;
    neutralZonePctg: number; neutralZoneLeagueAvg: number;
    defensiveZonePctg: number; defensiveZoneLeagueAvg: number;
  } | null;
  speedMax: number | null;
  burstsOver20: number | null;
  topShotSpeed: number | null;
}

// Half-rink layout (attacking downward like EDGE): viewBox 0 0 200 150,
// goal line at y=28. Approximate NHL EDGE zone geometry.
const ZONES: Record<string, { x: number; y: number; w: number; h: number }> = {
  "Behind the Net":  { x: 55,  y: 10, w: 90, h: 17 },
  "L Corner":        { x: 10,  y: 10, w: 44, h: 30 },
  "R Corner":        { x: 146, y: 10, w: 44, h: 30 },
  "L Net Side":      { x: 55,  y: 28, w: 30, h: 24 },
  "Crease":          { x: 86,  y: 28, w: 28, h: 15 },
  "R Net Side":      { x: 115, y: 28, w: 30, h: 24 },
  "Low Slot":        { x: 76,  y: 44, w: 48, h: 26 },
  "L Circle":        { x: 25,  y: 41, w: 50, h: 40 },
  "R Circle":        { x: 125, y: 41, w: 50, h: 40 },
  "High Slot":       { x: 76,  y: 71, w: 48, h: 26 },
  "Outside L":       { x: 10,  y: 82, w: 55, h: 34 },
  "Outside R":       { x: 135, y: 82, w: 55, h: 34 },
  "L Point":         { x: 10,  y: 117, w: 58, h: 25 },
  "Center Point":    { x: 69,  y: 98, w: 62, h: 44 },
  "R Point":         { x: 132, y: 117, w: 58, h: 25 },
};

const SUMMARY_LABEL: Record<string, string> = {
  all: "All Locations", high: "High-Danger", mid: "Mid-Range", long: "Long-Range",
};

const pctColor = (p: number) =>
  p >= 0.9 ? "rgba(44,62,107,0.92)" : p >= 0.7 ? "rgba(44,62,107,0.68)" :
  p >= 0.5 ? "rgba(44,62,107,0.45)" : p > 0 ? "rgba(44,62,107,0.24)" : "rgba(44,62,107,0.08)";

export default function EdgeShotMap({ nhlPlayerId }: { nhlPlayerId: string | number }) {
  const [data, setData] = useState<EdgePayload | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    let alive = true;
    setState("loading");
    setData(null);
    if (!/^\d+$/.test(String(nhlPlayerId))) { setState("empty"); return; }
    fetch(`/api/player-edge/${nhlPlayerId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (d?.sogDetails?.length) { setData(d); setState("ready"); }
        else setState("empty");
      })
      .catch(() => { if (alive) setState("empty"); });
    return () => { alive = false; };
  }, [nhlPlayerId]);

  if (state === "loading") {
    return <div className="py-8 text-center text-[10px] font-mono uppercase tracking-[0.25em]" style={{ color: "var(--ledger-ink-faint)" }}>Pulling EDGE data…</div>;
  }
  if (state === "empty" || !data) {
    return (
      <div className="py-8 text-center text-[10px] font-mono uppercase tracking-wider leading-relaxed" style={{ color: "var(--ledger-ink-faint)" }}>
        No EDGE snapshot captured for this player yet.<br />
        The nightly feed covers the league on an 8-day rotation.
      </div>
    );
  }

  const byArea = new Map(data.sogDetails.map((d) => [d.area, d]));
  const offMap = data.sogDetails.filter((d) => !(d.area in ZONES));

  return (
    <div>
      {/* Rink map */}
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <svg viewBox="0 0 200 150" className="w-full sm:w-1/2 max-w-[340px]" role="img" aria-label="Shots on goal by zone">
          {/* boards + goal line + net */}
          <rect x="8" y="8" width="184" height="136" rx="26" fill="var(--paper-inset, #efe8d8)" stroke="var(--rule, #c8b890)" strokeWidth="1.5" />
          <line x1="10" y1="28" x2="190" y2="28" stroke="#b83020" strokeWidth="1" opacity="0.6" />
          <rect x="92" y="22" width="16" height="6" fill="none" stroke="#b83020" strokeWidth="1.2" />
          {Object.entries(ZONES).map(([area, r]) => {
            const d = byArea.get(area);
            const shots = d?.shots ?? 0;
            const pct = d?.shotsPercentile ?? 0;
            return (
              <g key={area}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={3}
                  fill={pctColor(pct)} stroke="var(--paper, #f7f1e3)" strokeWidth="1">
                  <title>{`${area}: ${shots} shots (${Math.round(pct * 100)}th pct)`}</title>
                </rect>
                <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 3} textAnchor="middle"
                  fontSize="8.5" fontFamily="monospace" fontWeight="900"
                  fill={pct >= 0.5 ? "#fff" : "var(--ink, #2a2318)"}>
                  {shots}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Location summary — shots + finishing vs league */}
        <div className="flex-1 w-full">
          {data.sogSummary.map((s) => {
            const finishing = s.shootingPctg - s.shootingPctgLeagueAvg;
            return (
              <div key={s.locationCode} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: "var(--rule-light)" }}>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 text-[9px] font-black font-mono" style={{
                    background: pctColor(s.shotsPercentile), color: s.shotsPercentile >= 0.5 ? "#fff" : "var(--ink)", borderRadius: 2,
                  }}>
                    {Math.round(s.shotsPercentile * 100)}th
                  </span>
                  <span className="text-[10px] font-black font-mono uppercase tracking-wider" style={{ color: "var(--ink)" }}>
                    {SUMMARY_LABEL[s.locationCode] ?? s.locationCode}
                  </span>
                </div>
                <span className="text-[10px] font-mono tabular-nums" style={{ color: "var(--ledger-ink-body, var(--ink))" }}>
                  <strong>{s.shots}</strong> <span style={{ color: "var(--ledger-ink-faint)" }}>({Math.round(s.shotsLeagueAvg)} avg)</span>
                  {" · "}{(s.shootingPctg * 100).toFixed(1)}%
                  <span style={{ color: finishing >= 0 ? "var(--ledger-green)" : "var(--ledger-red)" }}>
                    {" "}{finishing >= 0 ? "+" : ""}{(finishing * 100).toFixed(1)}
                  </span>
                </span>
              </div>
            );
          })}

          {/* Zone time */}
          {data.zoneTime && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {([
                ["DEF ZONE", data.zoneTime.defensiveZonePctg, data.zoneTime.defensiveZoneLeagueAvg, true],
                ["NEUTRAL", data.zoneTime.neutralZonePctg, data.zoneTime.neutralZoneLeagueAvg, false],
                ["OFF ZONE", data.zoneTime.offensiveZonePctg, data.zoneTime.offensiveZoneLeagueAvg, false],
              ] as [string, number, number, boolean][]).map(([label, val, avg, invert]) => {
                const better = invert ? val < avg : val > avg;
                return (
                  <div key={label} className="text-center border py-2 px-1" style={{ borderColor: "var(--rule)", borderRadius: 2, background: "var(--paper-inset)" }}>
                    <div className="text-[8px] font-black font-mono uppercase tracking-wider" style={{ color: "var(--ledger-ink-faint)" }}>{label}</div>
                    <div className="text-[15px] font-black font-mono tabular-nums" style={{ color: better ? "var(--ledger-green)" : "var(--ink)" }}>
                      {(val * 100).toFixed(1)}%
                    </div>
                    <div className="text-[8px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>lg {(avg * 100).toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Speed strip + off-map areas */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[9px] font-mono uppercase tracking-wider" style={{ color: "var(--ledger-ink-faint)" }}>
            {data.speedMax != null && <span>Top Speed <strong style={{ color: "var(--ink)" }}>{data.speedMax.toFixed(1)} mph</strong></span>}
            {data.burstsOver20 != null && <span>20+ mph Bursts <strong style={{ color: "var(--ink)" }}>{data.burstsOver20}</strong></span>}
            {data.topShotSpeed != null && <span>Hardest Shot <strong style={{ color: "var(--ink)" }}>{data.topShotSpeed.toFixed(1)} mph</strong></span>}
            {offMap.map((d) => (
              <span key={d.area}>{d.area} <strong style={{ color: "var(--ink)" }}>{d.shots}</strong></span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 text-[8px] font-mono uppercase tracking-wider" style={{ color: "var(--ledger-ink-faint)" }}>
        Source: NHL EDGE via nightly snapshot · captured {new Date(data.capturedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · zone fill = shot-volume percentile · ± = finishing vs league
      </div>
    </div>
  );
}
