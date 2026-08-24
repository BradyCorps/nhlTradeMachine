"use client";
// ── StrandDisplay — shared STRAND renderer ───────────────────
// Used by Armchair GM (StrandView.tsx), the Trade Machine (asset rows),
// and player analytics (players/page.tsx). Takes pre-computed traits —
// callers normalise their data source to StrandTrait[].
//
// The helix is a SILHOUETTE of identity (offensive lean vs defensive lean
// vs league AVG). To keep that shape legible we do NOT print stats on the
// wave: labels ride a fixed top rail (offense) and bottom rail (defense),
// each node shows one consistent 0–100 index (raw value on a faint
// sub-line), and any EDGE band is rendered beneath the shape via `footer`.
import React from "react";

// The trait shape lives with the builder that decides whether a node measured
// anything — `app/lib/strand-traits.ts`. Re-exported here so the long-standing
// `import { StrandTrait } from ".../StrandDisplay"` keeps working, but there is
// one definition, not two drifting copies.
export type { StrandTrait } from "@/app/lib/strand-traits";
import { coverageIsThin, coverageLabel, strandCoverage, type StrandTrait } from "@/app/lib/strand-traits";

interface Props {
  ariaDescription: string;
  offTraits:    StrandTrait[];
  defTraits:    StrandTrait[];
  ops?:         number | null;
  dps?:         number | null;
  strandType?:  string;
  compareOff?:  StrandTrait[];
  compareDef?:  StrandTrait[];
  compareLabel?: string;
  footer?:      React.ReactNode; // rendered inside the card, under the SVG (e.g. EDGE band)
  // SVG dimensions — a rail layout needs vertical room, so keep H ≳ 190.
  W?:      number;
  H?:      number;
  amplitude?: number;
  maxWidth?: number; // cap the rendered width so a full-bleed container doesn't blow the SVG up
}

// sineM = n/2: each trait occupies exactly one half-cycle.
const sineM = (n: number) => n / 2;

function buildAvgPath(W: number, H: number, amplitude: number, isOff: boolean, n: number) {
  const cy     = H / 2;
  const freq   = (2 * Math.PI) / W;
  const sm     = sineM(n);
  const avgAmp = amplitude * (0.35 + 0.5 * 0.65);
  const pts: string[] = [];
  for (let i = 0; i <= 80; i++) {
    const x = (i / 80) * W;
    const y = cy + (isOff ? -1 : 1) * avgAmp * Math.sin(freq * x * sm);
    pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

function strandYAtSmooth(
  traits: StrandTrait[], t: number,
  W: number, H: number, amplitude: number, isOff: boolean,
): number {
  const cy   = H / 2;
  const n    = traits.length;
  const freq = (2 * Math.PI) / W;
  const sm   = sineM(n);
  const x    = t * W;
  const normX = t * n - 0.5;
  const lo    = Math.max(0, Math.floor(normX));
  const hi    = Math.min(n - 1, lo + 1);
  const frac  = Math.max(0, Math.min(1, normX - lo));
  const ease  = frac * frac * (3 - 2 * frac);
  const val   = traits[lo].val * (1 - ease) + traits[hi].val * ease;
  const amp   = amplitude * (0.35 + val * 0.65);
  return cy + (isOff ? -1 : 1) * amp * Math.sin(freq * x * sm);
}

function buildStrandPath(traits: StrandTrait[], W: number, H: number, amplitude: number, isOff: boolean) {
  const cy   = H / 2;
  const n    = traits.length;
  if (n === 0) return `M 0 ${cy.toFixed(1)} L ${W.toFixed(1)} ${cy.toFixed(1)}`;
  const pts: string[] = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const x = t * W;
    const y = strandYAtSmooth(traits, t, W, H, amplitude, isOff);
    pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

// Short plain-language meaning per trait label — filtered to the labels
// actually on screen, so a goalie strand shows the goalie guide.
const TRAIT_GUIDE: Record<string, string> = {
  OPS:  "Offensive Point Shares — offense measured in standings points",
  SCR:  "Scoring rate — points per 82 games",
  xG:   "Expected goals created per 82 games (shot quality × volume)",
  NOIV: "Net on-ice value — the team's shot-quality edge with him on the ice",
  TOI:  "Ice time per game — minutes played, a proxy for coaching trust",
  DPS:  "Defensive Point Shares — defense measured in standings points",
  DEF:  "Defensive value component",
  SUPP: "Suppression — fewer scoring chances allowed than his teammates",
  QoC:  "Quality of competition — how tough his matchups are (0–100)",
  "OZ Starts": "Share of his shifts that start in the offensive zone (not time spent there)",
  GSAX: "Goals Saved Above Expected vs an average goalie",
  "SV%": "Even-strength save percentage",
  HDSV: "High-danger save % — stopping the chances that matter most",
  WRKLD: "Workload — games started",
  BUSY: "Shot volume — shots faced per game",
  GAA:  "Goals-against average (higher rating = lower GAA)",
};

// The rails own the top and bottom bands; clamp the wave so its peaks never
// climb into the label zone regardless of the height the caller passes.
const RAIL_ZONE = 46;

export default function StrandDisplay({
  ariaDescription, offTraits, defTraits, ops, dps, strandType,
  compareOff, compareDef, compareLabel, footer,
  W = 340, H = 210, amplitude = 44, maxWidth,
}: Props) {
  const cy       = H / 2;
  const freq     = (2 * Math.PI) / W;
  const amp      = Math.min(amplitude, cy - RAIL_ZONE - 4);
  const offColor = "var(--ledger-ice)";
  const defColor = "var(--ledger-red)";

  const nodeIndex = (t: StrandTrait) =>
    t.unavailable ? "—" : String(t.idx ?? Math.round(t.val * 100));
  const rawLabel = (t: StrandTrait) =>
    t.unavailable ? null
    : t.raw ?? t.ps ?? (t.display !== undefined ? String(t.display) : null);
  const describeTrait = (t: StrandTrait): string => {
    if (t.unavailable) return `${t.label} unavailable`;
    const raw = rawLabel(t);
    return `${t.label} ${nodeIndex(t)} out of 100${raw ? `, actual ${raw}` : ""}`;
  };
  const describeRail = (label: string, traits: StrandTrait[]): string =>
    `${label}: ${traits.length > 0 ? traits.map(describeTrait).join("; ") : "none"}`;
  const primaryAria = [
    ariaDescription,
    strandType ? `Type: ${strandType}` : null,
    describeRail("Offensive traits", offTraits),
    describeRail("Defensive traits", defTraits),
  ].filter((part): part is string => Boolean(part));
  const comparisonAria = compareLabel && compareOff && compareDef
    ? [
        `Comparison with ${compareLabel}`,
        describeRail("offensive traits", compareOff),
        describeRail("defensive traits", compareDef),
      ].join(". ")
    : null;
  const accessibleLabel = [...primaryAria, comparisonAria]
    .filter((part): part is string => Boolean(part))
    .join(". ");

  const guideLabels = Array.from(new Set([...offTraits, ...defTraits].map(t => t.label)))
    .filter(label => TRAIT_GUIDE[label]);

  // How much of this profile is a measurement. A greyed node says "this one is
  // missing"; only the count says "most of this shape is missing", which is a
  // different and more important thing for a reader to know before comparing
  // two players.
  const coverage = strandCoverage(offTraits, defTraits);
  const coverageNote = coverageLabel(coverage);
  const thin = coverageIsThin(coverage);

  return (
    <div style={maxWidth ? { maxWidth, margin: "0 auto" } : undefined}>
      {/* ── SVG Helix ─────────────────────────────────────────── */}
      <div style={{ background: "var(--ledger-cream)", border: "1px solid #c8b890", borderRadius: "2px" }}>
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: "block" }}
          role="img"
          aria-label={accessibleLabel}
        >
          {/* Per-trait column dividers + centre line */}
          {offTraits.length > 0 && Array.from({ length: offTraits.length - 1 }, (_, i) => {
            const x = ((i + 1) / offTraits.length) * W;
            return <line key={`div-${i}`} x1={x} y1={RAIL_ZONE} x2={x} y2={H - RAIL_ZONE}
              stroke="var(--ledger-rule-mid)" strokeWidth="0.5" strokeDasharray="2,4" opacity="0.7"/>;
          })}
          <line x1={0} y1={cy} x2={W} y2={cy} stroke="var(--ledger-rule-mid)" strokeWidth="0.5"/>

          {/* Strand type badge */}
          {strandType && (
            <>
              <rect x={4} y={4} width={strandType.length * 5.2 + 8} height={13} fill="var(--ledger-cream)" rx="1"/>
              <text x={8} y={13.5} fontSize="7.5" fontFamily="Courier Prime, monospace" fontWeight="bold"
                fill={
                  strandType === "ELITE TWO-WAY" || strandType === "COMPLETE PLAYER" ? "var(--ledger-green)" :
                  strandType.includes("OFFENSIVE") ? "var(--ledger-ice)" :
                  strandType.includes("DEFENSIVE") ? "var(--ledger-red)" : "var(--ledger-brown)"
                }>{strandType}</text>
            </>
          )}

          {/* League average reference helix — dashed, behind player strands */}
          <path d={buildAvgPath(W, H, amp, true, offTraits.length)}  fill="none"
            stroke="var(--ledger-ink-faint)" strokeWidth="1" strokeDasharray="4,4" opacity="0.35"/>
          <path d={buildAvgPath(W, H, amp, false, defTraits.length)} fill="none"
            stroke="var(--ledger-ink-faint)" strokeWidth="1" strokeDasharray="4,4" opacity="0.35"/>
          <text x={W-4} y={cy - amp * 0.65 + 3} textAnchor="end"
            fontSize="5.5" fill="var(--ledger-ink-faint)" fontFamily="Courier Prime, monospace"
            fontWeight="bold" opacity="0.55">AVG</text>

          {/* Compare strands (dashed) */}
          {compareOff && compareDef && compareOff.length > 0 && compareDef.length > 0 && (<>
            <path d={buildStrandPath(compareOff, W, H, amp, true)}  fill="none"
              stroke={offColor} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.5" strokeLinecap="round"/>
            <path d={buildStrandPath(compareDef, W, H, amp, false)} fill="none"
              stroke={defColor} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.5" strokeLinecap="round"/>
          </>)}

          {/* 3D helix — depth-sorted segments, cos(θ) drives front/back */}
          {offTraits.length > 0 && defTraits.length > 0 && (() => {
            const n = offTraits.length;
            const smN = sineM(n);
            const OL = 1.5;

            const crossXs: number[] = [];
            for (let k = 0; ; k++) {
              const x = W * (1 + 2 * k) / (4 * smN);
              if (x > W) break;
              crossXs.push(x);
            }
            const bounds = [0, ...crossXs, W];

            const sectionPath = (traits: StrandTrait[], isOff: boolean, xS: number, xE: number): string =>
              Array.from({ length: 81 }, (_, i) => {
                const x = (i / 80) * W;
                if (x < xS - OL || x > xE + OL) return null;
                const t = x / W;
                const y = strandYAtSmooth(traits, t, W, H, amp, isOff);
                return `${x.toFixed(1)} ${y.toFixed(1)}`;
              }).filter((s): s is string => s !== null)
                .map((s, i) => `${i === 0 ? "M" : "L"} ${s}`).join(" ");

            const sections = bounds.slice(0, -1).map((xS, k) => ({
              xS, xE: bounds[k + 1],
              offFront: Math.cos(freq * ((xS + bounds[k + 1]) / 2) * smN) > 0,
            }));

            return (<>
              {/* Layer 1: back strand sections */}
              {sections.map(({ xS, xE, offFront }, k) => (
                <path key={`bk-${k}`}
                      d={sectionPath(offFront ? defTraits : offTraits, !offFront, xS, xE)}
                      fill="none" stroke={offFront ? defColor : offColor}
                      strokeWidth="2.5" opacity="0.9" strokeLinecap="round"/>
              ))}
              {/* Layer 3: front strand sections */}
              {sections.map(({ xS, xE, offFront }, k) => (
                <path key={`fg-${k}`}
                      d={sectionPath(offFront ? offTraits : defTraits, offFront, xS, xE)}
                      fill="none" stroke={offFront ? offColor : defColor}
                      strokeWidth="2.5" opacity="0.9" strokeLinecap="round"/>
              ))}
            </>);
          })()}

          {/* Offensive labels — fixed TOP rail */}
          {offTraits.map((t, i) => {
            const x   = ((i + 0.5) / offTraits.length) * W;
            const raw = rawLabel(t);
            const color = t.unavailable ? "var(--ledger-rule-mid)" : offColor;
            return <g key={`off-${t.label}`}>
              <text x={x} y={26} textAnchor="middle" fontSize="7.5" fontWeight="bold"
                fill={color} fontFamily="Courier Prime, monospace">{t.label}</text>
              <text x={x} y={36.5} textAnchor="middle" fontSize="9.5" fontWeight="bold"
                fill={color} fontFamily="Courier Prime, monospace">{nodeIndex(t)}</text>
              {raw && <text x={x} y={44} textAnchor="middle" fontSize="6"
                fill="var(--ledger-ink-faint)" fontFamily="Courier Prime, monospace">{raw}</text>}
            </g>;
          })}

          {/* Defensive labels — fixed BOTTOM rail */}
          {defTraits.map((t, i) => {
            const x   = ((i + 0.5) / defTraits.length) * W;
            const raw = rawLabel(t);
            const color = t.unavailable ? "var(--ledger-rule-mid)" : defColor;
            return <g key={`def-${t.label}`}>
              {raw && <text x={x} y={H - 38} textAnchor="middle" fontSize="6"
                fill="var(--ledger-ink-faint)" fontFamily="Courier Prime, monospace">{raw}</text>}
              <text x={x} y={H - 25.5} textAnchor="middle" fontSize="9.5" fontWeight="bold"
                fill={color} fontFamily="Courier Prime, monospace">{nodeIndex(t)}</text>
              <text x={x} y={H - 14} textAnchor="middle" fontSize="7.5" fontWeight="bold"
                fill={color} fontFamily="Courier Prime, monospace">{t.label}</text>
            </g>;
          })}

          {/* Compare legend */}
          {compareLabel && (
            <g>
              <line x1={W-95} y1={H-4} x2={W-81} y2={H-4}
                stroke={offColor} strokeWidth="1.5" strokeDasharray="4,2"/>
              <text x={W-78} y={H-1} fontSize="6.5" fill={offColor} fontFamily="Courier Prime, monospace">
                {compareLabel}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* ── EDGE band / footer ───────────────────────────────── */}
      {footer && <div style={{ marginTop: "6px" }}>{footer}</div>}

      {/* Always-visible key: answers "what is this number?" at a glance */}
      <div className="mt-2" style={{
        fontSize: "10px", lineHeight: 1.45, color: "var(--ledger-ink-body)",
        fontFamily: "Courier Prime, monospace",
      }}>
        <span style={{ color: "var(--ledger-ice)", fontWeight: 900 }}>Big number</span> = 0–100 rating vs the NHL field (100 = elite; 50 = league median).{" "}
        <span style={{ color: "var(--ledger-ink-body)", fontWeight: 900 }}>Small number</span> = the actual stat.{" "}
        <span style={{ color: "var(--ledger-ice)", fontWeight: 700 }}>Blue = offensive traits</span>,{" "}
        <span style={{ color: "var(--ledger-red)", fontWeight: 700 }}>red = defensive traits</span>{" "}
        — wave color marks the trait family, never good vs bad.
      </div>

      {/* Coverage. Silent on a complete profile; a badge that always shows is
          one nobody reads. */}
      {coverageNote && (
        <div className="mt-1" style={{
          fontSize: "10px", lineHeight: 1.45, fontFamily: "Courier Prime, monospace",
          color: thin ? "var(--ledger-red)" : "var(--ledger-ink-faint)",
          fontWeight: thin ? 900 : 700,
        }}>
          <span title="Greyed nodes had no source data. They are drawn mid-rail so the shape stays continuous; they are not readings.">
            ◌ {coverageNote}
            {thin && " — too little to characterise this profile"}
          </span>
        </div>
      )}

      {/* ── Trait definitions (expandable) ───────────────────── */}
      <details className="text-2xs mt-1" style={{ color: "var(--ledger-ink-body)", lineHeight: 1.6 }}>
        <summary style={{ cursor: "pointer", fontWeight: 900, color: "var(--ledger-ink)", letterSpacing: "0.1em" }}>
          What does each trait mean?
        </summary>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "2px 12px", marginTop: "4px" }}>
          {guideLabels.map(label => (
            <div key={label} style={{ display: "flex", gap: "6px" }}>
              <span style={{ fontWeight: 900, width: "58px", flexShrink: 0, color: "var(--ledger-ink)" }}>{label}</span>
              <span style={{ color: "var(--ledger-ink-body)" }}>{TRAIT_GUIDE[label]}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
