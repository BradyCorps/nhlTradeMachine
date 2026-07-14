"use client";
// ── GravityField v2.1 — AA-accessible orbital field + analytical depth ──

import React from "react";
import type { GravityProfile, GravityTier, GravityMechanism } from "@/app/lib/gravity";
import { gravityTierColor } from "@/app/lib/gravity";

interface Props {
  profile: GravityProfile;
  playerName: string;
  mode?: "full" | "compact";
}

const TIER_ICON: Record<GravityTier, string> = {
  SUPERMASSIVE:  "◉",
  STAR:          "●",
  MAIN_SEQUENCE: "◉",
  SATELLITE:     "○",
  ASTEROID:      "·",
  BLACK_HOLE:    "◎",
};

const TIER_LABEL: Record<GravityTier, string> = {
  SUPERMASSIVE:  "Supermassive",
  STAR:          "Star",
  MAIN_SEQUENCE: "Main Sequence",
  SATELLITE:     "Satellite",
  ASTEROID:      "Asteroid",
  BLACK_HOLE:    "Black Hole",
};

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
        className="text-[9px] font-black uppercase tracking-[0.1em] px-1 py-px border"
        style={{ color, borderColor: color }}
      >
        {TIER_LABEL[profile.tier]}
      </span>
    </span>
  );
}

const clampViz = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function valueToOrbit(value: number, min: number, max: number): number {
  const t = (value - min) / (max - min);
  return 0.30 + clampViz(t, 0, 1) * 0.55;
}

// ── SVG orbital field diagram ──────────────────────────────────────────────

function FieldDiagram({ profile }: { profile: GravityProfile }) {
  const W = 320;
  const H = 310;
  const cx = W / 2;
  const cy = 155;
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
      angle: Math.PI * 0.65,
      orbit: valueToOrbit(profile.creationAmplifier, 0.5, 2.0),
      display: `×${profile.creationAmplifier.toFixed(2)}`,
    },
  ];

  // Secondary markers
  const secondaryDots = [
    {
      label: "Partner", value: profile.partnerIndependence,
      angle: Math.PI * 0.15,
      orbit: valueToOrbit(profile.partnerIndependence, 0.5, 1.4),
      display: `×${profile.partnerIndependence.toFixed(2)}`,
    },
    {
      label: "Grav Ast", value: profile.gravityAssist,
      angle: -Math.PI * 0.50,
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

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ maxWidth: 360 }}
      role="img"
      aria-label={`Gravity field: force ${profile.force > 0 ? "+" : ""}${profile.force.toFixed(2)}, tier ${TIER_LABEL[profile.tier]}. NOIV lift ${profile.noivLift > 0 ? "+" : ""}${profile.noivLift.toFixed(2)}, zone pull ${profile.zonePull > 0 ? "+" : ""}${profile.zonePull.toFixed(2)}, creation amplifier ×${profile.creationAmplifier.toFixed(2)}, player mass ${profile.playerMass.toFixed(2)}, partner independence ×${profile.partnerIndependence.toFixed(2)}, gravity assist ${profile.gravityAssist.toFixed(2)}, signal confidence ${(profile.predictiveStability * 100).toFixed(0)}%.`}
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

      {/* Tier label */}
      <text
        x={cx} y={22}
        textAnchor="middle"
        fill={color}
        fontFamily="'Courier Prime', monospace"
        fontWeight={900}
        fontSize={11}
        letterSpacing="0.15em"
      >
        {TIER_ICON[profile.tier]} {TIER_LABEL[profile.tier].toUpperCase()}
      </text>

      {/* Mass — below core */}
      <text
        x={cx} y={cy + coreR + 18}
        textAnchor="middle"
        fill="var(--ledger-ink-faint)"
        fontFamily="'Courier Prime', monospace"
        fontWeight={900}
        fontSize={9}
        letterSpacing="0.05em"
      >
        m = {profile.playerMass.toFixed(2)}
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

// ── Component breakdown panel ─────────────────────────────────────────────

function ComponentPanel({ profile }: { profile: GravityProfile }) {
  const color = gravityTierColor(profile.tier);
  const items = [
    {
      label: "NOIV Lift",
      value: `${profile.noivLift > 0 ? "+" : ""}${profile.noivLift.toFixed(2)}`,
      sub: "Context-adjusted linemate differential",
    },
    {
      label: "Zone Pull",
      value: `${profile.zonePull > 0 ? "+" : ""}${profile.zonePull.toFixed(2)}`,
      sub: "OZ attraction",
    },
    {
      label: "Creation",
      value: `×${profile.creationAmplifier.toFixed(2)}`,
      sub: "Lift vs self-production",
    },
    {
      label: "Mass",
      value: profile.playerMass.toFixed(2),
      sub: "Production + ice time",
    },
    {
      label: "Partner Indep.",
      value: `×${profile.partnerIndependence.toFixed(2)}`,
      sub: "Linemate-isolated signal",
    },
  ];

  return (
    <div className="flex flex-col gap-1.5" role="list" aria-label="Gravity components">
      {items.map(({ label, value, sub }) => (
        <div key={label}
          className="px-2.5 py-2 border"
          style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-bg)" }}
          role="listitem"
          aria-label={`${label}: ${value}`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <div
              className="text-[10px] font-black uppercase tracking-[0.12em] font-mono"
              style={{ color: "var(--ledger-ink-faint)" }}
            >
              {label}
            </div>
            <div
              className="text-[15px] font-black font-mono leading-tight"
              style={{ color, fontVariantNumeric: "tabular-nums" }}
            >
              {value}
            </div>
          </div>
          <div
            className="text-[10px] font-mono leading-tight mt-0.5"
            style={{ color: "var(--ledger-ink-faint)" }}
          >
            {sub}
          </div>
        </div>
      ))}

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

function MechanismBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(clampViz(value, 0, 1) * 100);
  return (
    <div
      className="flex items-center gap-2"
      role="meter"
      aria-label={`${label}: ${value.toFixed(2)} out of 1.00`}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="text-[10px] font-black uppercase tracking-[0.10em] font-mono shrink-0"
        style={{ color: "var(--ledger-ink-faint)", width: 100 }}
      >
        {label}
      </div>
      <div
        className="flex-1 h-[7px]"
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
          <div
            className="text-[9px] font-black uppercase tracking-[0.12em] font-mono mb-2"
            style={{ color: "var(--ledger-ink-faint)" }}
          >
            Mechanism Decomposition
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
            aria-label={`Gravity assist: ${profile.gravityAssist.toFixed(2)}`}
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
              className="text-[9px] font-mono mt-0.5"
              style={{ color: "var(--ledger-ink-faint)" }}
            >
              Invisible creation
            </div>
          </div>

          <div
            className="border p-2.5"
            style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}
            role="group"
            aria-label={`Signal confidence: ${stabPct}%`}
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
              className="text-[9px] font-mono mt-0.5"
              style={{ color: "var(--ledger-ink-faint)" }}
            >
              Year-over-year stability
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
