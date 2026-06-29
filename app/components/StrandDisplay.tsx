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

function buildSegStrandPath(
  traits: StrandTrait[], W: number, H: number, amplitude: number, isOff: boolean,
  xStart: number, xEnd: number, trimLeft: number, trimRight: number,
) {
  const xFrom = xStart + trimLeft;
  const xTo   = xEnd - trimRight;
  const SEGS  = 80;
  return Array.from({ length: SEGS + 1 }, (_, i) => {
    const x = (i / SEGS) * W;
    if (x < xFrom - 0.5 || x > xTo + 0.5) return null;
    const t = x / W;
    const y = strandYAtSmooth(traits, t, W, H, amplitude, isOff);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  })
    .filter((s): s is string => s !== null)
    .map((s, i) => `${i === 0 ? "M" : "L"} ${s}`)
    .join(" ");
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

          {/* DNA crossover — segment-based rendering with base-pair rungs */}
          {offTraits.length > 0 && defTraits.length > 0 && (() => {
            const n = offTraits.length;
            const sm = sineM(n);
            const CROSS_GAP = 8;
            const RUNG_COLORS = ["#7a9a78", "#8a6f8e", "#b07868", "#6882a0"];

            const crossXs: number[] = [];
            for (let k = 0; k <= 2 * n; k++) crossXs.push((k / (2 * n)) * W);

            const rungData: { x: number; yOff: number; yDef: number; color: string }[] = [];
            let ri = 0;
            const RUNG_STEP = 14;
            for (let rx = RUNG_STEP / 2; rx < W; rx += RUNG_STEP) {
              if (crossXs.some(cx => Math.abs(rx - cx) < CROSS_GAP + 3)) continue;
              const t = rx / W;
              rungData.push({
                x: rx,
                yOff: strandYAtSmooth(offTraits, t, W, H, amplitude, true),
                yDef: strandYAtSmooth(defTraits, t, W, H, amplitude, false),
                color: RUNG_COLORS[ri++ % RUNG_COLORS.length],
              });
            }

            return crossXs.slice(0, -1).map((segStart, k) => {
              const segEnd = crossXs[k + 1];
              const offFront = k % 2 === 0;
              const backTraits  = offFront ? defTraits : offTraits;
              const frontTraits = offFront ? offTraits : defTraits;
              const backIsOff   = !offFront;
              const frontIsOff  = offFront;
              const backColor2  = offFront ? defColor : offColor;
              const frontColor2 = offFront ? offColor : defColor;
              const gl = k > 0 ? CROSS_GAP : 0;
              const gr = k < 2 * n - 1 ? CROSS_GAP : 0;
              const segRungs = rungData.filter(r => r.x >= segStart && r.x <= segEnd);

              return (
                <g key={`seg-${k}`}>
                  <path d={buildSegStrandPath(backTraits, W, H, amplitude, backIsOff, segStart, segEnd, gl, gr)}
                        fill="none" stroke={backColor2} strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
                  {segRungs.map((r, i) => (
                    <line key={i} x1={r.x} y1={r.yOff} x2={r.x} y2={r.yDef}
                          stroke={r.color} strokeWidth="2" opacity="0.45" strokeLinecap="round"/>
                  ))}
                  <path d={buildSegStrandPath(frontTraits, W, H, amplitude, frontIsOff, segStart, segEnd, 0, 0)}
                        fill="none" stroke={frontColor2} strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
                </g>
              );
            });
          })()}

          {/* Offensive nodes — label follows node: above centre → label above, below → label below */}
          {offTraits.map((t, i) => {
            const x       = ((i + 0.5) / offTraits.length) * W;
            const nodeAmp = amplitude * (0.35 + t.val * 0.65);
            const y       = cy - nodeAmp * Math.sin(freq * x * sineM(offTraits.length));
            const hasPs   = t.ps != null;
            const r       = hasPs ? 4 : 3;
            const isAbove = y <= cy;                               // node above centre line
            const labelY  = isAbove
              ? Math.max(8,     y - 14)                            // above: push label up
              : Math.min(H - 18, y + 14);                          // below: push label down
            const valY    = labelY + 9;
            const lineY1  = isAbove ? y - r : y + r;
            const lineY2  = isAbove ? labelY + 2 : labelY - 3;
            return <g key={t.label}>
              <circle cx={x} cy={y} r={t.val * 4 + 2.5} fill={offColor} opacity="0.15"/>
              <circle cx={x} cy={y} r={r} fill={offColor}/>
              <line x1={x} y1={lineY1} x2={x} y2={lineY2}
                stroke={offColor} strokeWidth="0.8" opacity="0.4"/>
              <text x={x} y={labelY}  textAnchor="middle" fontSize="7.5" fontWeight="bold"
                fill={offColor} fontFamily="Courier Prime, monospace">{t.label}</text>
              <text x={x} y={valY}    textAnchor="middle" fontSize="6.5"
                fill={offColor} fontFamily="Courier Prime, monospace" opacity="0.9">{displayNum(t)}</text>
            </g>;
          })}

          {/* Defensive nodes — same logic */}
          {defTraits.map((t, i) => {
            const x       = ((i + 0.5) / defTraits.length) * W;
            const nodeAmp = amplitude * (0.35 + t.val * 0.65);
            const y       = cy + nodeAmp * Math.sin(freq * x * sineM(defTraits.length));
            const hasPs   = t.ps != null;
            const r       = hasPs ? 4 : 3;
            const color   = t.unavailable ? "var(--ledger-rule-mid)" : defColor;
            const isAbove = y <= cy;
            const labelY  = isAbove
              ? Math.max(8,     y - 14)
              : Math.min(H - 18, y + 14);
            const valY    = labelY + 9;
            const lineY1  = isAbove ? y - r : y + r;
            const lineY2  = isAbove ? labelY + 2 : labelY - 3;
            return <g key={t.label}>
              <circle cx={x} cy={y} r={t.val * 4 + 2.5} fill={color} opacity="0.15"/>
              <circle cx={x} cy={y} r={r} fill={color}/>
              <line x1={x} y1={lineY1} x2={x} y2={lineY2}
                stroke={color} strokeWidth="0.8" opacity="0.4"/>
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
