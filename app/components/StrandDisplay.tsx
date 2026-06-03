"use client";
// ── StrandDisplay — shared STRAND renderer ───────────────────
// Used by both the trade machine (StrandView.tsx) and player analytics
// (players/page.tsx). Takes pre-computed traits — callers are responsible
// for normalising their data source to StrandTrait[].
//
// Why shared: the SVG helix, trait bars, league-avg baseline, and legend
// are identical regardless of whether data comes from Asset+XNAVResult
// (trade machine) or a raw Player object (player analytics).
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
  // SVG dimensions — trade machine uses larger canvas, players page uses smaller
  W?:      number;
  H?:      number;
  amplitude?: number;
}

// sineM = n/2: each trait occupies exactly one half-cycle.
// Nodes sit at sine peaks/troughs — clean helix for any trait count.
// 5 traits → 2.5 cycles (trade machine)  |  4 traits → 2.0 cycles (players page)
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

function buildStrandPath(traits: StrandTrait[], W: number, H: number, amplitude: number, isOff: boolean) {
  const cy   = H / 2;
  const n    = traits.length;
  const freq = (2 * Math.PI) / W;
  const sm   = sineM(n);
  const pts: string[] = [];
  for (let i = 0; i <= 80; i++) {
    const t    = i / 80;
    const x    = t * W;
    // Smooth cubic interpolation — eliminates kinks at trait boundaries.
    // Step function caused amplitude to snap mid-oscillation at grid lines.
    const normX = t * n - 0.5;
    const lo    = Math.max(0, Math.floor(normX));
    const hi    = Math.min(n - 1, lo + 1);
    const frac  = Math.max(0, Math.min(1, normX - lo));
    const ease  = frac * frac * (3 - 2 * frac);
    const val   = traits[lo].val * (1 - ease) + traits[hi].val * ease;
    const amp   = amplitude * (0.35 + val * 0.65);
    const y     = cy + (isOff ? -1 : 1) * amp * Math.sin(freq * x * sm);
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
          {compareOff && compareDef && (<>
            <path d={buildStrandPath(compareOff, W, H, amplitude, true)}  fill="none"
              stroke={offColor} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.5" strokeLinecap="round"/>
            <path d={buildStrandPath(compareDef, W, H, amplitude, false)} fill="none"
              stroke={defColor} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.5" strokeLinecap="round"/>
          </>)}

          {/* Rungs connecting the two strands */}
          {Array.from({ length: 18 }, (_, i) => {
            const t     = (i + 0.5) / 18;
            const x     = t * W;
            const sm    = sineM(offTraits.length);
            // Use smooth interpolation for rung endpoints (same as strand paths)
            const normX = t * offTraits.length - 0.5;
            const lo    = Math.max(0, Math.floor(normX));
            const hi    = Math.min(offTraits.length - 1, lo + 1);
            const frac  = Math.max(0, Math.min(1, normX - lo));
            const ease  = frac * frac * (3 - 2 * frac);
            const oVal  = offTraits[lo].val * (1 - ease) + offTraits[hi].val * ease;
            const dVal  = defTraits[lo < defTraits.length ? lo : defTraits.length-1].val * (1 - ease)
                        + defTraits[hi < defTraits.length ? hi : defTraits.length-1].val * ease;
            const oA    = amplitude * (0.35 + oVal * 0.65);
            const dA    = amplitude * (0.35 + dVal * 0.65);
            const oy    = cy - oA * Math.sin(freq * x * sm);
            const dy    = cy + dA * Math.sin(freq * x * sm);
            return <line key={i} x1={x} y1={oy} x2={x} y2={dy}
              stroke="var(--ledger-ink-faint)" strokeWidth="0.8"
              opacity={0.12 + Math.abs(Math.sin(freq * x * sm)) * 0.25}/>;
          })}

          {/* Player strands */}
          <path d={buildStrandPath(defTraits, W, H, amplitude, false)} fill="none"
            stroke={defColor} strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
          <path d={buildStrandPath(offTraits, W, H, amplitude, true)}  fill="none"
            stroke={offColor} strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>

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

      {/* ── Trait bars with league average baseline ──────────── */}
      <div style={{ marginTop: "8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        {[
          { heading: "◆ OFFENSE", traits: offTraits, color: offColor, psVal: ops,  psLabel: "OPS" },
          { heading: "◆ DEFENSE", traits: defTraits, color: defColor, psVal: dps,  psLabel: "DPS" },
        ].map(({ heading, traits, color, psVal, psLabel }) => (
          <div key={heading} style={{ background: "var(--ledger-card)", border: "1px solid #c8b890", padding: "6px 8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
              <span style={{ fontSize: "11px", fontWeight: 900, color }}>{heading}</span>
              {psVal != null && (
                <span style={{ fontSize: "11px", fontWeight: 900, color }}>
                  {psLabel} {psVal.toFixed(1)}
                </span>
              )}
            </div>
            {traits.map(t => {
              const aboveAvg = !t.unavailable && t.val > 0.5;
              return (
                <div key={t.label} title={`${t.title ?? t.label}${!t.unavailable ? ` · Score: ${Math.round(t.val * 100)}/100 · League avg ≈ 50` : ''}`}
                  style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "3px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 900, width: "28px", flexShrink: 0,
                    color: t.unavailable ? "var(--ledger-rule-mid)" : "var(--ledger-brown)" }}>
                    {t.label}
                  </span>
                  <div style={{ flex: 1, height: "6px", background: "var(--ledger-rule-mid)",
                    borderRadius: "3px", position: "relative", overflow: "visible" }}>
                    <div style={{
                      width: `${t.val * 100}%`, height: "100%", borderRadius: "3px",
                      background: t.unavailable ? "var(--ledger-rule-mid)" : color,
                      opacity: t.unavailable ? 0.3 : aboveAvg ? 0.85 : 0.45,
                      overflow: "hidden",
                    }}/>
                    {/* League average tick — 2px wide, 12px tall, centred at 50% */}
                    <div style={{
                      position: "absolute", left: "50%", top: "-3px",
                      width: "2px", height: "12px",
                      background: "var(--ledger-ink)", opacity: 0.5,
                      transform: "translateX(-50%)", borderRadius: "1px",
                    }}/>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 900, width: "20px",
                    textAlign: "right", flexShrink: 0,
                    color: t.unavailable ? "var(--ledger-rule-mid)"
                      : aboveAvg ? color : "var(--ledger-ink-faint)" }}>
                    {displayNum(t)}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Legend ───────────────────────────────────────────── */}
      <div className="text-2xs mt-2" style={{ color: "var(--ledger-ink-faint)", lineHeight: 1.6 }}>
        <div style={{ fontWeight: 900, color: "var(--ledger-brown)", marginBottom: "2px", letterSpacing: "0.1em" }}>
          STRAND — trait guide
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px",
          padding: "3px 5px", background: "var(--ledger-card)", border: "1px solid var(--ledger-rule-mid)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <div style={{ width: "36px", height: "4px", background: "var(--ledger-rule-mid)", borderRadius: "2px",
              position: "relative", overflow: "visible" }}>
              <div style={{ width: "70%", height: "100%", borderRadius: "2px",
                background: "var(--ledger-navy)", opacity: 0.7 }}/>
              <div style={{ position: "absolute", left: "50%", top: "-3px", width: "2px", height: "10px",
                background: "var(--ledger-ink)", opacity: 0.5, transform: "translateX(-50%)" }}/>
            </div>
            <span style={{ fontWeight: 900, color: "var(--ledger-ink-faint)", fontSize: "11px" }}>│</span>
          </div>
          <span>Bars normalised 0–100 vs NHL range. <strong style={{ color: "var(--ledger-ink-body)" }}>Tick = league avg ≈ 50.</strong> Above-avg in colour. Dashed helix = avg reference. OZ shows raw OZ%.</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
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
      </div>
    </div>
  );
}