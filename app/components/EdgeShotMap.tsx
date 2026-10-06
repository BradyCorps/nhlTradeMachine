"use client";

// ── EDGE Shot Map — shots-on-goal zone map + zone time ────────
// Newspaper rendition of NHL EDGE's skater detail: an offensive-half
// rink with the league's shot areas as labeled tiles, filled by
// shot-volume percentile, plus the location summary and zone-time
// splits. Data comes from /api/player-edge/{nhlId} (nightly snapshots).

import { DEFAULT_OBSERVED_SELECTION, observedQuery, observedLabel, type ObservedSelection } from "@/app/lib/observed-season";
import React, { useEffect, useState } from "react";
import { ChartData } from "@/app/components/ChartData";
import { ordinal, pluralize } from "@/app/lib/ordinal";
import {
  PERCENTILE_CAVEAT, finiteOrNull, percentileReading, pointsVsLeague, sampleNote,
  shootingReading, shootingText, vsLeagueText,
} from "@/app/lib/edge-display";

// Every figure is optional: the feed omits fields for zero-attempt splits, and
// a missing field must never be formatted as if it were a number.
interface SogDetail { area: string; shots?: number | null; shotsPercentile?: number | null }
interface SogSummary {
  locationCode: string;
  shots?: number | null; shotsPercentile?: number | null; shotsLeagueAvg?: number | null;
  goals?: number | null; shootingPctg?: number | null; shootingPctgLeagueAvg?: number | null;
}
export interface EdgePayload {
  capturedAt: number;
  source: string;
  /** Games in the EDGE sample itself — the exposure behind every count. */
  gamesPlayed?: number | null;
  season: string;
  gameType: number;
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

// Low-volume tiles were nearly invisible (0.07 / 0.20 over cream), so a zone
// with a few real shots read as empty. Floor lifted and the low band widened so
// every non-zero tile is legibly filled while the high end still dominates.
// Tiles with no usable percentile (zero count, missing, out of range) share one
// neutral fill so shading only ever encodes a percentile that may be shown.
const NO_RANK_FILL = "rgba(44,62,107,0.06)";
const pctColor = (p: number) =>
  p >= 0.9 ? "rgba(44,62,107,0.94)" : p >= 0.7 ? "rgba(44,62,107,0.70)" :
  p >= 0.5 ? "rgba(44,62,107,0.48)" : p > 0 ? "rgba(44,62,107,0.30)" : "rgba(44,62,107,0.12)";

export default function EdgeShotMap({ nhlPlayerId, selection = DEFAULT_OBSERVED_SELECTION }: { nhlPlayerId: string | number; selection?: ObservedSelection }) {
  const { season, gameType } = selection;
  const [data, setData] = useState<EdgePayload | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "zero">("loading");

  useEffect(() => {
    let alive = true;
    setState("loading");
    setData(null);
    if (!/^\d+$/.test(String(nhlPlayerId))) { setState("empty"); return; }
    fetch(`/api/player-edge/${nhlPlayerId}?${observedQuery({ season, gameType })}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (d?.season === season && d?.gameType === gameType && d?.coverage === "zero-games") { setData(d); setState("zero"); }
        else if (d?.season === season && d?.gameType === gameType && d?.sogDetails?.length) { setData(d); setState("ready"); }
        else setState("empty");
      })
      .catch(() => { if (alive) setState("empty"); });
    return () => { alive = false; };
  }, [nhlPlayerId, season, gameType]);

  if (state === "loading" || (data && (data.season !== season || data.gameType !== gameType))) {
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
  if (state === "zero") return <p className="py-10 text-center text-[11px] font-mono">NHL EDGE · {observedLabel(selection)} · confirmed zero games.</p>;
  if (state === "empty" || !data) {
    return (
      <div className="py-10 text-center text-[11px] font-mono uppercase tracking-wider leading-relaxed" style={{ color: "var(--ledger-ink-body, var(--ledger-ink))" }}>
        EDGE coverage missing or delayed for {observedLabel(selection)}.<br />
        No other season has been substituted.
      </div>
    );
  }

  return <EdgeShotView data={data} selection={selection} />;
}

// Pure rendering of a loaded payload — exported so the zero-shot and
// small-sample behaviour can be tested without a browser or a fetch.
export function EdgeShotView({ data, selection }: { data: EdgePayload; selection: ObservedSelection }) {
  const byArea = new Map(data.sogDetails.map((d) => [d.area, d]));
  const offMap = data.sogDetails.filter((d) => !(d.area in ZONES));
  const summaries = [...data.sogSummary].sort(
    (a, b) => SUMMARY_ORDER.indexOf(a.locationCode) - SUMMARY_ORDER.indexOf(b.locationCode));

  const small = sampleNote(data.gamesPlayed);
  const gp = finiteOrNull(data.gamesPlayed);
  return (
    <div>
      <p className="mb-2 text-[10px] font-mono leading-relaxed" style={{ color: "var(--ledger-ink-body, var(--ink))" }}>
        {observedLabel(selection)} · {gp != null ? pluralize(gp, "game") : "games not reported"} in this EDGE sample.
        {small && <> <strong>{small}</strong></>}
      </p>
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
              const shots = finiteOrNull(d?.shots);
              // A zone the feed did not list, or listed without a count, is
              // "no data" — not an observed zero.
              const reading = percentileReading(shots, d?.shotsPercentile);
              const pct = reading.value;
              const onDark = pct != null && pct >= 0.5;
              const rankText = reading.status === "ranked" ? `${ordinal(Math.round((pct ?? 0) * 100))} percentile`
                : reading.status === "zero-count" ? "no percentile for a zero count" : "no percentile reported";
              return (
                <g key={area} role="img" aria-label={`${area}: ${shots == null ? "count not reported" : pluralize(shots, "shot")}; ${rankText}`}>
                  <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={4}
                    fill={pct != null ? pctColor(pct) : NO_RANK_FILL} stroke="var(--rule-light, #ddd2b8)" strokeWidth="0.75" />
                  <text x={t.x + t.w / 2} y={t.y + t.h / 2 + 1} textAnchor="middle"
                    fontSize="12" fontFamily="monospace" fontWeight="900"
                    fill={onDark ? "#fff" : "var(--ink, #2a2318)"}>
                    {shots ?? "—"}
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
          <ChartData title="Shots by zone" columns={["Shots", "Percentile"]} rows={data.sogDetails.map(zone => {
            const r = percentileReading(zone.shots, zone.shotsPercentile);
            return { id: zone.area, label: zone.area, values: [zone.shots == null ? "—" : String(zone.shots), r.value == null ? "—" : String(Math.round(r.value * 100))] };
          })} />
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-1.5 text-[9px] font-mono uppercase tracking-wider" style={{ color: "var(--ledger-ink-faint)" }}>
            <span className="basis-full text-center">EDGE shot-volume %ile (non-zero zones):</span>
            {[0.2, 0.5, 0.7, 0.9].map((p) => (
              <span key={p} className="flex items-center gap-1">
                <span className="inline-block w-3 h-3" style={{ background: pctColor(p + 0.01), borderRadius: 2 }} />
                {ordinal(Math.round(p * 100))}+
              </span>
            ))}
          </div>
          <div className="text-center mt-0.5 text-[8px] font-mono uppercase tracking-wider" style={{ color: "var(--ledger-ink-faint)" }}>
            unshaded = zero shots or no percentile reported
          </div>
          <p className="mt-1 text-[9px] font-mono leading-relaxed text-center" style={{ color: "var(--ledger-ink-faint)" }}>
            {PERCENTILE_CAVEAT}
          </p>
        </div>

        {/* Location summary + zone time */}
        <div className="flex-1 w-full min-w-0">
          {summaries.map((s) => {
            const shooting = shootingReading(s);
            const finishing = pointsVsLeague(shooting, s.shootingPctgLeagueAvg);
            const gap = vsLeagueText(finishing);
            const rank = percentileReading(s.shots, s.shotsPercentile);
            const league = finiteOrNull(s.shotsLeagueAvg);
            return (
              <div key={s.locationCode} className="py-2 border-b" style={{ borderColor: "var(--rule-light)" }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 text-[10px] font-black font-mono tabular-nums" style={{
                      background: rank.value != null ? pctColor(rank.value) : NO_RANK_FILL,
                      color: rank.value != null && rank.value >= 0.7 ? "#fff" : "var(--ink)", borderRadius: 2,
                    }}>
                      {rank.value != null ? ordinal(Math.round(rank.value * 100)) : "—"}
                    </span>
                    <span className="text-[11px] font-black font-mono uppercase tracking-wider" style={{ color: "var(--ink)" }}>
                      {SUMMARY_LABEL[s.locationCode] ?? s.locationCode}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums font-black" style={{ color: "var(--ink)" }}>
                    {finiteOrNull(s.shots) ?? "—"} <span className="font-normal text-[10px]" style={{ color: "var(--ledger-ink-faint)" }}>shots{league != null ? ` · league avg ${Math.round(league)}` : ""}</span>
                  </span>
                </div>
                <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--ledger-ink-body, var(--ink))" }}>
                  {finiteOrNull(s.goals) ?? "—"} goals · shooting {shootingText(shooting)}{" "}
                  {gap && (
                    <span style={{ color: (finishing ?? 0) >= 0 ? "var(--ledger-green)" : "var(--ledger-red)" }}>
                      ({gap})
                    </span>
                  )}
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
        Source: NHL EDGE · {observedLabel(selection)} · {data.source === "snapshot" ? "captured" : "retrieved"} {new Date(data.capturedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · tile fill = EDGE shot-volume percentile, shown only for zones with shots · finishing gap = shooting % minus league shooting %
      </div>
    </div>
  );
}
