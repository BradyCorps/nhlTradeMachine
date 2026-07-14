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
  const W = 380;
  const H = 340;
  const cx = W / 2;
  const cy = 170;
  const absForce = Math.abs(profile.force);
  const isNeg = profile.force < 0;
  const color = gravityTierColor(profile.tier);

  const ringCount = Math.max(2, Math.min(7, Math.round(absForce * 8) + 2));
  const maxR = 110;
  const minR = 34;
  const coreR = 30;

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

  // Component data — positioned with generous spacing
  // Angles chosen to avoid overlap: top-left, top-right, bottom
  const components = [
    { label: "NOIV", value: profile.noivLift, angle: -Math.PI * 0.75, orbit: 0.55,
      isCreation: false },
    { label: "Zone Pull", value: profile.zonePull, angle: -Math.PI * 0.25, orbit: 0.7,
      isCreation: false },
    { label: "Creation", value: profile.creationAmplifier, angle: Math.PI * 0.55, orbit: 0.6,
      isCreation: true },
  ];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ maxWidth: 440 }}
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

      {/* Component orbital paths */}
      {components.map(({ orbit }, i) => {
        const orbitR = minR + (maxR - minR) * orbit;
        return (
          <circle
            key={`orbit-${i}`}
            cx={cx} cy={cy} r={orbitR}
            fill="none"
            stroke="var(--ledger-ink-faint)"
            strokeWidth={0.5}
            strokeDasharray="2 5"
            opacity={0.2}
          />
        );
      })}

      {/* Component markers + labels */}
      {components.map(({ label, value, angle, orbit, isCreation }, i) => {
        const orbitR = minR + (maxR - minR) * orbit;
        const mx = cx + Math.cos(angle) * orbitR;
        const my = cy + Math.sin(angle) * orbitR;

        // Label position: pushed well outside the rings
        const labelR = maxR + 30;
        const lx = cx + Math.cos(angle) * labelR;
        const ly = cy + Math.sin(angle) * labelR;

        const displayVal = isCreation
          ? `×${value.toFixed(2)}`
          : `${value > 0 ? "+" : ""}${value.toFixed(2)}`;

        // Anchor: left/right based on which side of center
        const anchor = lx < cx - 10 ? "end" : lx > cx + 10 ? "start" : "middle";

        return (
          <g key={`comp-${i}`}>
            {/* Connection line from marker to label */}
            <line
              x1={mx} y1={my} x2={lx} y2={ly}
              stroke="var(--ledger-ink-faint)"
              strokeWidth={0.7}
              opacity={0.35}
              strokeDasharray="2 2"
            />
            {/* Marker dot */}
            <circle
              cx={mx} cy={my} r={5}
              fill={color}
              stroke="var(--paper-bg)"
              strokeWidth={2}
              opacity={0.9}
            />
            {/* Label text */}
            <text
              x={lx}
              y={ly - 6}
              textAnchor={anchor}
              fill="var(--ledger-ink-faint)"
              fontFamily="'Courier Prime', monospace"
              fontWeight={900}
              fontSize={9}
              letterSpacing="0.1em"
            >
              {label.toUpperCase()}
            </text>
            {/* Value */}
            <text
              x={lx}
              y={ly + 7}
              textAnchor={anchor}
              fill={color}
              fontFamily="'Courier Prime', monospace"
              fontWeight={900}
              fontSize={13}
            >
              {displayVal}
            </text>
          </g>
        );
      })}

      {/* Central mass node — outer glow ring */}
      <circle
        cx={cx} cy={cy} r={coreR + 6}
        fill="none"
        stroke={color}
        strokeWidth={1}
        opacity={0.25}
      />
      <circle
        cx={cx} cy={cy} r={coreR + 3}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        opacity={0.4}
      />
      {/* Central mass node — solid white/paper fill for contrast */}
      <circle
        cx={cx} cy={cy} r={coreR}
        fill="var(--paper-bg)"
        stroke={color}
        strokeWidth={2.5}
      />

      {/* Force readout — the hero number */}
      <text
        x={cx} y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--ledger-rule)"
        fontFamily="'Courier Prime', monospace"
        fontWeight={900}
        fontSize={20}
      >
        {profile.force > 0 ? "+" : ""}{profile.force.toFixed(2)}
      </text>

      {/* Tier label — top of diagram */}
      <text
        x={cx} y={24}
        textAnchor="middle"
        fill={color}
        fontFamily="'Courier Prime', monospace"
        fontWeight={900}
        fontSize={12}
        letterSpacing="0.15em"
      >
        {TIER_ICON[profile.tier]} {TIER_LABEL[profile.tier].toUpperCase()}
      </text>

      {/* Mass readout — below the central node */}
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
        x={cx} y={H - 12}
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
      {items.map(({ label, value, sub, desc }) => (
        <div key={label} title={desc}
          className="p-2 border"
          style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-bg)" }}
        >
          <div
            className="text-[9px] font-black uppercase tracking-[0.12em] font-mono mb-1"
            style={{ color: "var(--ledger-ink-faint)" }}
          >
            {label}
          </div>
          <div
            className="text-[16px] font-black font-mono leading-tight"
            style={{ color, fontVariantNumeric: "tabular-nums" }}
          >
            {value}
          </div>
          <div
            className="text-[9px] font-mono leading-tight mt-1"
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
  const color = gravityTierColor(profile.tier);
  return (
    <div
      className="text-[10px] font-mono text-center py-2 px-4 border mt-3"
      style={{
        color: "var(--ledger-ink-faint)",
        borderColor: "var(--ledger-rule)",
        background: "var(--paper-inset)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span style={{ color: "var(--ledger-ink)", fontWeight: 900 }}>F</span> ={" "}
      <span>NOIV({profile.noivLift > 0 ? "+" : ""}{profile.noivLift.toFixed(2)})</span>{" "}
      × (1 + <span>Zone({profile.zonePull > 0 ? "+" : ""}{profile.zonePull.toFixed(2)})</span>){" "}
      × <span>Creation(×{profile.creationAmplifier.toFixed(2)})</span>{" "}
      × <span>Mass({profile.playerMass.toFixed(2)})</span>{" "}
      ={" "}
      <span className="font-black text-[12px]" style={{ color }}>
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
    <div className="font-mono" style={{ maxWidth: 480 }}>
      {/* Player name + header */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[10px] font-black uppercase tracking-[0.15em]"
          style={{ color: "var(--ledger-ink-faint)" }}
        >
          Gravity Field
        </span>
        <span
          className="text-[10px] font-black uppercase tracking-[0.1em]"
          style={{ color: "var(--ledger-ink-faint)" }}
        >
          {playerName}
        </span>
      </div>

      {/* SVG orbital diagram */}
      <div
        className="border p-3"
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
      <ComponentBreakdown profile={profile} />

      {/* Description */}
      <div
        className="text-[10px] font-mono mt-3 leading-relaxed"
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
