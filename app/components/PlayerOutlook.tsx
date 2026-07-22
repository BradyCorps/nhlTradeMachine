"use client";
// ── PlayerOutlook (PA12) ─────────────────────────────────────────
// The redefined analytics Outlook: a trajectory + next-season read, honest
// for prospects and veterans, with NHL EDGE as the leading indicator. The
// fantasy dynasty / boom-bust view still lives in DevelopmentProfilePanel
// for the fantasy and docket surfaces — this is the analytics-desk read.

import { useMemo } from "react";
import type { Asset } from "@/app/lib/trade-types";
import { deriveOutlook, type OutlookTone, type TrajectoryDirection } from "@/app/lib/player-outlook";

const toneColor = (t: OutlookTone): string =>
  t === "good" ? "var(--ledger-green)"
    : t === "warn" ? "var(--ledger-amber, #b8860b)"
      : t === "bad" ? "var(--ledger-red)"
        : "var(--ledger-navy)";

const DIRECTION_META: Record<TrajectoryDirection, { arrow: string; label: string; tone: OutlookTone }> = {
  RISING:  { arrow: "▲", label: "Rising",  tone: "good" },
  STEADY:  { arrow: "▬", label: "Steady",  tone: "neutral" },
  COOLING: { arrow: "▼", label: "Cooling", tone: "warn" },
  UNKNOWN: { arrow: "·", label: "No trend", tone: "neutral" },
};

const faint = "var(--ledger-ink-faint)";

export function PlayerOutlook({ asset }: { asset: Asset }) {
  const profile = asset.developmentProfile;
  const outlook = useMemo(
    () => profile ? deriveOutlook(profile, {
      age: asset.age,
      games: asset.games,
      edgeSpeedMaxMph: asset.edgeSpeedMaxMph,
      edgeBurstsOver20: asset.edgeBurstsOver20,
      hdFinishingDelta: asset.hdFinishingDelta,
      edgeOzPct: asset.edgeOzPct,
    }) : null,
    [profile, asset.age, asset.games, asset.edgeSpeedMaxMph, asset.edgeBurstsOver20, asset.hdFinishingDelta, asset.edgeOzPct],
  );

  if (!outlook || asset.position === "Pick" || asset.position === "G") {
    return (
      <div className="text-2xs font-mono" style={{ color: faint }}>
        No projection — Outlook covers skaters with an NHL scoring sample.
      </div>
    );
  }

  const headTone = toneColor(outlook.tone);
  const dir = DIRECTION_META[outlook.trajectory.direction];
  const { floor, median, ceiling } = outlook.projection;
  const span = Math.max(1, ceiling - floor);
  const medianPct = Math.max(0, Math.min(100, ((median - floor) / span) * 100));

  return (
    <div className="flex flex-col gap-2.5 font-mono">
      {/* Headline verdict */}
      <div className="flex items-start justify-between gap-3 p-2.5" style={{ background: "var(--ledger-cream)", border: `1px solid ${headTone}` }}>
        <div className="min-w-0">
          <div className="text-[15px] font-black leading-tight" style={{ color: headTone }}>
            {outlook.headline}
          </div>
          <div className="text-[11px] leading-snug mt-1" style={{ color: "var(--ledger-ink-body)" }}>
            {outlook.summary}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xs uppercase tracking-wider" style={{ color: faint }}>Confidence</div>
          <div className="text-[13px] font-black" style={{ color: "var(--ledger-ink)" }}>{outlook.confidence}</div>
        </div>
      </div>

      {/* Next-season projection band */}
      <div className="p-2.5" style={{ background: "var(--ledger-warm)", border: "1px solid #b8a070" }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-2xs font-black uppercase tracking-wider" style={{ color: faint }}>Next-Season Projection</span>
          <span className="text-2xs font-black" style={{ color: "var(--ledger-navy)" }}>
            {floor}–{ceiling} pts/82 · median {median}
          </span>
        </div>
        <div className="relative h-2 overflow-hidden" style={{ background: "var(--ledger-rule-light)", border: "1px solid #c8b890" }}>
          <div className="absolute top-0 h-full" style={{ left: 0, width: `${medianPct}%`, background: "var(--ledger-navy)", opacity: 0.8 }} />
          <div className="absolute top-[-2px] h-[calc(100%+4px)] w-[2px]" style={{ left: `${medianPct}%`, background: "var(--ledger-ink)" }} title={`Median ${median} pts/82`} />
        </div>
        <div className="flex justify-between text-2xs mt-0.5" style={{ color: faint }}>
          <span>Floor {floor}</span>
          <span>Ceiling {ceiling}</span>
        </div>
      </div>

      {/* Accumulated scoring trajectory */}
      {outlook.trajectory.seasons.length > 0 && (
        <div className="p-2.5" style={{ background: "var(--ledger-cream)", border: "1px solid #c8b890" }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-2xs font-black uppercase tracking-wider" style={{ color: faint }}>Scoring Trajectory</span>
            <span className="text-2xs font-black" style={{ color: toneColor(dir.tone) }}>
              {dir.arrow} {dir.label}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {outlook.trajectory.seasons.map(s => (
              <span key={s.season} className="text-[11px] font-bold" style={{ color: "var(--ledger-ink)" }}>
                <span style={{ color: faint }}>{s.season}</span> {s.pace}
              </span>
            ))}
            {outlook.trajectory.careerPeak != null && (
              <span className="text-2xs font-black uppercase tracking-wide ml-auto" style={{ color: faint }}>
                Career peak {outlook.trajectory.careerPeak}
              </span>
            )}
          </div>
        </div>
      )}

      {/* NHL EDGE — leading indicators */}
      {outlook.edgeReads.length > 0 && (
        <div className="p-2.5" style={{ background: "var(--ledger-cream)", border: "1px solid #b8a070" }}>
          <div className="text-2xs font-black uppercase tracking-wider mb-2" style={{ color: faint }}>
            NHL EDGE · Leading Indicators
          </div>
          <div className="flex flex-col gap-1.5">
            {outlook.edgeReads.map(r => (
              <div key={r.label} className="flex items-baseline gap-2">
                <span className="text-2xs font-black uppercase tracking-wide shrink-0" style={{ color: faint, minWidth: 92 }}>{r.label}</span>
                <span className="text-[11px] font-black shrink-0" style={{ color: toneColor(r.tone), minWidth: 56 }}>{r.value}</span>
                <span className="text-[10px] leading-snug" style={{ color: "var(--ledger-ink-body)" }}>{r.read}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PlayerOutlook;
