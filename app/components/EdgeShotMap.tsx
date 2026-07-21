"use client";

// ── EDGE Shot Map — shots-on-goal zone map + zone time ────────
// Newspaper rendition of NHL EDGE's skater detail: an offensive-half
// rink with the league's shot areas as labeled tiles, filled by
// shot-volume percentile, plus the location summary and zone-time
// splits. Data comes from /api/player-edge/{nhlId} (nightly snapshots).

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

// Anatomical tile layout, attacking downward (net at top) like EDGE.
// Non-overlapping rows with gutters; every tile carries its own label
// so the map reads without hover (mobile-first accessibility).
interface Tile { x: number; y: number; w: number; h: number; label: string }
const ZONES: Record<string, Tile> = {
  "L Corner":       { x: 12,  y: 12,  w: 44, h: 26, label: "L CORNER" },
  "Behind the Net": { x: 60,  y: 12,  w: 100, h: 26, label: "BEHIND NET" },
  "R Corner":       { x: 164, y: 12,  w: 44, h: 26, label: "R CORNER" },
  "L Net Side":     { x: 12,  y: 42,  w: 60, h: 28, label: "L NET SIDE" },
  "Crease":         { x: 76,  y: 42,  w: 68, h: 28, label: "CREASE" },
  "R Net Side":     { x: 148, y: 42,  w: 60, h: 28, label: "R NET SIDE" },
  "L Circle":       { x: 12,  y: 74,  w: 60, h: 32, label: "L CIRCLE" },
  "Low Slot":       { x: 76,  y: 74,  w: 68, h: 32, label: "LOW SLOT" },
  "R Circle":       { x: 148, y: 74,  w: 60, h: 32, label: "R CIRCLE" },
  "Outside L":      { x: 12,  y: 110, w: 60, h: 30, label: "OUTSIDE L" },
  "High Slot":      { x: 76,  y: 110, w: 68, h: 30, label: "HIGH SLOT" },
  "Outside R":      { x: 148, y: 110, w: 60, h: 30, label: "OUTSIDE R" },
  "L Point":        { x: 12,  y: 144, w: 60, h: 28, label: "L POINT" },
  "Center Point":   { x: 76,  y: 144, w: 68, h: 28, label: "CENTER PT" },
  "R Point":        { x: 148, y: 144, w: 60, h: 28, label: "R POINT" },
};

const SUMMARY_LABEL: Record<string, string> = {
  all: "All Locations", high: "High-Danger", mid: "Mid-Range", long: "Long-Range",
};
const SUMMARY_ORDER = ["all", "high", "mid", "long"];

const pctColor = (p: number) =>
  p >= 0.9 ? "rgba(44,62,107,0.92)" : p >= 0.7 ? "rgba(44,62,107,0.66)" :
  p >= 0.5 ? "rgba(44,62,107,0.42)" : p > 0 ? "rgba(44,62,107,0.20)" : "rgba(44,62,107,0.07)";

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
    return (
      <div className="py-10 text-center" role="status" aria-live="polite">
        <div className="text-[11px] font-mono font-black uppercase tracking-[0.25em]" style={{ color: "var(--ledger-ink-body, var(--ledger-ink))" }}>
          Pulling EDGE tracking data…
        </div>
        <div className="mt-3 mx-auto max-w-xs h-[8px] border relative overflow-hidden"
          style={{ borderColor: "var(--ledger-ink)", background: "var(--paper-bg)" }} aria-hidden="true">
          <div className="edge-load-sweep h-full" style={{ width: "35%", background: "var(--ledger-red)", opacity: 0.7 }} />
        </div>
        <style>{`
          .edge-load-sweep { animation: edge-sweep 1.2s ease-in-out infinite alternate; }
          @keyframes edge-sweep { from { margin-left: 0; } to { margin-left: 65%; } }
          @media (prefers-reduced-motion: reduce) { .edge-load-sweep { animation: none; margin-left: 32%; } }
        `}</style>
      </div>
    );
  }
  if (state === "empty" || !data) {
    return (
      <div className="py-10 text-center text-[11px] font-mono uppercase tracking-wider leading-relaxed" style={{ color: "var(--ledger-ink-body, var(--ledger-ink))" }}>
        No EDGE snapshot captured for this player yet.<br />
        The nightly feed covers the league on an 8-day rotation.
      </div>
    );
  }

  const byArea = new Map(data.sogDetails.map((d) => [d.area, d]));
  const offMap = data.sogDetails.filter((d) => !(d.area in ZONES));
  const summaries = [...data.sogSummary].sort(
    (a, b) => SUMMARY_ORDER.indexOf(a.locationCode) - SUMMARY_ORDER.indexOf(b.locationCode));

  return (
    <div>
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Rink map — full width on mobile */}
        <div className="w-full lg:w-[46%] lg:max-w-[380px] mx-auto">
          <svg viewBox="0 0 220 184" className="w-full" role="img" aria-label="Shots on goal by zone">
            {/* rink outline + goal line + net */}
            <rect x="4" y="4" width="212" height="176" rx="30" fill="var(--paper-inset, #efe8d8)" stroke="var(--rule, #c8b890)" strokeWidth="1.5" />
            <line x1="6" y1="40" x2="214" y2="40" stroke="#b83020" strokeWidth="1" opacity="0.5" />
            <rect x="100" y="34" width="20" height="7" fill="none" stroke="#b83020" strokeWidth="1.3" />
            {Object.entries(ZONES).map(([area, t]) => {
              const d = byArea.get(area);
              const shots = d?.shots ?? 0;
              const pct = d?.shotsPercentile ?? 0;
              const onDark = pct >= 0.5;
              return (
                <g key={area}>
                  <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={4}
                    fill={pctColor(pct)} stroke="var(--rule-light, #ddd2b8)" strokeWidth="0.75">
                    <title>{`${area}: ${shots} shots — ${Math.round(pct * 100)}th percentile`}</title>
                  </rect>
                  <text x={t.x + t.w / 2} y={t.y + t.h / 2 + 1} textAnchor="middle"
                    fontSize="12" fontFamily="monospace" fontWeight="900"
                    fill={onDark ? "#fff" : "var(--ink, #2a2318)"}>
                    {shots}
                  </text>
                  <text x={t.x + t.w / 2} y={t.y + t.h - 4} textAnchor="middle"
                    fontSize="5.5" fontFamily="monospace" letterSpacing="0.5"
                    fill={onDark ? "rgba(255,255,255,0.75)" : "var(--ledger-ink-faint, #8a7a5c)"}>
                    {t.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="flex items-center justify-center gap-3 mt-1.5 text-[9px] font-mono uppercase tracking-wider" style={{ color: "var(--ledger-ink-faint)" }}>
            <span>Shot volume:</span>
            {[0.2, 0.5, 0.7, 0.9].map((p) => (
              <span key={p} className="flex items-center gap-1">
                <span className="inline-block w-3 h-3" style={{ background: pctColor(p + 0.01), borderRadius: 2 }} />
                {Math.round(p * 100)}th+
              </span>
            ))}
          </div>
        </div>

        {/* Location summary + zone time */}
        <div className="flex-1 w-full min-w-0">
          {summaries.map((s) => {
            const finishing = s.shootingPctg - s.shootingPctgLeagueAvg;
            return (
              <div key={s.locationCode} className="py-2 border-b" style={{ borderColor: "var(--rule-light)" }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 text-[10px] font-black font-mono tabular-nums" style={{
                      background: pctColor(s.shotsPercentile), color: s.shotsPercentile >= 0.5 ? "#fff" : "var(--ink)", borderRadius: 2,
                    }}>
                      {Math.round(s.shotsPercentile * 100)}th
                    </span>
                    <span className="text-[11px] font-black font-mono uppercase tracking-wider" style={{ color: "var(--ink)" }}>
                      {SUMMARY_LABEL[s.locationCode] ?? s.locationCode}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums font-black" style={{ color: "var(--ink)" }}>
                    {s.shots} <span className="font-normal text-[10px]" style={{ color: "var(--ledger-ink-faint)" }}>shots · lg {Math.round(s.shotsLeagueAvg)}</span>
                  </span>
                </div>
                <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--ledger-ink-body, var(--ink))" }}>
                  {s.goals} goals · shooting {(s.shootingPctg * 100).toFixed(1)}%{" "}
                  <span style={{ color: finishing >= 0 ? "var(--ledger-green)" : "var(--ledger-red)" }}>
                    ({finishing >= 0 ? "+" : ""}{(finishing * 100).toFixed(1)} vs league)
                  </span>
                </div>
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
                    <div className="text-[9px] font-black font-mono uppercase tracking-wider" style={{ color: "var(--ledger-ink-body, var(--ink))" }}>{label}</div>
                    <div className="text-[17px] font-black font-mono tabular-nums" style={{ color: better ? "var(--ledger-green)" : "var(--ink)" }}>
                      {(val * 100).toFixed(1)}%
                    </div>
                    <div className="text-[9px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>league {(avg * 100).toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Speed strip + off-map areas */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 mt-3 text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--ledger-ink-body, var(--ink))" }}>
            {data.speedMax != null && <span>Top Speed <strong>{data.speedMax.toFixed(1)}</strong> mph</span>}
            {data.burstsOver20 != null && <span>20+ mph Bursts <strong>{data.burstsOver20}</strong></span>}
            {data.topShotSpeed != null && <span>Hardest Shot <strong>{data.topShotSpeed.toFixed(1)}</strong> mph</span>}
            {offMap.map((d) => (
              <span key={d.area}>{d.area} <strong>{d.shots}</strong></span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t text-[9px] font-mono uppercase tracking-wider leading-relaxed" style={{ borderColor: "var(--rule-light)", color: "var(--ledger-ink-faint)" }}>
        Source: NHL EDGE via nightly snapshot · captured {new Date(data.capturedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · tile fill = shot-volume percentile · ± = finishing vs league
      </div>
    </div>
  );
}
