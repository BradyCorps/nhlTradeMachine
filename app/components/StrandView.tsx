"use client";
// ── StrandView — STRAND™ helix analytics visualization ────────
import React from "react";
import type { Asset, XNAVResult } from "@/app/lib/trade-types";
import { PLAYER_PEDIGREE, INJURY_RISK } from "@/app/lib/player-data";

function safe(n: number) { return isNaN(n) || !isFinite(n) ? 0 : n; }

function StrandView({ asset, xnav, compareAsset, compareXnav }: {
  asset: Asset;
  xnav: XNAVResult;
  compareAsset?: Asset | null;
  compareXnav?: XNAVResult | null;
}) {
  const W = 320, H = 210;
  const cy = H / 2;
  const amplitude = 42;
  const freq = (2 * Math.PI) / W;

  const norm = (val: number, mn: number, mx: number) =>
    Math.max(0, Math.min(1, (val - mn) / (mx - mn)));

  const buildTraits = (a: Asset, nav: XNAVResult) => {
    const isD = a.position === "D";
    const ops = a.ops ?? null;
    const dps = a.dps ?? null;
    const psTotal = ops !== null && dps !== null ? ops + dps : null;
    const opsNorm = psTotal !== null && psTotal > 0 ? Math.max(0, Math.min(1, ops! / Math.max(psTotal, 1))) : null;
    const dpsNorm = psTotal !== null && psTotal > 0 ? Math.max(0, Math.min(1, dps! / Math.max(psTotal, 1))) : null;

    return {
      off: [
        { label: "SCR",  val: norm(safe(a.ptsPace), 0, isD ? 80 : 100),
          title: "Scoring pace per 82" },
        { label: "xG",   val: norm(safe(a.xGPace ?? 0), 0, isD ? 25 : 50),
          title: "Expected Goals generated" },
        { label: ops !== null ? "OPS" : "OFF",
          val: opsNorm ?? norm(nav.off, -80, 300),
          title: ops !== null ? `OPS ${ops.toFixed(1)} — Offensive Point Shares` : "Offensive NAV component",
          ps: ops !== null ? ops.toFixed(1) : null },
        { label: "NOIV", val: norm(safe(a.xgRelTM ?? 0), -12, 12),
          title: "xG% relative to teammates" },
        { label: "TOI+", val: norm(safe(a.avgTOI), 10, 27),
          title: "Ice time deployment" },
      ],
      def: [
        { label: "SUPP", val: norm(-(a.xgaRelTM ?? 0), -1.5, 1.5),
          title: "xGA suppression vs teammates" },
        { label: "QoC",  val: norm(400 - safe(a.qocRank ?? 400), 50, 380),
          title: "Quality of competition" },
        { label: dps !== null ? "DPS" : "DEF",
          val: dpsNorm ?? norm(nav.def, -60, 150),
          title: dps !== null ? `DPS ${dps.toFixed(1)} — Defensive Point Shares` : "Defensive NAV component",
          ps: dps !== null ? dps.toFixed(1) : null },
        { label: "DZ%",  val: 1 - norm(safe(a.dzPct ?? 0.5), 0.3, 0.7),
          title: "Offensive zone deployment" },
        { label: "AGE",  val: norm(nav.age, -80, 60),
          title: "Age curve trajectory" },
      ],
    };
  };

  const primary   = buildTraits(asset, xnav);
  const secondary = compareAsset && compareXnav ? buildTraits(compareAsset, compareXnav) : null;

  const offAvg = primary.off.reduce((s, t) => s + t.val, 0) / primary.off.length;
  const defAvg = primary.def.reduce((s, t) => s + t.val, 0) / primary.def.length;
  const balance = Math.abs(offAvg - defAvg);

  // PS ratio is the most accurate archetype signal when available —
  // it directly measures fraction of value that is offensive vs defensive.
  // Morrissey OPS 3.5 / DPS 5.0 = psRatio 0.41 → correctly identified as defensive
  const psRatio = (asset.ops != null && asset.dps != null && (asset.ops + asset.dps) > 1)
    ? asset.ops / (asset.ops + asset.dps)
    : null;

  const strandType =
    // PS ratio overrides heuristics when live data is available
    psRatio !== null && psRatio > 0.70 && offAvg > 0.60              ? "OFFENSIVE FORCE"
    : psRatio !== null && psRatio > 0.60 && offAvg > 0.50            ? "OFFENSIVE LEAN"
    : psRatio !== null && psRatio < 0.30 && defAvg > 0.55            ? "DEFENSIVE ANCHOR"
    : psRatio !== null && psRatio < 0.40 && defAvg > 0.45            ? "DEFENSIVE LEAN"
    : psRatio !== null && psRatio >= 0.40 && psRatio <= 0.60
        && offAvg > 0.58 && defAvg > 0.52                            ? "ELITE TWO-WAY"
    : psRatio !== null && psRatio >= 0.38 && psRatio <= 0.62         ? "COMPLETE PLAYER"
    // Fallback heuristics when no PS data
    : (offAvg > 0.72 && defAvg > 0.60 && balance < 0.20)            ? "ELITE TWO-WAY"
    : offAvg > defAvg + 0.15
      ? offAvg > 0.65 ? "OFFENSIVE FORCE" : "OFFENSIVE LEAN"
    : defAvg > offAvg + 0.15
      ? defAvg > 0.65 ? "DEFENSIVE ANCHOR" : "DEFENSIVE LEAN"
    : offAvg > 0.52 && defAvg > 0.52 ? "COMPLETE PLAYER"
    : "BALANCED";

  const offColor = "var(--ledger-navy)";
  const defColor = "var(--ledger-red)";
  const cmpOff   = "var(--ledger-navy)";
  const cmpDef   = "var(--ledger-red)";

  const buildPath = (traits: {label:string;val:number;title:string}[], isOff: boolean) => {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const t    = i / 80;
      const x    = t * W;
      const ti   = Math.min(4, Math.floor(t * 5));
      const amp  = amplitude * (0.35 + traits[ti].val * 0.65);
      const y    = cy + (isOff ? -1 : 1) * amp * Math.sin(freq * x * 2.5);
      pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(" ");
  };

  return (
    <div className="mt-1 mb-2">
      <div className="relative" style={{ background: "var(--ledger-cream)", border: "1px solid #c8b890", borderRadius: "2px" }}>
        <div className="strand-svg-wrap">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map(t => (
            <line key={t} x1={t*W} y1={12} x2={t*W} y2={H-12} stroke="var(--ledger-rule-mid)" strokeWidth="0.5" strokeDasharray="3,3"/>
          ))}
          <line x1={0} y1={cy} x2={W} y2={cy} stroke="var(--ledger-rule-mid)" strokeWidth="0.5"/>

          {/* Strand type badge — top left */}
          <rect x={4} y={4} width={strandType.length * 5.2 + 8} height={13} fill="var(--ledger-cream)" rx="1"/>
          <text x={8} y={13.5} fontSize="7.5" fill={
            strandType === "ELITE TWO-WAY" ? "var(--ledger-green)" :
            strandType === "COMPLETE PLAYER" ? "var(--ledger-green)" :
            strandType.includes("OFFENSIVE") ? "var(--ledger-navy)" :
            strandType.includes("DEFENSIVE") ? "var(--ledger-red)" : "var(--ledger-brown)"
          } fontFamily="Courier Prime, monospace" fontWeight="bold">{strandType}</text>

          {/* Compare strands */}
          {secondary && (<>
            <path d={buildPath(secondary.off, true)}  fill="none" stroke={cmpOff} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.6" strokeLinecap="round"/>
            <path d={buildPath(secondary.def, false)} fill="none" stroke={cmpDef} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.6" strokeLinecap="round"/>
          </>)}

          {/* Rungs */}
          {Array.from({ length: 18 }, (_, i) => {
            const t = (i + 0.5) / 18;
            const x = t * W;
            const ti = Math.min(4, Math.floor(t * 5));
            const oA = amplitude * (0.35 + primary.off[ti].val * 0.65);
            const dA = amplitude * (0.35 + primary.def[ti].val * 0.65);
            const oy = cy - oA * Math.sin(freq * x * 2.5);
            const dy = cy + dA * Math.sin(freq * x * 2.5);
            return <line key={i} x1={x} y1={oy} x2={x} y2={dy} stroke="var(--ledger-ink-faint)" strokeWidth="0.8" opacity={0.12 + Math.abs(Math.sin(freq * x * 2.5)) * 0.25}/>;
          })}

          {/* Strands */}
          <path d={buildPath(primary.def, false)} fill="none" stroke={defColor} strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
          <path d={buildPath(primary.off, true)}  fill="none" stroke={offColor} strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>

          {/* Offensive nodes */}
          {primary.off.map((t, i) => {
            const x = ((i + 0.5) / 5) * W;
            const amp = amplitude * (0.35 + t.val * 0.65);
            const y = cy - amp * Math.sin(freq * x * 2.5);
            const hasPs = (t as any).ps != null;
            const displayVal = hasPs ? (t as any).ps : Math.round(t.val * 100);
            // Label always above the node, value below label — both above center line
            const labelY = Math.min(y - 12, cy - 16);
            const valY   = labelY + 9;
            return <g key={t.label}>
              <circle cx={x} cy={y} r={t.val * 4 + 2.5} fill={offColor} opacity="0.15"/>
              <circle cx={x} cy={y} r={hasPs ? 4 : 3} fill={offColor}/>
              <line x1={x} y1={y - (hasPs ? 4 : 3)} x2={x} y2={labelY + 2} stroke={offColor} strokeWidth="0.8" opacity="0.4"/>
              <text x={x} y={labelY} textAnchor="middle" fontSize="7.5" fill={offColor} fontFamily="Courier Prime, monospace" fontWeight="bold">{t.label}</text>
              <text x={x} y={valY}   textAnchor="middle" fontSize="6.5" fill={offColor} fontFamily="Courier Prime, monospace" opacity="0.9">{displayVal}</text>
            </g>;
          })}

          {/* Defensive nodes */}
          {primary.def.map((t, i) => {
            const x = ((i + 0.5) / 5) * W;
            const amp = amplitude * (0.35 + t.val * 0.65);
            const y = cy + amp * Math.sin(freq * x * 2.5);
            const hasPs = (t as any).ps != null;
            const displayVal = hasPs ? (t as any).ps : Math.round(t.val * 100);
            // Label always below the node, value above label — both below center line
            const labelY = Math.max(y + 14, cy + 18);
            const valY   = labelY + 9;
            return <g key={t.label}>
              <circle cx={x} cy={y} r={t.val * 4 + 2.5} fill={defColor} opacity="0.15"/>
              <circle cx={x} cy={y} r={hasPs ? 4 : 3} fill={defColor}/>
              <line x1={x} y1={y + (hasPs ? 4 : 3)} x2={x} y2={labelY - 4} stroke={defColor} strokeWidth="0.8" opacity="0.4"/>
              <text x={x} y={labelY} textAnchor="middle" fontSize="7.5" fill={defColor} fontFamily="Courier Prime, monospace" fontWeight="bold">{t.label}</text>
              <text x={x} y={valY}   textAnchor="middle" fontSize="6.5" fill={defColor} fontFamily="Courier Prime, monospace" opacity="0.9">{displayVal}</text>
            </g>;
          })}

          {/* Compare legend */}
          {secondary && (
            <g>
              <line x1={W-95} y1={H-8} x2={W-81} y2={H-8} stroke={cmpOff} strokeWidth="1.5" strokeDasharray="4,2"/>
              <text x={W-78} y={H-4} fontSize="6.5" fill={cmpOff} fontFamily="Courier Prime, monospace">
                {compareAsset?.name.split(" ").pop()}
              </text>
            </g>
          )}
        </svg>
        </div>
      </div>

      {/* Compact trait bars — 2-col grid, OFF on left, DEF on right */}
      <div style={{ marginTop: "8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        {[
          { label: "◆ OFFENSE", traits: primary.off, color: offColor, ps: asset.ops ?? null, psLabel: "OPS" },
          { label: "◆ DEFENSE", traits: primary.def, color: defColor, ps: asset.dps ?? null, psLabel: "DPS" },
        ].map(({ label, traits, color, ps, psLabel }) => (
          <div key={label} style={{ background: "var(--ledger-card)", border: "1px solid #c8b890", padding: "6px 8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
              <span style={{ fontSize: "11px", fontWeight: 900, color }}>{label}</span>
              {ps !== null && ps !== undefined && (
                <span style={{ fontSize: "11px", fontWeight: 900, color }}>
                  {psLabel} {(ps as number).toFixed(1)}
                </span>
              )}
            </div>
            {traits.map(t => (
              <div key={t.label} style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "3px" }} title={t.title}>
                <span style={{ fontSize: "11px", fontWeight: 900, width: "26px", flexShrink: 0, color: "var(--ledger-brown)" }}>{t.label}</span>
                <div style={{ flex: 1, height: "4px", background: "var(--ledger-rule-mid)", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ width: `${t.val * 100}%`, height: "100%", background: color, opacity: 0.85 }}/>
                </div>
                <span style={{ fontSize: "11px", fontWeight: 900, width: "18px", textAlign: "right", flexShrink: 0, color }}>{Math.round(t.val * 100)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="text-2xs mt-1 text-center" style={{ color: "var(--ledger-rule)" }}>
        STRAND™ — Stylistic Trait & Rating Analysis for NHL Development
      </div>
    </div>
  );
}


export default StrandView;