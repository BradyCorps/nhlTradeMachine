"use client";
// ── GravityField v2.3 — inline SVG tier icons, orbital physics, glossary ──

import React from "react";
import type { GravityProfile, GravityTier } from "@/app/lib/gravity";
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
  const h = s / 2;

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

// Static glossary for mechanism bars and side boxes
const GLOSSARY: Record<string, string> = {
  "Space Creation": "Creating high-quality chances for others beyond his own shooting.",
  "Transition": "Neutral-zone carry and zone entry dominance — skating speed and puck transport.",
  "Pace": "Shot-generation rate relative to position average — how much the tempo quickens when on ice.",
  "Def. Warping": "xGA suppression, defensive point shares, and PK trust — forcing opponents to overcommit.",
  "Gravity Assist": "Invisible creation beyond the scoresheet. High = lifts team without needing personal credit.",
  "Signal Confidence": "How likely this gravity reading holds next season. Based on year-over-year consistency.",
};

// Dynamic, value-aware descriptions for the component panel
interface ComponentContext {
  qualifier: string;
  qualColor: string;
  description: string;
}

function getComponentContext(label: string, raw: number, profile: GravityProfile): ComponentContext {
  const isD = profile.isDefenseman;
  const green = "var(--ledger-green)";
  const amber = "var(--ledger-amber, #d4a017)";
  const faint = "var(--ledger-ink-faint)";
  const red = "var(--ledger-red)";

  switch (label) {
    case "NOIV Lift": {
      const v = raw;
      if (v >= 0.25)
        return { qualifier: "Elite", qualColor: green, description: `Linemates create significantly more offense with him on ice. A lift this strong is rare — top-of-league territory.` };
      if (v >= 0.10)
        return { qualifier: "Strong", qualColor: green, description: `Clear positive effect on linemates — they produce more offense when he's deployed. Above average for a regular.` };
      if (v >= 0.02)
        return { qualifier: "Positive", qualColor: amber, description: `Modest lift — linemates are slightly better with him on ice, but the effect isn't commanding.` };
      if (v >= -0.02)
        return { qualifier: "Neutral", qualColor: faint, description: `No measurable effect on linemate production. Linemates play roughly the same with or without him.` };
      if (v >= -0.10)
        return { qualifier: "Below Avg", qualColor: red, description: `Linemates produce less with him on ice. Could reflect deployment, a style mismatch, or a player who absorbs touches without creating.` };
      return { qualifier: "Harmful", qualColor: red, description: `Linemates produce significantly less offense with him deployed. Strong negative signal.` };
    }

    case "Zone Pull": {
      const v = raw;
      if (v >= 0.30)
        return { qualifier: "Strong OZ", qualColor: green, description: `Team spends significantly more time in the offensive zone when he's on ice — he pulls play forward.` };
      if (v >= 0.10)
        return { qualifier: "OZ Tilt", qualColor: green, description: `Positive territorial effect — the team plays more in the attacking zone with him deployed.` };
      if (v >= -0.05)
        return { qualifier: "Balanced", qualColor: faint, description: `Roughly even zone time — no strong pull toward offense or defense.` };
      if (v >= -0.20)
        return { qualifier: "DZ Tilt", qualColor: amber, description: isD
          ? `Defensive zone tilt is common for stay-at-home defensemen — not necessarily a negative if he's deployed that way on purpose.`
          : `Team tilts defensive when he's on ice. Can reflect tough matchups, or a player who doesn't drive transition.` };
      return { qualifier: "Heavy DZ", qualColor: red, description: isD
        ? `Strong defensive zone tilt. If he's a shutdown D this is expected; otherwise it's limiting his gravity.`
        : `Team is pinned in its own zone when he plays — a significant drag on territorial control.` };
    }

    case "Creation": {
      const v = raw;
      if (isD) {
        if (v >= 1.20)
          return { qualifier: "Transition D", qualColor: green, description: `Rare for a defenseman — his team improves beyond what his own stats suggest. Likely a strong puck-mover who creates through outlet passes and transition.` };
        if (v >= 0.90)
          return { qualifier: "Balanced", qualColor: amber, description: `Team lift roughly matches his personal production. Typical for a defenseman who contributes on both ends.` };
        return { qualifier: "Structure", qualColor: faint, description: `Team lift is less than his personal stats — typical for defensemen whose value comes through defensive structure, gap control, and positioning rather than playmaking.` };
      }
      if (v >= 1.30)
        return { qualifier: "Elite Creator", qualColor: green, description: `Makes everyone around him better — the team improves far more than his personal stats explain. Classic "raises the tide" player.` };
      if (v >= 1.05)
        return { qualifier: "Creator", qualColor: green, description: `Team lift exceeds his own production — he opens space and chances for linemates beyond what shows on his own stat line.` };
      if (v >= 0.85)
        return { qualifier: "Balanced", qualColor: amber, description: `Team lift roughly matches his personal output — creates as much as his stats suggest, neither pure finisher nor pure playmaker.` };
      if (v >= 0.60)
        return { qualifier: "Finisher", qualColor: faint, description: `Personal stats exceed team lift — his value comes more from converting chances than creating them for others.` };
      return { qualifier: "Pure Scorer", qualColor: faint, description: `Strong individual numbers but team doesn't lift proportionally. A triggerman who needs creators around him.` };
    }

    case "Mass": {
      const v = raw;
      if (v >= 1.00)
        return { qualifier: "Heavy", qualColor: green, description: `High-minute, high-production player — carries major gravitational weight. His presence shapes a full game.` };
      if (v >= 0.60)
        return { qualifier: "Solid", qualColor: amber, description: `Meaningful minutes and production. Enough ice time and output to create a measurable gravitational field.` };
      if (v >= 0.30)
        return { qualifier: "Light", qualColor: faint, description: `Moderate usage or production — the gravitational field exists but doesn't dominate. Limited minutes or limited scoring dilute the signal.` };
      return { qualifier: "Minimal", qualColor: faint, description: `Low minutes and/or production — not enough on-ice presence to create a meaningful gravitational effect.` };
    }

    case "Partner Indep.": {
      const v = raw;
      if (v >= 1.15)
        return { qualifier: "Confirmed", qualColor: green, description: `Multi-season data shows consistent gravity regardless of linemates — this is real, independent pull, not borrowed from elite partners.` };
      if (v >= 1.05)
        return { qualifier: "Likely Real", qualColor: green, description: `Good year-over-year consistency. The gravity signal is probably real, though more seasons would strengthen confidence.` };
      if (v >= 0.95)
        return { qualifier: "Baseline", qualColor: faint, description: `Not enough multi-season variation to confirm — the reading could change with different linemates or deployment.` };
      if (v >= 0.80)
        return { qualifier: "Uncertain", qualColor: amber, description: `Current and historical signals diverge — the gravity may be partly borrowed from strong linemates. Watch for changes after lineup shifts.` };
      return { qualifier: "Suspect", qualColor: red, description: `Significant year-over-year inconsistency — this player's gravity reading is likely inflated by elite linemates or specific deployment.` };
    }

    default:
      return { qualifier: "", qualColor: faint, description: "" };
  }
}

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

// Stronger values orbit CLOSER to the center (gravitational pull)
function valueToOrbit(value: number, min: number, max: number): number {
  const t = (value - min) / (max - min);
  return 0.85 - clampViz(t, 0, 1) * 0.55;
}

// ── SVG orbital field diagram ──────────────────────────────────────────────

function FieldDiagram({ profile }: { profile: GravityProfile }) {
  const W = 320;
  const H = 300;
  const cx = W / 2;
  const cy = 150;
  const absForce = Math.abs(profile.force);
  const isNeg = profile.force < 0;
  const color = gravityTierColor(profile.tier);

  const ringCount = Math.max(2, Math.min(7, Math.round(absForce * 8) + 2));
  const maxR = 100;
  const minR = 30;
  const coreR = 26;

  const rings: { r: number; opacity: number }[] = [];
  for (let i = 0; i < ringCount; i++) {
    const t = (i + 1) / ringCount;
    const r = minR + (maxR - minR) * Math.pow(t, 0.7);
    const opBase = 0.1 + (1 - t) * 0.25;
    const opScale = Math.min(1, absForce * 1.5);
    rings.push({ r, opacity: opBase * opScale });
  }

  const gridLines = 8;
  const gridAngleStep = (2 * Math.PI) / gridLines;

  // Primary orbital markers
  const primaryDots = [
    {
      label: "NOIV", value: profile.noivLift,
      angle: -Math.PI * 0.75,
      orbit: valueToOrbit(profile.noivLift, -1, 1),
      display: `${profile.noivLift > 0 ? "+" : ""}${profile.noivLift.toFixed(2)}`,
    },
    {
      label: "Zone Pull", value: profile.zonePull,
      angle: -Math.PI * 0.25,
      orbit: valueToOrbit(profile.zonePull, -0.5, 0.75),
      display: `${profile.zonePull > 0 ? "+" : ""}${profile.zonePull.toFixed(2)}`,
    },
    {
      label: "Creation", value: profile.creationAmplifier,
      angle: Math.PI * 0.70,
      orbit: valueToOrbit(profile.creationAmplifier, 0.5, 2.0),
      display: `×${profile.creationAmplifier.toFixed(2)}`,
    },
  ];

  // Secondary markers — Grav Ast positioned lower-right to avoid tier label
  const secondaryDots = [
    {
      label: "Partner", value: profile.partnerIndependence,
      angle: Math.PI * 0.15,
      orbit: valueToOrbit(profile.partnerIndependence, 0.5, 1.4),
      display: `×${profile.partnerIndependence.toFixed(2)}`,
    },
    {
      label: "Grav Ast", value: profile.gravityAssist,
      angle: Math.PI * 0.42,
      orbit: valueToOrbit(profile.gravityAssist, 0, 1),
      display: profile.gravityAssist.toFixed(2),
    },
  ];

  // Confidence arc
  const piArc = clampViz(profile.partnerIndependence, 0.5, 1.4);
  const arcFraction = (piArc - 0.5) / 0.9;
  const arcR = coreR + 9;
  const arcAngleSpan = Math.PI * 2 * arcFraction;
  const arcStart = -Math.PI / 2;
  const arcEnd = arcStart + arcAngleSpan;
  const arcX1 = cx + Math.cos(arcStart) * arcR;
  const arcY1 = cy + Math.sin(arcStart) * arcR;
  const arcX2 = cx + Math.cos(arcEnd) * arcR;
  const arcY2 = cy + Math.sin(arcEnd) * arcR;
  const largeArc = arcAngleSpan > Math.PI ? 1 : 0;

  // Tier icon SVG fragments — rendered directly inside the diagram SVG
  function renderTierIcon(x: number, y: number) {
    const s = 18;
    const ox = x - s / 2;
    const oy = y - s / 2;

    switch (profile.tier) {
      case "SUPERMASSIVE":
        return (
          <g transform={`translate(${ox},${oy})`}>
            <circle cx="9" cy="9" r="2.2" fill={color} />
            <path d="M9 3.5a5.5 5.5 0 0 1 4.76 2.75" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
            <path d="M9 14.5a5.5 5.5 0 0 1-4.76-2.75" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="9" cy="9" r="7" stroke={color} strokeWidth="0.5" opacity="0.3" />
          </g>
        );
      case "STAR":
        return (
          <g transform={`translate(${ox},${oy})`}>
            <polygon points="9,2 10.3,6.5 15,7 11.2,10 12.5,14.5 9,11.5 5.5,14.5 6.8,10 3,7 7.7,6.5" fill={color} opacity="0.85" />
          </g>
        );
      case "MAIN_SEQUENCE":
        return (
          <g transform={`translate(${ox},${oy})`}>
            <circle cx="9" cy="9" r="3.5" fill={color} opacity="0.8" />
            {[0, 90, 180, 270].map(deg => {
              const rad = (deg * Math.PI) / 180;
              const x1 = 9 + Math.cos(rad) * 5.2;
              const y1 = 9 + Math.sin(rad) * 5.2;
              const x2 = 9 + Math.cos(rad) * 7;
              const y2 = 9 + Math.sin(rad) * 7;
              return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1.3" strokeLinecap="round" opacity="0.6" />;
            })}
          </g>
        );
      case "SATELLITE":
        return (
          <g transform={`translate(${ox},${oy})`}>
            <ellipse cx="9" cy="9" rx="6.5" ry="3" stroke={color} strokeWidth="0.8" opacity="0.35" transform="rotate(-20 9 9)" />
            <circle cx="13" cy="7" r="2" fill={color} opacity="0.7" />
          </g>
        );
      case "ASTEROID":
        return (
          <g transform={`translate(${ox},${oy})`}>
            <polygon points="6,3.5 11,3 14,6 14.5,10 12,14 7.5,14.5 4,12 3,8" fill={color} opacity="0.4" stroke={color} strokeWidth="0.8" />
          </g>
        );
      case "BLACK_HOLE":
        return (
          <g transform={`translate(${ox},${oy})`}>
            <circle cx="9" cy="9" r="3.2" fill={color} opacity="0.9" />
            <circle cx="9" cy="9" r="2" fill="var(--paper-bg)" />
            <ellipse cx="9" cy="9" rx="7" ry="2.5" stroke={color} strokeWidth="1" opacity="0.5" />
          </g>
        );
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ maxWidth: 360, display: "block", margin: "0 auto" }}
      role="img"
      aria-label={`Gravity field: force ${profile.force > 0 ? "+" : ""}${profile.force.toFixed(2)}, tier ${TIER_LABEL[profile.tier]}. NOIV lift ${profile.noivLift > 0 ? "+" : ""}${profile.noivLift.toFixed(2)}, zone pull ${profile.zonePull > 0 ? "+" : ""}${profile.zonePull.toFixed(2)}, creation amplifier times ${profile.creationAmplifier.toFixed(2)}, player mass ${profile.playerMass.toFixed(2)}, partner independence times ${profile.partnerIndependence.toFixed(2)}, gravity assist ${profile.gravityAssist.toFixed(2)}, signal confidence ${(profile.predictiveStability * 100).toFixed(0)} percent.`}
    >
      {/* Radial grid */}
      {Array.from({ length: gridLines }).map((_, i) => {
        const angle = i * gridAngleStep;
        const x2 = cx + Math.cos(angle) * (maxR + 5);
        const y2 = cy + Math.sin(angle) * (maxR + 5);
        return (
          <line
            key={`grid-${i}`}
            x1={cx} y1={cy} x2={x2} y2={y2}
            stroke="var(--ledger-rule)"
            strokeWidth={0.5}
            opacity={0.2}
          />
        );
      })}

      {/* Field rings */}
      {rings.map(({ r, opacity }, i) => (
        <circle
          key={`ring-${i}`}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={isNeg ? "var(--ledger-red)" : color}
          strokeWidth={i === 0 ? 2 : 1}
          opacity={opacity}
          strokeDasharray={isNeg ? "5 3" : "none"}
        />
      ))}

      {/* Outer boundary */}
      <circle
        cx={cx} cy={cy} r={maxR + 8}
        fill="none"
        stroke="var(--ledger-rule)"
        strokeWidth={0.5}
        opacity={0.3}
      />

      {/* Orbital paths */}
      {primaryDots.map(({ orbit }, i) => {
        const orbitR = minR + (maxR - minR) * orbit;
        return (
          <circle
            key={`orbit-p-${i}`}
            cx={cx} cy={cy} r={orbitR}
            fill="none"
            stroke="var(--ledger-ink-faint)"
            strokeWidth={0.5}
            strokeDasharray="2 5"
            opacity={0.2}
          />
        );
      })}

      {/* Primary markers */}
      {primaryDots.map(({ label, angle, orbit, display }, i) => {
        const orbitR = minR + (maxR - minR) * orbit;
        const mx = cx + Math.cos(angle) * orbitR;
        const my = cy + Math.sin(angle) * orbitR;
        const labelR = maxR + 26;
        const lx = cx + Math.cos(angle) * labelR;
        const ly = cy + Math.sin(angle) * labelR;
        const anchor = lx < cx - 10 ? "end" : lx > cx + 10 ? "start" : "middle";

        return (
          <g key={`comp-p-${i}`}>
            <line
              x1={mx} y1={my} x2={lx} y2={ly}
              stroke="var(--ledger-ink-faint)"
              strokeWidth={0.7}
              opacity={0.35}
              strokeDasharray="2 2"
            />
            <circle
              cx={mx} cy={my} r={5}
              fill={color}
              stroke="var(--paper-bg)"
              strokeWidth={2}
              opacity={0.9}
            />
            <text
              x={lx} y={ly - 6}
              textAnchor={anchor}
              fill="var(--ledger-ink-faint)"
              fontFamily="'Courier Prime', monospace"
              fontWeight={900}
              fontSize={9}
              letterSpacing="0.1em"
            >
              {label.toUpperCase()}
            </text>
            <text
              x={lx} y={ly + 7}
              textAnchor={anchor}
              fill={color}
              fontFamily="'Courier Prime', monospace"
              fontWeight={900}
              fontSize={13}
            >
              {display}
            </text>
          </g>
        );
      })}

      {/* Secondary markers */}
      {secondaryDots.map(({ label, angle, orbit, display }, i) => {
        const orbitR = minR + (maxR - minR) * orbit;
        const mx = cx + Math.cos(angle) * orbitR;
        const my = cy + Math.sin(angle) * orbitR;
        const labelR = maxR + 24;
        const lx = cx + Math.cos(angle) * labelR;
        const ly = cy + Math.sin(angle) * labelR;
        const anchor = lx < cx - 10 ? "end" : lx > cx + 10 ? "start" : "middle";

        return (
          <g key={`comp-s-${i}`}>
            <line
              x1={mx} y1={my} x2={lx} y2={ly}
              stroke="var(--ledger-ink-faint)"
              strokeWidth={0.5}
              opacity={0.25}
              strokeDasharray="1 3"
            />
            <circle
              cx={mx} cy={my} r={3.5}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              opacity={0.7}
            />
            <text
              x={lx} y={ly - 5}
              textAnchor={anchor}
              fill="var(--ledger-ink-faint)"
              fontFamily="'Courier Prime', monospace"
              fontWeight={900}
              fontSize={8}
              letterSpacing="0.08em"
            >
              {label.toUpperCase()}
            </text>
            <text
              x={lx} y={ly + 6}
              textAnchor={anchor}
              fill={color}
              fontFamily="'Courier Prime', monospace"
              fontWeight={900}
              fontSize={11}
              opacity={0.8}
            >
              {display}
            </text>
          </g>
        );
      })}

      {/* Confidence arc */}
      {arcAngleSpan > 0.05 && (
        <path
          d={`M ${arcX1} ${arcY1} A ${arcR} ${arcR} 0 ${largeArc} 1 ${arcX2} ${arcY2}`}
          fill="none"
          stroke={color}
          strokeWidth={2}
          opacity={0.5}
          strokeLinecap="round"
        />
      )}

      {/* Central mass node */}
      <circle cx={cx} cy={cy} r={coreR + 6} fill="none" stroke={color} strokeWidth={1} opacity={0.25} />
      <circle cx={cx} cy={cy} r={coreR + 3} fill="none" stroke={color} strokeWidth={1.5} opacity={0.4} />
      <circle cx={cx} cy={cy} r={coreR} fill="var(--paper-bg)" stroke={color} strokeWidth={2.5} />

      {/* Force readout */}
      <text
        x={cx} y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--ledger-rule)"
        fontFamily="'Courier Prime', monospace"
        fontWeight={900}
        fontSize={18}
      >
        {profile.force > 0 ? "+" : ""}{profile.force.toFixed(2)}
      </text>

      {/* Tier icon + label — inline, vertically centered */}
      {renderTierIcon(50, 20)}
      <text
        x={68}
        y={20}
        textAnchor="start"
        dominantBaseline="central"
        fill={color}
        fontFamily="'Courier Prime', monospace"
        fontWeight={900}
        fontSize={11}
        letterSpacing="0.12em"
      >
        {TIER_LABEL[profile.tier].toUpperCase()}
      </text>

      {/* Bottom title */}
      <text
        x={cx} y={H - 6}
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

// ── Component panel with glossary ─────────────────────────────────────────

function ComponentPanel({ profile }: { profile: GravityProfile }) {
  const color = gravityTierColor(profile.tier);
  const items: { label: string; value: string; raw: number }[] = [
    {
      label: "NOIV Lift",
      value: `${profile.noivLift > 0 ? "+" : ""}${profile.noivLift.toFixed(2)}`,
      raw: profile.noivLift,
    },
    {
      label: "Zone Pull",
      value: `${profile.zonePull > 0 ? "+" : ""}${profile.zonePull.toFixed(2)}`,
      raw: profile.zonePull,
    },
    {
      label: "Creation",
      value: `×${profile.creationAmplifier.toFixed(2)}`,
      raw: profile.creationAmplifier,
    },
    {
      label: "Mass",
      value: profile.playerMass.toFixed(2),
      raw: profile.playerMass,
    },
    {
      label: "Partner Indep.",
      value: `×${profile.partnerIndependence.toFixed(2)}`,
      raw: profile.partnerIndependence,
    },
  ];

  return (
    <div className="flex flex-col gap-1.5" role="list" aria-label="Gravity components">
      {items.map(({ label, value, raw }) => {
        const ctx = getComponentContext(label, raw, profile);
        return (
          <div key={label}
            className="px-2.5 py-2 border"
            style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-bg)" }}
            role="listitem"
            aria-label={`${label}: ${value}, ${ctx.qualifier}. ${ctx.description}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <div
                  className="text-[10px] font-black uppercase tracking-[0.12em] font-mono"
                  style={{ color: "var(--ledger-ink-faint)" }}
                >
                  {label}
                </div>
                {ctx.qualifier && (
                  <div
                    className="text-[8px] font-black uppercase tracking-[0.08em] font-mono px-1 py-px border"
                    style={{ color: ctx.qualColor, borderColor: ctx.qualColor, lineHeight: 1.3 }}
                  >
                    {ctx.qualifier}
                  </div>
                )}
              </div>
              <div
                className="text-[15px] font-black font-mono leading-tight"
                style={{ color, fontVariantNumeric: "tabular-nums" }}
              >
                {value}
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

      {/* Context badge */}
      {profile.contextAdjustment !== 1.0 && (
        <div className="text-[10px] font-mono font-black px-2.5 mt-0.5" style={{ color: "var(--ledger-ink-faint)" }}>
          Context ×{profile.contextAdjustment.toFixed(2)} (QoC · zone · PP)
        </div>
      )}
    </div>
  );
}

// ── Mechanism bar ──────────────────────────────────────────────────────────

const LEAGUE_AVG: Record<string, number> = {
  "Space Creation":  0.22,
  "Transition":      0.30,
  "Pace":            0.25,
  "Def. Warping":    0.20,
};

function MechanismBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(clampViz(value, 0, 1) * 100);
  const avgPct = Math.round((LEAGUE_AVG[label] ?? 0) * 100);

  return (
    <div
      className="flex items-center gap-2"
      role="meter"
      aria-label={`${label}: ${value.toFixed(2)} out of 1.00, league average ${(LEAGUE_AVG[label] ?? 0).toFixed(2)}. ${GLOSSARY[label] ?? ""}`}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="text-[10px] font-black uppercase tracking-[0.10em] font-mono shrink-0"
        style={{ color: "var(--ledger-ink-faint)", width: 110 }}
        title={GLOSSARY[label]}
      >
        {label}
      </div>
      <div
        className="flex-1 h-[7px] relative"
        style={{ background: "var(--paper-inset)", border: "1px solid var(--ledger-rule-light)", borderRadius: 1 }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: pct > 60 ? color : "var(--ledger-ink-faint)",
            opacity: pct > 60 ? 0.8 : 0.4,
            borderRadius: 1,
          }}
        />
        {avgPct > 0 && (
          <div
            style={{
              position: "absolute",
              left: `${avgPct}%`,
              top: -2,
              bottom: -2,
              width: 1,
              background: "var(--ledger-ink)",
              opacity: 0.35,
            }}
            title={`League avg: ${(LEAGUE_AVG[label] ?? 0).toFixed(2)}`}
            aria-hidden="true"
          />
        )}
      </div>
      <div
        className="text-[11px] font-black font-mono tabular-nums shrink-0"
        style={{ color: pct > 60 ? color : "var(--ledger-ink-faint)", width: 32, textAlign: "right" }}
      >
        {value.toFixed(2)}
      </div>
    </div>
  );
}

// ── Analytical depth section ─────────────────────────────────────────────

function AnalyticalDepth({ profile }: { profile: GravityProfile }) {
  const color = gravityTierColor(profile.tier);
  const m = profile.mechanisms;
  const stabPct = Math.round(profile.predictiveStability * 100);
  const stabColor = stabPct >= 75 ? "var(--ledger-green)" : stabPct >= 50 ? "var(--ledger-amber, #d4a017)" : "var(--ledger-red)";

  return (
    <div
      className="mt-3 border p-3"
      style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-bg)" }}
      aria-label="Analytical depth"
    >
      <div
        className="text-[10px] font-black uppercase tracking-[0.15em] font-mono mb-3"
        style={{ color: "var(--ledger-ink-faint)" }}
      >
        Analytical Depth
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr minmax(140px, 180px)" }}>
        {/* Left: mechanism decomposition */}
        <div style={{ minWidth: 0 }}>
          <div className="flex items-center justify-between mb-2">
            <div
              className="text-[9px] font-black uppercase tracking-[0.12em] font-mono"
              style={{ color: "var(--ledger-ink-faint)" }}
            >
              Mechanism Decomposition
            </div>
            <div className="flex items-center gap-1.5">
              <div style={{ width: 1, height: 8, background: "var(--ledger-ink)", opacity: 0.35 }} />
              <div className="text-[8px] font-mono uppercase" style={{ color: "var(--ledger-ink-faint)", letterSpacing: "0.06em" }}>
                Avg
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <MechanismBar label="Space Creation" value={m.spaceCreation} color={color} />
            <MechanismBar label="Transition" value={m.transitionControl} color={color} />
            <MechanismBar label="Pace" value={m.paceManipulation} color={color} />
            <MechanismBar label="Def. Warping" value={m.defensiveWarping} color={color} />
          </div>
        </div>

        {/* Right: gravity assist + signal confidence */}
        <div className="flex flex-col gap-2">
          <div
            className="border p-2.5"
            style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}
            role="group"
            aria-label={`Gravity assist: ${profile.gravityAssist.toFixed(2)}. ${GLOSSARY["Gravity Assist"]}`}
          >
            <div
              className="text-[9px] font-black uppercase tracking-[0.12em] font-mono"
              style={{ color: "var(--ledger-ink-faint)" }}
            >
              Gravity Assist
            </div>
            <div
              className="text-[20px] font-black font-mono leading-tight mt-0.5"
              style={{ color: profile.gravityAssist > 0.5 ? color : "var(--ledger-ink-faint)", fontVariantNumeric: "tabular-nums" }}
            >
              {profile.gravityAssist.toFixed(2)}
            </div>
            <div
              className="text-[9px] font-mono mt-1 leading-snug"
              style={{ color: "var(--ledger-ink-faint)" }}
            >
              {GLOSSARY["Gravity Assist"]}
            </div>
          </div>

          <div
            className="border p-2.5"
            style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}
            role="group"
            aria-label={`Signal confidence: ${stabPct}%. ${GLOSSARY["Signal Confidence"]}`}
          >
            <div
              className="text-[9px] font-black uppercase tracking-[0.12em] font-mono"
              style={{ color: "var(--ledger-ink-faint)" }}
            >
              Signal Confidence
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <div
                className="text-[20px] font-black font-mono leading-tight"
                style={{ color: stabColor, fontVariantNumeric: "tabular-nums" }}
              >
                {stabPct}
              </div>
              <div className="text-[11px] font-black font-mono" style={{ color: stabColor }}>%</div>
            </div>
            <div
              className="text-[9px] font-mono mt-1 leading-snug"
              style={{ color: "var(--ledger-ink-faint)" }}
            >
              {GLOSSARY["Signal Confidence"]}
            </div>
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
        {" "}— {profile.force >= 0.35
          ? "a dominant gravitational presence that warps the game"
          : profile.force >= 0.15
          ? "a meaningful pull that lifts his linemates"
          : profile.force >= 0.05
          ? "a modest but measurable gravitational field"
          : profile.force >= -0.05
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

      {/* Top: diagram left, core components right */}
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

      {/* Bottom: analytical depth */}
      <AnalyticalDepth profile={profile} />
    </div>
  );
}

export { CompactGravity };
