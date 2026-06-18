import React from "react";
import type { Asset } from "@/app/lib/trade-types";

function phaseLabel(phase: string): string {
  switch (phase) {
    case "BREAKOUT_CANDIDATE": return "BREAKOUT";
    case "PEAK_WINDOW": return "PEAK WINDOW";
    case "REGRESSION_RISK": return "REGRESSION";
    default: return phase.replace(/_/g, " ");
  }
}

function tone(score: number, invert = false): string {
  const high = invert ? score <= 35 : score >= 65;
  const mid = invert ? score <= 55 : score >= 45;
  if (high) return "var(--ledger-green)";
  if (mid) return "var(--ledger-navy)";
  return "var(--ledger-red)";
}

function boomBustLabel(signal: string): string {
  switch (signal) {
    case "BOOM_LEAN": return "BOOM LEAN";
    case "BUST_LEAN": return "BUST LEAN";
    case "HIGH_VARIANCE": return "HIGH VAR";
    default: return "STABLE";
  }
}

function boomBustColor(signal: string, boomScore: number, bustScore: number): string {
  if (signal === "BOOM_LEAN") return "var(--ledger-green)";
  if (signal === "BUST_LEAN") return "var(--ledger-red)";
  if (signal === "HIGH_VARIANCE") return "var(--ledger-amber)";
  return tone(Math.max(boomScore, 100 - bustScore));
}

function metricStyle(color: string): React.CSSProperties {
  return {
    background: "var(--ledger-cream)",
    border: "1px solid #b8a070",
    borderTop: `2px solid ${color}`,
  };
}

function Metric({ label, value, color, title }: { label: string; value: string | number; color: string; title?: string }) {
  return (
    <div className="p-1.5 text-center" style={metricStyle(color)} title={title}>
      <div className="text-2xs font-black uppercase tracking-tight text-ledger-ink-faint font-mono">{label}</div>
      <div className="text-[12px] font-black font-mono" style={{ color }}>{value}</div>
    </div>
  );
}

function MiniScore({ label, value, title }: { label: string; value: number; title?: string }) {
  return (
    <div title={title} className="min-w-0">
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <span className="text-2xs font-black uppercase tracking-tight text-ledger-ink-faint font-mono truncate">{label}</span>
        <span className="text-2xs font-black text-ledger-ink font-mono">{Math.round(value)}</span>
      </div>
      <div className="h-1 overflow-hidden" style={{ background: "var(--ledger-rule-light)", border: "1px solid #d8c9a0" }}>
        <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: tone(value) }} />
      </div>
    </div>
  );
}

export function DevelopmentProfilePanel({ asset }: { asset: Asset }) {
  const profile = asset.developmentProfile;
  if (!profile || asset.position === "Pick" || asset.position === "G") return null;

  const band = profile.projectionBand;
  const confidenceColor = tone(band.confidence);
  const breakoutColor = tone(profile.breakoutProbability);
  const riskColor = tone(profile.regressionRisk, true);
  const dynastyColor = tone(profile.dynastyScore);
  const boomBustCall = profile.boomBustSignal ?? "HIGH_VARIANCE";
  const boomScore = profile.boomScore ?? profile.breakoutProbability;
  const bustScore = profile.bustScore ?? profile.regressionRisk;
  const boomBustTone = boomBustColor(boomBustCall, boomScore, bustScore);
  const effectivePedigree = profile.effectivePedigreeScore ?? profile.pedigreeScore;
  const pedigreeWeight = profile.pedigreeWeight ?? 100;
  const confidenceScore = profile.confidenceScore ?? band.confidence;
  const scoringTrajectory = profile.scoringTrajectory ?? [];
  const medianPct = band.ceilingPts82 > 0
    ? Math.max(0, Math.min(100, (band.medianPts82 / band.ceilingPts82) * 100))
    : 0;

  return (
    <div className="py-1">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-2xs font-black uppercase tracking-wider text-ledger-ink-faint font-mono">
          {phaseLabel(profile.developmentPhase)}
        </span>
        <span className="text-2xs font-black uppercase tracking-wider font-mono" style={{ color: confidenceColor }}>
          {profile.timelineTrend} · {band.confidence}% SAMPLE CONF
        </span>
      </div>

      <div className="stat-grid-4 mb-1.5">
        <Metric label="Dynasty" value={profile.dynastyScore} color={dynastyColor} title={`Current fantasy score ${profile.currentFantasyScore}/100`} />
        <Metric label="Breakout" value={profile.breakoutProbability} color={breakoutColor} title="Breakout probability" />
        <Metric label="Risk" value={profile.regressionRisk} color={riskColor} title="Regression risk" />
        <Metric label="Arc" value={boomBustLabel(boomBustCall)} color={boomBustTone} title={`Boom ${boomScore}/100 · Bust ${bustScore}/100 · Volatility ${profile.volatility}/100`} />
      </div>

      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
        <div className="p-1.5" style={metricStyle("var(--ledger-green)")}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-2xs font-black uppercase tracking-tight text-ledger-ink-faint font-mono">Boom</span>
            <span className="text-2xs font-black text-ledger-green font-mono">{boomScore}</span>
          </div>
          <div className="h-1.5 overflow-hidden" style={{ background: "var(--ledger-rule-light)" }}>
            <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, boomScore))}%`, background: "var(--ledger-green)" }} />
          </div>
        </div>
        <div className="p-1.5" style={metricStyle("var(--ledger-red)")}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-2xs font-black uppercase tracking-tight text-ledger-ink-faint font-mono">Bust</span>
            <span className="text-2xs font-black text-ledger-red font-mono">{bustScore}</span>
          </div>
          <div className="h-1.5 overflow-hidden" style={{ background: "var(--ledger-rule-light)" }}>
            <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, bustScore))}%`, background: "var(--ledger-red)" }} />
          </div>
        </div>
      </div>

      <div className="p-2 mb-1.5" style={{ background: "var(--ledger-cream)", border: "1px solid #b8a070" }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-2xs font-black uppercase tracking-wider text-ledger-ink-faint font-mono">Inputs</span>
          <span className="text-2xs font-black text-ledger-ink-faint font-mono">
            Pedigree {pedigreeWeight}% · Conf {confidenceScore}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <MiniScore label="Prod" value={profile.productionScore} title="Position-adjusted current production" />
          <MiniScore label="Role" value={profile.roleGrowthScore} title="Role and ice-time growth" />
          <MiniScore label="Pedigree" value={effectivePedigree} title={`Raw pedigree ${profile.pedigreeScore}/100, sample-adjusted to ${effectivePedigree}/100`} />
          <MiniScore label="Exp" value={profile.nhlExperienceScore} title="NHL sample and track record" />
        </div>
      </div>

      <div className="p-2 mb-1.5" style={{ background: "var(--ledger-warm)", border: "1px solid #b8a070" }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-2xs font-black uppercase tracking-wider text-ledger-ink-faint font-mono">Projection</span>
          <span className="text-2xs font-black text-ledger-navy font-mono">
            {band.floorPts82}-{band.ceilingPts82} pts/82 · median {band.medianPts82}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden" style={{ background: "var(--ledger-rule-light)", border: "1px solid #c8b890" }}>
          <div className="h-full" style={{ width: `${medianPct}%`, background: dynastyColor }} />
        </div>
      </div>

      {scoringTrajectory.length > 0 && (
        <div className="p-1.5 mb-1.5" style={{ background: "var(--ledger-cream)", border: "1px solid #c8b890" }}>
          <div className="text-2xs font-black uppercase tracking-wider text-ledger-ink-faint font-mono mb-1">
            3-Year Scoring
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {scoringTrajectory.map(item => (
              <span key={item} className="text-2xs font-bold text-ledger-ink font-mono">
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {profile.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {profile.tags.map(tag => (
            <span
              key={tag}
              className="text-2xs px-1.5 py-0.5 font-black uppercase tracking-wider font-mono"
              style={{
                color: tag === "BOOM_BUST" ? boomBustTone : tag === "REGRESSION_RISK" || tag === "LOW_CONFIDENCE" ? riskColor : breakoutColor,
                border: "1px solid #c8b890",
                background: "var(--ledger-cream)",
              }}
              title={`Boom ${boomScore}/100 · Bust ${bustScore}/100 · Volatility ${profile.volatility}/100`}
            >
              {tag === "BOOM_BUST" ? boomBustLabel(boomBustCall) : tag.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {profile.rationale.slice(0, 5).map(line => (
          <div key={line} className="text-2xs font-bold text-ledger-ink-faint font-mono">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
