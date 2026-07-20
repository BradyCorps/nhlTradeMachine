"use client";
// ── GravityField v3 — zone-mass rink diagram, tier icons, glossary ──
// Renders the Spacetime engine's output: three zone masses (OZ well,
// NZ well, DZ dome) on a rink strip, with force as the single currency.

import React from "react";
import type { GravityProfile, GravityTier, ZoneMasses } from "@/app/lib/gravity";
import { gravityTierColor } from "@/app/lib/gravity";

interface Props {
  profile: GravityProfile;
  playerName: string;
  mode?: "full" | "compact";
}

const TIER_LABEL: Record<GravityTier, string> = {
  SUPERMASSIVE:  "Supermassive",
  STAR:          "Star",
  MAIN_SEQUENCE: "Main Sequence",
  SATELLITE:     "Satellite",
  ASTEROID:      "Asteroid",
  BLACK_HOLE:    "Black Hole",
};

// ── Inline SVG tier icons (space-themed) ──────────────────────────────────
// Each renders a 16×16 SVG — usable in HTML and composited into the main SVG.

export function TierIcon({ tier, size = 16, color }: { tier: GravityTier; size?: number; color?: string }) {
  const c = color ?? gravityTierColor(tier);
  const s = size;

  switch (tier) {
    // Spiral galaxy — concentric arcs spiraling inward
    case "SUPERMASSIVE":
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="2" fill={c} />
          <path d="M8 3a5 5 0 0 1 4.33 2.5" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
          <path d="M8 13a5 5 0 0 1-4.33-2.5" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
          <path d="M4.5 4.5a4 4 0 0 1 7 0" stroke={c} strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
          <path d="M11.5 11.5a4 4 0 0 1-7 0" stroke={c} strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
          <circle cx="8" cy="8" r="6.5" stroke={c} strokeWidth="0.5" opacity="0.25" />
        </svg>
      );

    // Star burst — classic 4-pointed star with glow
    case "STAR":
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <polygon points="8,1.5 9.2,6 14,6.5 10.2,9.5 11.5,14 8,11 4.5,14 5.8,9.5 2,6.5 6.8,6" fill={c} opacity="0.85" />
          <line x1="8" y1="0" x2="8" y2="3" stroke={c} strokeWidth="0.6" opacity="0.4" />
          <line x1="8" y1="13" x2="8" y2="16" stroke={c} strokeWidth="0.6" opacity="0.4" />
          <line x1="0" y1="8" x2="3" y2="8" stroke={c} strokeWidth="0.6" opacity="0.4" />
          <line x1="13" y1="8" x2="16" y2="8" stroke={c} strokeWidth="0.6" opacity="0.4" />
        </svg>
      );

    // Steady sun — circle with small symmetrical rays
    case "MAIN_SEQUENCE":
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="3.5" fill={c} opacity="0.8" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => {
            const rad = (deg * Math.PI) / 180;
            const x1 = 8 + Math.cos(rad) * 5;
            const y1 = 8 + Math.sin(rad) * 5;
            const x2 = 8 + Math.cos(rad) * 6.8;
            const y2 = 8 + Math.sin(rad) * 6.8;
            return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />;
          })}
        </svg>
      );

    // Small orbiting body with trail
    case "SATELLITE":
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <ellipse cx="8" cy="8" rx="6" ry="3" stroke={c} strokeWidth="0.8" opacity="0.35" transform="rotate(-20 8 8)" />
          <circle cx="12.5" cy="6" r="2" fill={c} opacity="0.7" />
          <circle cx="8" cy="8" r="1" fill={c} opacity="0.3" />
        </svg>
      );

    // Small irregular rock
    case "ASTEROID":
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <polygon points="5,3 10,2 13,5 14,9 11,13 7,14 3,11 2,7" fill={c} opacity="0.4" stroke={c} strokeWidth="0.8" />
          <circle cx="7" cy="7" r="1" fill={c} opacity="0.3" />
          <circle cx="10" cy="10" r="0.6" fill={c} opacity="0.25" />
        </svg>
      );

    // Dark void with warped accretion ring
    case "BLACK_HOLE":
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="3" fill={c} opacity="0.9" />
          <circle cx="8" cy="8" r="2" fill="var(--paper-bg, #1a1a1a)" />
          <ellipse cx="8" cy="8" rx="6.5" ry="2.5" stroke={c} strokeWidth="1" opacity="0.5" />
          <ellipse cx="8" cy="8" rx="6.5" ry="2.5" stroke={c} strokeWidth="0.5" opacity="0.25" transform="rotate(30 8 8)" />
        </svg>
      );
  }
}

// ── Zone-mass vocabulary ──────────────────────────────────────────────────

const ZONE_GLOSSARY: Record<keyof ZoneMasses, string> = {
  oz: "Offensive-zone well — chances created, finishing threat, on-ice lift, PP leverage. Play falls toward the opponent's net.",
  nz: "Neutral-zone well — where play lives vs where he's deployed, plus speed and burst rate. Drags the game through center ice.",
  dz: "Defensive-zone dome — xGA suppression, defensive value, PK trust. Repulsive curvature: opponents can't set up here.",
};

const ZONE_TITLE: Record<keyof ZoneMasses, string> = {
  oz: "OZ Well",
  nz: "NZ Well",
  dz: "DZ Dome",
};

interface ZoneContext {
  qualifier: string;
  qualColor: string;
  description: string;
}

function zoneContext(zone: keyof ZoneMasses, m: number, isD: boolean): ZoneContext {
  const green = "var(--ledger-green)";
  const amber = "var(--ledger-amber, #d4a017)";
  const faint = "var(--ledger-ink-faint)";
  const red = "var(--ledger-red)";

  switch (zone) {
    case "oz": {
      if (m >= 0.75) return { qualifier: "Supermassive", qualColor: green, description: "A deep offensive well — chances, finishing, and on-ice lift all far beyond positional norms. Play collapses toward the opponent's net when he's out." };
      if (m >= 0.45) return { qualifier: "Strong", qualColor: green, description: "Clear offensive warping — creates and converts well above his position. Defenders must commit extra attention." };
      if (m >= 0.15) return { qualifier: "Positive", qualColor: amber, description: "A measurable offensive field — above positional average, but not the kind that bends coverage by itself." };
      if (m >= -0.15) return { qualifier: "Flat", qualColor: faint, description: "Offensive impact near positional average — the attacking zone doesn't curve much either way." };
      return { qualifier: "Caved", qualColor: red, description: "Offense runs below position when he's on the ice — the attacking-zone field sags." };
    }
    case "nz": {
      if (m >= 0.6) return { qualifier: "Transition Engine", qualColor: green, description: isD
        ? "Rare for a defenseman — play gets dragged through the neutral zone when he's deployed. The Quinn Hughes signal: deployment says one end, the puck lives in the other."
        : "Elite transporter — starts don't matter, the puck ends up going north. Speed and carry volume well beyond position." };
      if (m >= 0.3) return { qualifier: "Strong Carry", qualColor: green, description: "Real transition pull — moves play up ice beyond what deployment predicts, with the skating to force back-offs." };
      if (m >= 0.05) return { qualifier: "Detectable", qualColor: amber, description: "Modest neutral-zone influence — some carry signal, but transition isn't the core of his gravity." };
      if (m >= -0.15) return { qualifier: "Flat", qualColor: faint, description: "Neutral-zone impact around positional average — play moves through center ice at the rate deployment predicts." };
      return { qualifier: "Anchor", qualColor: red, description: "Play stalls in transit — the team moves the puck north less than deployment predicts with him out there." };
    }
    case "dz": {
      if (m >= 0.6) return { qualifier: "Fortress", qualColor: green, description: "A hard defensive dome — opponent offense can't set up. Suppression, defensive value, and PK trust all elite for the position." };
      if (m >= 0.3) return { qualifier: "Solid Dome", qualColor: green, description: "Meaningful repulsive curvature — the defensive zone is measurably harder to attack when he's on the ice." };
      if (m >= 0.05) return { qualifier: "Stable", qualColor: amber, description: "Holds his end at positional norms with a slight edge — not a shutdown profile, not a liability." };
      if (m >= -0.15) return { qualifier: "Flat", qualColor: faint, description: "Defensive impact near positional average — the home zone neither repels nor invites pressure." };
      return { qualifier: "Breached", qualColor: red, description: "The defensive zone caves with him deployed — opponents generate more than they should. A well in the wrong end of the ice." };
    }
  }
}

// ── CompactGravity — inline force + tier badge ────────────────────────────

function CompactGravity({ profile }: { profile: GravityProfile }) {
  const color = gravityTierColor(profile.tier);
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[10px]"
      role="text"
      aria-label={`Gravity: ${profile.force > 0 ? "+" : ""}${profile.force.toFixed(2)}, tier ${TIER_LABEL[profile.tier]}`}
    >
      <span className="font-black" style={{ color, fontVariantNumeric: "tabular-nums" }}>
        {profile.force > 0 ? "+" : ""}{profile.force.toFixed(2)}
      </span>
      <span
        className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.1em] px-1 py-px border"
        style={{ color, borderColor: color }}
      >
        <TierIcon tier={profile.tier} size={12} />
        {TIER_LABEL[profile.tier]}
      </span>
    </span>
  );
}

const clampViz = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── FieldDiagram — three-zone rink with mass curvature ────────────────────
// The rink is drawn left→right as DZ | NZ | OZ (player attacks right).
// Wells render as concentric rings sinking into the ice; the DZ dome
// renders as dashed repulsive rings. Ring count and opacity scale with
// mass. Negative mass in any zone renders red — the field caving in.

function FieldDiagram({ profile }: { profile: GravityProfile }) {
  const W = 320;
  const H = 240;
  const color = gravityTierColor(profile.tier);
  const { oz, nz, dz } = profile.masses;

  // Rink geometry
  const rinkX = 12, rinkY = 52, rinkW = 296, rinkH = 118;
  const midY = rinkY + rinkH / 2;
  const blue1 = rinkX + rinkW / 3;
  const blue2 = rinkX + (rinkW * 2) / 3;
  const centerX = rinkX + rinkW / 2;

  const zones: {
    key: keyof ZoneMasses;
    m: number;
    cx: number;
    repulsive: boolean;
  }[] = [
    { key: "dz", m: dz, cx: rinkX + rinkW / 6, repulsive: true },
    { key: "nz", m: nz, cx: centerX, repulsive: false },
    { key: "oz", m: oz, cx: rinkX + (rinkW * 5) / 6, repulsive: false },
  ];

  function zoneRings(zone: typeof zones[number]) {
    const mag = Math.abs(zone.m);
    if (mag < 0.05) return null;
    // For dz: positive mass = healthy dome (tier color, dashed = repulsion);
    // negative = breached (red, solid — a well in the wrong end).
    // For oz/nz: positive = well (tier color), negative = caved (red).
    const healthy = zone.m > 0;
    const ringColor = healthy ? color : "var(--ledger-red)";
    const dashed = zone.repulsive && healthy;
    const ringCount = Math.max(1, Math.min(5, Math.round(mag * 5) + 1));
    const maxRx = 44, maxRy = 34;

    return (
      <g key={zone.key}>
        {Array.from({ length: ringCount }).map((_, i) => {
          const t = (i + 1) / ringCount;
          const rx = 10 + (maxRx - 10) * t;
          const ry = 8 + (maxRy - 8) * t;
          const opacity = (0.14 + (1 - t) * 0.30) * clampViz(mag * 1.6, 0.3, 1);
          return (
            <ellipse
              key={i}
              cx={zone.cx} cy={midY}
              rx={rx} ry={ry}
              fill="none"
              stroke={ringColor}
              strokeWidth={i === 0 ? 1.8 : 1}
              strokeDasharray={dashed ? "4 3" : "none"}
              opacity={opacity}
            />
          );
        })}
        {/* Core node */}
        <circle cx={zone.cx} cy={midY} r={4.5} fill={ringColor} opacity={clampViz(0.35 + mag * 0.55, 0, 0.9)} />
      </g>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ maxWidth: 360, display: "block", margin: "0 auto" }}
      role="img"
      aria-label={`Gravity field: force ${profile.force > 0 ? "+" : ""}${profile.force.toFixed(2)}, tier ${TIER_LABEL[profile.tier]}. Offensive-zone well ${oz > 0 ? "+" : ""}${oz.toFixed(2)}, neutral-zone well ${nz > 0 ? "+" : ""}${nz.toFixed(2)}, defensive-zone dome ${dz > 0 ? "+" : ""}${dz.toFixed(2)}. Signal confidence ${(profile.confidence * 100).toFixed(0)} percent.`}
    >
      {/* Tier label — top left */}
      <text
        x={14} y={22}
        textAnchor="start"
        fill={color}
        fontFamily="'Courier Prime', monospace"
        fontWeight={900}
        fontSize={11}
        letterSpacing="0.12em"
      >
        {TIER_LABEL[profile.tier].toUpperCase()}
      </text>

      {/* Force readout — top right */}
      <text
        x={W - 14} y={22}
        textAnchor="end"
        fill={color}
        fontFamily="'Courier Prime', monospace"
        fontWeight={900}
        fontSize={18}
      >
        {profile.force > 0 ? "+" : ""}{profile.force.toFixed(2)}
      </text>
      <text
        x={W - 14} y={34}
        textAnchor="end"
        fill="var(--ledger-ink-faint)"
        fontFamily="'Courier Prime', monospace"
        fontWeight={900}
        fontSize={7}
        letterSpacing="0.18em"
      >
        NET FORCE
      </text>

      {/* Rink outline */}
      <rect
        x={rinkX} y={rinkY} width={rinkW} height={rinkH} rx={22}
        fill="var(--paper-inset)"
        stroke="var(--ledger-ink)"
        strokeWidth={1.5}
        opacity={0.9}
      />

      {/* Blue lines + center red line */}
      <line x1={blue1} y1={rinkY + 2} x2={blue1} y2={rinkY + rinkH - 2} stroke="var(--ledger-navy, #1a2e5c)" strokeWidth={2.5} opacity={0.45} />
      <line x1={blue2} y1={rinkY + 2} x2={blue2} y2={rinkY + rinkH - 2} stroke="var(--ledger-navy, #1a2e5c)" strokeWidth={2.5} opacity={0.45} />
      <line x1={centerX} y1={rinkY + 2} x2={centerX} y2={rinkY + rinkH - 2} stroke="var(--ledger-red)" strokeWidth={1.5} opacity={0.4} strokeDasharray="4 3" />

      {/* Goal lines */}
      <line x1={rinkX + 12} y1={rinkY + 6} x2={rinkX + 12} y2={rinkY + rinkH - 6} stroke="var(--ledger-red)" strokeWidth={1} opacity={0.3} />
      <line x1={rinkX + rinkW - 12} y1={rinkY + 6} x2={rinkX + rinkW - 12} y2={rinkY + rinkH - 6} stroke="var(--ledger-red)" strokeWidth={1} opacity={0.3} />

      {/* Zone mass fields */}
      {zones.map(zoneRings)}

      {/* Zone labels + values below rink */}
      {zones.map(zone => {
        const ctx = zoneContext(zone.key, zone.m, profile.isDefenseman);
        const healthy = zone.m > 0;
        const valColor = Math.abs(zone.m) < 0.05
          ? "var(--ledger-ink-faint)"
          : healthy ? color : "var(--ledger-red)";
        return (
          <g key={`label-${zone.key}`}>
            <text
              x={zone.cx} y={rinkY + rinkH + 18}
              textAnchor="middle"
              fill="var(--ledger-ink-faint)"
              fontFamily="'Courier Prime', monospace"
              fontWeight={900}
              fontSize={9}
              letterSpacing="0.1em"
            >
              {ZONE_TITLE[zone.key].toUpperCase()}
            </text>
            <text
              x={zone.cx} y={rinkY + rinkH + 34}
              textAnchor="middle"
              fill={valColor}
              fontFamily="'Courier Prime', monospace"
              fontWeight={900}
              fontSize={14}
            >
              {zone.m > 0 ? "+" : ""}{zone.m.toFixed(2)}
            </text>
            <text
              x={zone.cx} y={rinkY + rinkH + 45}
              textAnchor="middle"
              fill="var(--ledger-ink-faint)"
              fontFamily="'Courier Prime', monospace"
              fontWeight={700}
              fontSize={7}
              letterSpacing="0.06em"
              opacity={0.8}
            >
              {ctx.qualifier.toUpperCase()}
            </text>
          </g>
        );
      })}

      {/* Attack direction */}
      <text
        x={W - 14} y={rinkY - 6}
        textAnchor="end"
        fill="var(--ledger-ink-faint)"
        fontFamily="'Courier Prime', monospace"
        fontWeight={700}
        fontSize={7}
        letterSpacing="0.14em"
        opacity={0.7}
      >
        ATTACKING →
      </text>

      {/* Bottom title */}
      <text
        x={W / 2} y={H - 6}
        textAnchor="middle"
        fill="var(--ledger-ink-faint)"
        fontFamily="'Courier Prime', monospace"
        fontWeight={900}
        fontSize={8}
        letterSpacing="0.2em"
      >
        GRAVITATIONAL FIELD ANALYSIS
      </text>
    </svg>
  );
}

// ── Zone component panel with qualifiers ──────────────────────────────────

function ComponentPanel({ profile }: { profile: GravityProfile }) {
  const color = gravityTierColor(profile.tier);
  const items: { zone: keyof ZoneMasses; m: number }[] = [
    { zone: "oz", m: profile.masses.oz },
    { zone: "nz", m: profile.masses.nz },
    { zone: "dz", m: profile.masses.dz },
  ];

  return (
    <div className="flex flex-col gap-1.5" role="list" aria-label="Gravity zone masses">
      {items.map(({ zone, m }) => {
        const ctx = zoneContext(zone, m, profile.isDefenseman);
        const healthy = m > 0;
        const valColor = Math.abs(m) < 0.05
          ? "var(--ledger-ink-faint)"
          : healthy ? color : "var(--ledger-red)";
        return (
          <div key={zone}
            className="px-2.5 py-2 border"
            style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-bg)" }}
            role="listitem"
            aria-label={`${ZONE_TITLE[zone]}: ${m > 0 ? "+" : ""}${m.toFixed(2)}, ${ctx.qualifier}. ${ctx.description}`}
            title={ZONE_GLOSSARY[zone]}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <div
                  className="text-[10px] font-black uppercase tracking-[0.12em] font-mono"
                  style={{ color: "var(--ledger-ink-faint)" }}
                >
                  {ZONE_TITLE[zone]}
                </div>
                <div
                  className="text-[8px] font-black uppercase tracking-[0.08em] font-mono px-1 py-px border"
                  style={{ color: ctx.qualColor, borderColor: ctx.qualColor, lineHeight: 1.3 }}
                >
                  {ctx.qualifier}
                </div>
              </div>
              <div
                className="text-[15px] font-black font-mono leading-tight"
                style={{ color: valColor, fontVariantNumeric: "tabular-nums" }}
              >
                {m > 0 ? "+" : ""}{m.toFixed(2)}
              </div>
            </div>
            <div
              className="text-[10px] font-mono leading-snug mt-1"
              style={{ color: "var(--ledger-ink-faint)" }}
            >
              {ctx.description}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Signal panel — confidence, partner independence, data coverage ────────

function SignalPanel({ profile }: { profile: GravityProfile }) {
  const color = gravityTierColor(profile.tier);
  const confPct = Math.round(profile.confidence * 100);
  const confColor = confPct >= 75 ? "var(--ledger-green)" : confPct >= 50 ? "var(--ledger-amber, #d4a017)" : "var(--ledger-red)";
  const pi = profile.partnerIndependence;
  const piPct = Math.round(pi * 100);
  const piColor = pi >= 0.85 ? "var(--ledger-green)" : pi >= 0.65 ? "var(--ledger-amber, #d4a017)" : "var(--ledger-red)";
  const piLabel = pi >= 0.85 ? "Independent" : pi >= 0.65 ? "Likely Real" : "Borrowed?";

  return (
    <div
      className="mt-3 border p-3"
      style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-bg)" }}
      aria-label="Signal quality"
    >
      <div
        className="text-[10px] font-black uppercase tracking-[0.15em] font-mono mb-3"
        style={{ color: "var(--ledger-ink-faint)" }}
      >
        Signal Quality
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div
          className="border p-2.5"
          style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}
          role="group"
          aria-label={`Signal confidence: ${confPct}%. Sample size, year-over-year stability, and data coverage.`}
        >
          <div className="text-[9px] font-black uppercase tracking-[0.12em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
            Confidence
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <div className="text-[20px] font-black font-mono leading-tight" style={{ color: confColor, fontVariantNumeric: "tabular-nums" }}>
              {confPct}
            </div>
            <div className="text-[11px] font-black font-mono" style={{ color: confColor }}>%</div>
          </div>
          <div className="text-[9px] font-mono mt-1 leading-snug" style={{ color: "var(--ledger-ink-faint)" }}>
            Sample size, year-over-year stability, and data coverage.
            {profile.dataQuality === "partial" && " EDGE zone-time missing — transition read is reduced."}
          </div>
        </div>

        <div
          className="border p-2.5"
          style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}
          role="group"
          aria-label={`Partner independence: ${piPct}%, ${piLabel}. Is the on-ice lift the player's own, or borrowed from elite linemates?`}
        >
          <div className="text-[9px] font-black uppercase tracking-[0.12em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
            Partner Indep.
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <div className="text-[20px] font-black font-mono leading-tight" style={{ color: piColor, fontVariantNumeric: "tabular-nums" }}>
              {piPct}
            </div>
            <div className="text-[9px] font-black font-mono uppercase tracking-[0.06em]" style={{ color: piColor }}>
              {piLabel}
            </div>
          </div>
          <div className="text-[9px] font-mono mt-1 leading-snug" style={{ color: "var(--ledger-ink-faint)" }}>
            Is the on-ice lift his own, or borrowed from elite linemates? Damps the lift input directly.
          </div>
        </div>
      </div>

      {/* Tier description */}
      <div
        className="text-[11px] font-mono leading-relaxed mt-3 pt-2.5"
        style={{ color: "var(--ledger-ink-faint)", borderTop: "1px solid var(--ledger-rule-light)" }}
      >
        {profile.description}. Net force{" "}
        <span className="font-black" style={{ color }}>
          {profile.force > 0 ? "+" : ""}{profile.force.toFixed(2)}
        </span>
        {" "}— {profile.force >= 0.40
          ? "a dominant gravitational presence that warps the game"
          : profile.force >= 0.22
          ? "a meaningful pull that lifts his linemates"
          : profile.force >= 0.08
          ? "a modest but measurable gravitational field"
          : profile.force >= -0.22
          ? "effectively neutral — linemates play the same"
          : "a negative field — linemates produce less with him on the ice"
        }.
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────

export default function GravityField({ profile, playerName, mode = "full" }: Props) {
  if (mode === "compact") {
    return <CompactGravity profile={profile} />;
  }

  return (
    <div className="font-mono" role="region" aria-label={`Gravity field analysis for ${playerName}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[11px] font-black uppercase tracking-[0.15em]"
          style={{ color: "var(--ledger-ink-faint)" }}
        >
          Gravity Field
        </span>
        <span
          className="text-[11px] font-black uppercase tracking-[0.1em]"
          style={{ color: "var(--ledger-ink-faint)" }}
        >
          {playerName}
        </span>
      </div>

      {/* Top: rink diagram left, zone components right */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
        <div
          className="border p-2"
          style={{
            borderColor: "var(--ledger-rule)",
            background: "var(--paper-inset)",
          }}
        >
          <FieldDiagram profile={profile} />
        </div>

        <div>
          <ComponentPanel profile={profile} />
        </div>
      </div>

      {/* Bottom: signal quality */}
      <SignalPanel profile={profile} />
    </div>
  );
}

export { CompactGravity, FieldDiagram };
