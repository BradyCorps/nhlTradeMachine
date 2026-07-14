"use client";
// ── GravityField — orbital field diagram for player gravitational pull ──
// A physics-inspired visualization: concentric field rings around a central
// mass node, with three component markers on orbital paths. The density and
// brightness of the field lines communicate force magnitude at a glance.
//
// Two modes:
//   full:    SVG diagram + component breakdown + tier description
//   compact: inline force readout + tier badge (for card headers, lists)

import React from "react";
import type { GravityProfile, GravityTier } from "@/app/lib/gravity";
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
  DWARF:         "○",
  ASTEROID:      "·",
  BLACK_HOLE:    "◎",
};

const TIER_LABEL: Record<GravityTier, string> = {
  SUPERMASSIVE:  "Supermassive",
  STAR:          "Star",
  MAIN_SEQUENCE: "Main Sequence",
  DWARF:         "Dwarf",
  ASTEROID:      "Asteroid",
  BLACK_HOLE:    "Black Hole",
};

function CompactGravity({ profile }: { profile: GravityProfile }) {
  const color = gravityTierColor(profile.tier);
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px]">
      <span className="font-black" style={{ color, fontVariantNumeric: "tabular-nums" }}>
        {profile.force > 0 ? "+" : ""}{profile.force.toFixed(2)}
      </span>
      <span
        className="text-[8px] font-black uppercase tracking-[0.1em] px-1 py-px border"
        style={{ color, borderColor: color }}
      >
        {TIER_LABEL[profile.tier]}
      </span>
    </span>
  );
}

function FieldDiagram({ profile }: { profile: GravityProfile }) {
  const W = 300;
  const H = 220;
  const cx = W / 2;
  const cy = 105;
  const absForce = Math.abs(profile.force);
  const isNeg = profile.force < 0;
  const color = gravityTierColor(profile.tier);

  // How many field rings to draw (more rings = stronger field)
  const ringCount = Math.max(2, Math.min(9, Math.round(absForce * 12) + 2));
  const maxR = 95;
  const minR = 18;
  const coreR = 15;

  // Ring radii: inverse-square-ish spacing (denser near center)
  const rings: { r: number; opacity: number }[] = [];
  for (let i = 0; i < ringCount; i++) {
    const t = (i + 1) / ringCount;
    const r = minR + (maxR - minR) * Math.pow(t, 0.7);
    const opBase = 0.08 + (1 - t) * 0.22;
    const opScale = Math.min(1, absForce * 1.8);
    rings.push({ r, opacity: opBase * opScale });
  }

  // Radial grid lines (subtle scientific instrument feel)
  const gridLines = 12;
  const gridAngleStep = (2 * Math.PI) / gridLines;

  // Component markers on orbital paths
  const components = [
    { label: "NOIV", value: profile.noivLift, angle: -Math.PI / 2, orbit: 0.55 },
    { label: "Zone Pull", value: profile.zonePull, angle: Math.PI / 6, orbit: 0.75 },
    { label: "Creation", value: profile.creationAmplifier, angle: (5 * Math.PI) / 6, orbit: 0.65 },
  ];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ maxWidth: 340 }}
      role="img"
      aria-label={`Gravity field diagram: force ${profile.force > 0 ? "+" : ""}${profile.force.toFixed(2)}, tier ${TIER_LABEL[profile.tier]}`}
    >
      {/* Radial grid lines */}
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
            opacity={0.3}
          />
        );
      })}

      {/* Field rings — concentric equipotential lines */}
      {rings.map(({ r, opacity }, i) => (
        <circle
          key={`ring-${i}`}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={isNeg ? "var(--ledger-red)" : color}
          strokeWidth={i === 0 ? 1.5 : 1}
          opacity={opacity}
          strokeDasharray={isNeg ? "4 3" : "none"}
        />
      ))}

      {/* Outer boundary */}
      <circle
        cx={cx} cy={cy} r={maxR + 6}
        fill="none"
        stroke="var(--ledger-rule)"
        strokeWidth={0.5}
        opacity={0.4}
      />

      {/* Component orbital paths */}
      {components.map(({ label, orbit }, i) => {
        const orbitR = minR + (maxR - minR) * orbit;
        return (
          <circle
            key={`orbit-${i}`}
            cx={cx} cy={cy} r={orbitR}
            fill="none"
            stroke="var(--ledger-ink-faint)"
            strokeWidth={0.5}
            strokeDasharray="2 4"
            opacity={0.25}
          />
        );
      })}

      {/* Component markers */}
      {components.map(({ label, value, angle, orbit }, i) => {
        const orbitR = minR + (maxR - minR) * orbit;
        const mx = cx + Math.cos(angle) * orbitR;
        const my = cy + Math.sin(angle) * orbitR;
        const lx = cx + Math.cos(angle) * (orbitR + 16);
        const ly = cy + Math.sin(angle) * (orbitR + 16);
        const isCreation = label === "Creation";
        const displayVal = isCreation ? `×${value.toFixed(2)}` : `${value > 0 ? "+" : ""}${value.toFixed(2)}`;

        return (
          <g key={`comp-${i}`}>
            {/* Connection line */}
            <line
              x1={mx} y1={my} x2={lx} y2={ly}
              stroke="var(--ledger-ink-faint)"
              strokeWidth={0.5}
              opacity={0.5}
            />
            {/* Marker dot */}
            <circle
              cx={mx} cy={my} r={3.5}
              fill={color}
              stroke="var(--paper-bg)"
              strokeWidth={1.5}
              opacity={0.9}
            />
            {/* Label */}
            <text
              x={lx}
              y={ly - 5}
              textAnchor="middle"
              fill="var(--ledger-ink-faint)"
              fontFamily="'Courier Prime', monospace"
              fontWeight={900}
              fontSize={7}
              letterSpacing="0.08em"
            >
              {label.toUpperCase()}
            </text>
            <text
              x={lx}
              y={ly + 6}
              textAnchor="middle"
              fill={color}
              fontFamily="'Courier Prime', monospace"
              fontWeight={900}
              fontSize={9}
            >
              {displayVal}
            </text>
          </g>
        );
      })}

      {/* Central mass node */}
      <circle
        cx={cx} cy={cy} r={coreR + 2}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        opacity={0.5}
      />
      <circle
        cx={cx} cy={cy} r={coreR}
        fill="var(--paper-bg)"
        stroke={color}
        strokeWidth={2}
      />

      {/* Force readout */}
      <text
        x={cx} y={cy - 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontFamily="'Courier Prime', monospace"
        fontWeight={900}
        fontSize={14}
      >
        {profile.force > 0 ? "+" : ""}{profile.force.toFixed(2)}
      </text>

      {/* Mass indicator */}
      <text
        x={cx} y={cy + 11}
        textAnchor="middle"
        fill="var(--ledger-ink-faint)"
        fontFamily="'Courier Prime', monospace"
        fontWeight={900}
        fontSize={5.5}
        letterSpacing="0.1em"
      >
        m={profile.playerMass.toFixed(2)}
      </text>

      {/* Title line */}
      <text
        x={cx} y={H - 8}
        textAnchor="middle"
        fill="var(--ledger-ink-faint)"
        fontFamily="'Courier Prime', monospace"
        fontWeight={900}
        fontSize={7}
        letterSpacing="0.15em"
      >
        GRAVITATIONAL FIELD ANALYSIS
      </text>

      {/* Tier arc label */}
      <text
        x={cx} y={18}
        textAnchor="middle"
        fill={color}
        fontFamily="'Courier Prime', monospace"
        fontWeight={900}
        fontSize={9}
        letterSpacing="0.12em"
      >
        {TIER_ICON[profile.tier]} {TIER_LABEL[profile.tier].toUpperCase()}
      </text>
    </svg>
  );
}

function ComponentBreakdown({ profile }: { profile: GravityProfile }) {
  const color = gravityTierColor(profile.tier);
  const items = [
    {
      label: "NOIV Lift",
      value: `${profile.noivLift > 0 ? "+" : ""}${profile.noivLift.toFixed(2)}`,
      sub: "Linemate differential",
      desc: "How much better linemates play with this player on the ice",
    },
    {
      label: "Zone Pull",
      value: `${profile.zonePull > 0 ? "+" : ""}${profile.zonePull.toFixed(2)}`,
      sub: "OZ attraction",
      desc: "How much the player drags play into the offensive zone",
    },
    {
      label: "Creation",
      value: `×${profile.creationAmplifier.toFixed(2)}`,
      sub: "Lift vs self-production",
      desc: "Gravity (creating for others) vs mere individual talent",
    },
    {
      label: "Mass",
      value: profile.playerMass.toFixed(2),
      sub: "Star power",
      desc: "Production + ice time — the raw talent that generates the field",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(({ label, value, sub, desc }) => (
        <div key={label} title={desc}>
          <div
            className="text-[8px] font-black uppercase tracking-[0.12em] font-mono"
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
          <div
            className="text-[8px] font-mono leading-tight mt-0.5"
            style={{ color: "var(--ledger-ink-faint)" }}
          >
            {sub}
          </div>
        </div>
      ))}
    </div>
  );
}

function ForceEquation({ profile }: { profile: GravityProfile }) {
  return (
    <div
      className="text-[9px] font-mono text-center py-1.5 px-3 border mt-2"
      style={{
        color: "var(--ledger-ink-faint)",
        borderColor: "var(--ledger-rule)",
        background: "var(--paper-inset)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span style={{ color: "var(--ledger-ink)" }}>F</span> ={" "}
      <span>NOIV({profile.noivLift > 0 ? "+" : ""}{profile.noivLift.toFixed(2)})</span>{" "}
      × (1 + <span>ZonePull({profile.zonePull > 0 ? "+" : ""}{profile.zonePull.toFixed(2)})</span>){" "}
      × <span>Creation(×{profile.creationAmplifier.toFixed(2)})</span>{" "}
      × <span>Mass({profile.playerMass.toFixed(2)})</span>{" "}
      = <span className="font-black" style={{ color: gravityTierColor(profile.tier) }}>
        {profile.force > 0 ? "+" : ""}{profile.force.toFixed(2)}
      </span>
    </div>
  );
}

export default function GravityField({ profile, playerName, mode = "full" }: Props) {
  if (mode === "compact") {
    return <CompactGravity profile={profile} />;
  }

  const color = gravityTierColor(profile.tier);

  return (
    <div className="font-mono" style={{ maxWidth: 420 }}>
      {/* Player name + tier header */}
      <div className="flex items-center justify-between mb-1">
        <span
          className="text-[9px] font-black uppercase tracking-[0.15em]"
          style={{ color: "var(--ledger-ink-faint)" }}
        >
          Gravity Field
        </span>
        <span
          className="text-[9px] font-black uppercase tracking-[0.1em]"
          style={{ color: "var(--ledger-ink-faint)" }}
        >
          {playerName}
        </span>
      </div>

      {/* SVG orbital diagram */}
      <div
        className="border p-2"
        style={{
          borderColor: "var(--ledger-rule)",
          background: "var(--paper-inset)",
        }}
      >
        <FieldDiagram profile={profile} />
      </div>

      {/* Formula */}
      <ForceEquation profile={profile} />

      {/* Component breakdown */}
      <div className="mt-3">
        <ComponentBreakdown profile={profile} />
      </div>

      {/* Description */}
      <div
        className="text-[9px] font-mono mt-2 leading-relaxed"
        style={{ color: "var(--ledger-ink-faint)" }}
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

export { CompactGravity };
