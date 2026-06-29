"use client";
// ── StrandDisplay — shared STRAND renderer ───────────────────
// Used by both Armchair GM (StrandView.tsx) and player analytics
// (players/page.tsx). Takes pre-computed traits — callers are responsible
// for normalising their data source to StrandTrait[].
//
// Why shared: the SVG helix, trait bars, league-avg baseline, and legend
// are identical regardless of whether data comes from Asset+XNAVResult
// (Armchair GM) or a raw Player object (player analytics).
import React from "react";

export interface StrandTrait {
  label:       string;
  val:         number;        // 0–1 normalised — drives bar width and helix amplitude
  title?:      string;        // tooltip
  ps?:         string | null; // Point Share value shown on node instead of score (e.g. "12.8")
  display?:    number;        // override displayed number (e.g. raw OZ% instead of score)
  unavailable?: boolean;      // greyed out — data not available
}

interface Props {
  offTraits:    StrandTrait[];
  defTraits:    StrandTrait[];
  ops?:         number | null;
  dps?:         number | null;
  strandType?:  string;
  compareOff?:  StrandTrait[];
  compareDef?:  StrandTrait[];
  compareLabel?: string;
  // SVG dimensions — Armchair GM uses larger canvas, players page uses smaller
  W?:      number;
  H?:      number;
  amplitude?: number;
}

// sineM = n/2: each trait occupies exactly one half-cycle.
// Nodes sit at sine peaks/troughs — clean helix for any trait count.
// 5 traits → 2.5 cycles (Armchair GM)  |  4 traits → 2.0 cycles (players page)
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

export default function StrandDisplay({
  offTraits, defTraits, ops, dps, strandType,
  compareOff, compareDef, compareLabel,
  W = 320, H = 210, amplitude = 42,
}: Props) {
  const cy      = H / 2;
  const freq    = (2 * Math.PI) / W;
  const offColor = "var(--ledger-navy)";
  const defColor = "var(--ledger-red)";

  const displayNum = (t: StrandTrait) =>
    t.unavailable ? "—"
    : t.ps        ? t.ps
    : t.display !== undefined ? t.display
    : Math.round(t.val * 100);

  return (
    <div>
      {/* ── SVG Helix ─────────────────────────────────────────── */}
      <div style={{ background: "var(--ledger-cream)", border: "1px solid #c8b890", borderRadius: "2px" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map(t => (
            <line key={t} x1={t*W} y1={12} x2={t*W} y2={H-12}
              stroke="var(--ledger-rule-mid)" strokeWidth="0.5" strokeDasharray="3,3"/>
          ))}
          <line x1={0} y1={cy} x2={W} y2={cy} stroke="var(--ledger-rule-mid)" strokeWidth="0.5"/>

          {/* Strand type badge */}
          {strandType && (
            <>
              <rect x={4} y={4} width={strandType.length * 5.2 + 8} height={13} fill="var(--ledger-cream)" rx="1"/>
              <text x={8} y={13.5} fontSize="7.5" fontFamily="Courier Prime, monospace" fontWeight="bold"
                fill={
                  strandType === "ELITE TWO-WAY" || strandType === "COMPLETE PLAYER" ? "var(--ledger-green)" :
                  strandType.includes("OFFENSIVE") ? "var(--ledger-navy)" :
                  strandType.includes("DEFENSIVE") ? "var(--ledger-red)" : "var(--ledger-brown)"
                }>{strandType}</text>
            </>
          )}

          {/* League average reference helix — dashed, behind player strands */}
          <path d={buildAvgPath(W, H, amplitude, true, offTraits.length)}  fill="none"
            stroke="var(--ledger-ink-faint)" strokeWidth="1" strokeDasharray="4,4" opacity="0.35"/>
          <path d={buildAvgPath(W, H, amplitude, false, defTraits.length)} fill="none"
            stroke="var(--ledger-ink-faint)" strokeWidth="1" strokeDasharray="4,4" opacity="0.35"/>
          <text x={W-4} y={cy - amplitude * 0.65 + 3} textAnchor="end"
            fontSize="5.5" fill="var(--ledger-ink-faint)" fontFamily="Courier Prime, monospace"
            fontWeight="bold" opacity="0.55">AVG</text>

          {/* Compare strands (dashed) */}
          {compareOff && compareDef && compareOff.length > 0 && compareDef.length > 0 && (<>
            <path d={buildStrandPath(compareOff, W, H, amplitude, true)}  fill="none"
              stroke={offColor} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.5" strokeLinecap="round"/>
            <path d={buildStrandPath(compareDef, W, H, amplitude, false)} fill="none"
              stroke={defColor} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.5" strokeLinecap="round"/>
          </>)}

          {/* 3D helix — depth-sorted segments, cos(θ) drives opacity + width */}
          {offTraits.length > 0 && defTraits.length > 0 && (() => {
            const n = offTraits.length;
            const smN = sineM(n);

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
                if (x < xS - 0.5 || x > xE + 0.5) return null;
                const t = x / W;
                const y = strandYAtSmooth(traits, t, W, H, amplitude, isOff);
                return `${x.toFixed(1)} ${y.toFixed(1)}`;
              }).filter((s): s is string => s !== null)
                .map((s, i) => `${i === 0 ? "M" : "L"} ${s}`).join(" ");

            return (<>
              {/* Background — full continuous paths */}
              <path d={buildStrandPath(offTraits, W, H, amplitude, true)} fill="none"
                    stroke={offColor} strokeWidth="1.6" opacity="0.35" strokeLinecap="round"/>
              <path d={buildStrandPath(defTraits, W, H, amplitude, false)} fill="none"
                    stroke={defColor} strokeWidth="1.6" opacity="0.35" strokeLinecap="round"/>
              {/* Foreground — thicker where in front */}
              {bounds.slice(0, -1).map((xS, k) => {
                const xMid = (xS + bounds[k + 1]) / 2;
                const offFront = Math.cos(freq * xMid * smN) > 0;
                const traits = offFront ? offTraits : defTraits;
                const isOff  = offFront;
                const color  = offFront ? offColor : defColor;
                return <path key={`fg-${k}`} d={sectionPath(traits, isOff, xS, bounds[k + 1])}
                             fill="none" stroke={color} strokeWidth="2.8" opacity="0.92" strokeLinecap="round"/>;
              })}
            </>);
          })()}

          {/* Offensive labels — positioned at sine peaks/troughs */}
          {offTraits.map((t, i) => {
            const x       = ((i + 0.5) / offTraits.length) * W;
            const nodeAmp = amplitude * (0.35 + t.val * 0.65);
            const y       = cy - nodeAmp * Math.sin(freq * x * sineM(offTraits.length));
            const isAbove = y <= cy;
            const labelY  = isAbove
              ? Math.max(8,     y - 10)
              : Math.min(H - 18, y + 14);
            const valY    = labelY + 9;
            return <g key={t.label}>
              <text x={x} y={labelY}  textAnchor="middle" fontSize="7.5" fontWeight="bold"
                fill={offColor} fontFamily="Courier Prime, monospace">{t.label}</text>
              <text x={x} y={valY}    textAnchor="middle" fontSize="6.5"
                fill={offColor} fontFamily="Courier Prime, monospace" opacity="0.9">{displayNum(t)}</text>
            </g>;
          })}

          {/* Defensive labels — positioned at sine peaks/troughs */}
          {defTraits.map((t, i) => {
            const x       = ((i + 0.5) / defTraits.length) * W;
            const nodeAmp = amplitude * (0.35 + t.val * 0.65);
            const y       = cy + nodeAmp * Math.sin(freq * x * sineM(defTraits.length));
            const color   = t.unavailable ? "var(--ledger-rule-mid)" : defColor;
            const isAbove = y <= cy;
            const labelY  = isAbove
              ? Math.max(8,     y - 10)
              : Math.min(H - 18, y + 14);
            const valY    = labelY + 9;
            return <g key={t.label}>
              <text x={x} y={labelY} textAnchor="middle" fontSize="7.5" fontWeight="bold"
                fill={color} fontFamily="Courier Prime, monospace">{t.label}</text>
              <text x={x} y={valY}   textAnchor="middle" fontSize="6.5"
                fill={color} fontFamily="Courier Prime, monospace" opacity="0.9">{displayNum(t)}</text>
            </g>;
          })}

          {/* Compare legend */}
          {compareLabel && (
            <g>
              <line x1={W-95} y1={H-8} x2={W-81} y2={H-8}
                stroke={offColor} strokeWidth="1.5" strokeDasharray="4,2"/>
              <text x={W-78} y={H-4} fontSize="6.5" fill={offColor} fontFamily="Courier Prime, monospace">
                {compareLabel}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* ── Legend ───────────────────────────────────────────── */}
      <details className="text-2xs mt-2" style={{ color: "var(--ledger-ink-faint)", lineHeight: 1.6 }}>
        <summary style={{ cursor: "pointer", fontWeight: 900, color: "var(--ledger-brown)", letterSpacing: "0.1em" }}>
          ? STRAND trait guide
        </summary>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px", marginTop: "4px" }}>
          {[
            ["OPS",  "Offensive Point Shares (or Pts/82 when unavailable)"],
            ["xG",   "Expected goals generated per 82"],
            ["NOIV", "xG% vs teammates on ice — team impact"],
            ["TOI+", "Ice time & deployment"],
            ["DPS",  "Defensive Point Shares"],
            ["SUPP", "xGA suppression vs teammates"],
            ["Usage","Ice time deployment — correlates with opponent quality"],
            ["OZ",   "Offensive zone start % vs league average"],
          ].map(([abbr, desc]) => (
            <div key={abbr} style={{ display: "flex", gap: "4px" }}>
              <span style={{ fontWeight: 900, width: "28px", flexShrink: 0, color: "var(--ledger-ink-body)" }}>{abbr}</span>
              <span style={{ color: "var(--ledger-rule)" }}>{desc}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
