"use client";
import React, { useState, useRef, useCallback } from "react";
import { NAV_STAGE_DESC, NAV_STAGE_SHORT } from "@/app/lib/nav-breakdown";

const GLOSSARY: Record<string, string> = {
  "X-NAV": "Extended Net Asset Value — the Ledger's trade-value model: offense, defense, age, contract surplus, deployment, and role context. Gravity is separately gated and off in the public-launch baseline.",
  "G-NAV": "Goalie Net Asset Value — goals saved above expected, workload, save profile, team defense, age, and contract surplus.",
  "NAV": "Net Asset Value — X-NAV for skaters and G-NAV for goalies.",
  "OPS": "Offensive Point Shares — a player's offensive contribution measured in standings points.",
  "DPS": "Defensive Point Shares — a player's defensive contribution measured in standings points.",
  "SCR": "Scoring pace — points per 82 games, normalized by position.",
  "xG": "Expected goals — goal creation from shot quality and volume, not just shot count.",
  "NOIV": "Net On-Ice Value — expected goal differential vs teammates when on ice.",
  "TOI+": "Ice-time trust and role load — heavy minutes imply broader usage and higher coaching trust.",
  "SUPP": "xGA suppression relative to teammates — positive means fewer chances allowed with this player on ice.",
  "Usage": "QoC deployment difficulty (0-100) — matchup and usage context at even strength.",
  "OZ Starts": "Offensive-zone START share — how often his shifts begin in the offensive zone (deployment), distinct from OZ Time, the share of ice time spent there.",
  "DZ%": "Defensive-zone start share — high indicates trusted defensive deployment.",
  "STRAND": "Stylistic Trait & Rating Analysis for NHL Development — a player/team identity view.",
  "EWA": "Estimated Wins Added — translates asset value into standings impact.",
  "CWI": "Contention Window Index — whether a trade extends, compresses, or harms a competitive window.",
  "FMV": "Market price — what a player with this profile typically signs for, from a model fitted on 1,996 contracts. It predicts the market rather than judging it, so a gap inside its margin is not evidence of anything.",
  "CAP": "Contract surplus component — how the cap hit compares to the model's market price. Positive means he costs less than his profile usually signs for.",
  "YNG": "Youth/upside component for young NHL players with real signal. Not a blanket ELC bonus.",
  "DEF": "Defensive NAV component — composite of defensive contributions.",
  "GRAV": "Separately gated Gravity v3 transition handoff — only the bounded neutral-zone transition proxy. It is off in the public-launch baseline.",
  "OFF": "Offensive NAV component — production and creation priced against position.",
  "GSAX": "Goals Saved Above Expected — how many goals a goalie prevents vs league-average.",
  "SV%": "Save percentage — shots saved divided by total shots faced.",
  "HDSV": "High-Danger Save % — save rate on high-danger scoring chances.",
  "QoC": "Quality of Competition — measures the difficulty of a player's even-strength matchups.",
  "GM Audit": "Checks clauses, cap legality, retention, roster slots, surplus gaps, and timeline fit.",
};

// The X-NAV waterfall's own vocabulary, folded in rather than restated here —
// a second copy of "what DEV means" is how two surfaces end up disagreeing.
// Entries above win, so the existing wording for OFF/DEF/CAP is untouched.
const STAGE_GLOSSARY: Record<string, string> = Object.fromEntries(
  Object.entries(NAV_STAGE_SHORT).map(([key, short]) => [short, NAV_STAGE_DESC[key] ?? ""]),
);
const lookup = (term: string): string | undefined => GLOSSARY[term] || STAGE_GLOSSARY[term] || undefined;

interface Props {
  term: string;
  children?: React.ReactNode;
  className?: string;
}

export default function MetricTip({ term, children, className }: Props) {
  const [show, setShow] = useState(false);
  // Edge-aware alignment: a centered tooltip near a card border overflows
  // the viewport. Measure the trigger on open and pin left/right instead.
  const [align, setAlign] = useState<"center" | "left" | "right">("center");
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enter = useCallback(() => {
    clearTimeout(timeout.current);
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) {
      const half = 150; // ~half of max tooltip width
      const vw = window.innerWidth;
      const center = rect.left + rect.width / 2;
      setAlign(center - half < 8 ? "left" : center + half > vw - 8 ? "right" : "center");
    }
    setShow(true);
  }, []);
  const leave = useCallback(() => {
    timeout.current = setTimeout(() => setShow(false), 150);
  }, []);

  const tip = lookup(term);
  if (!tip) return <span className={className}>{children ?? term}</span>;

  // Keyboard + screen-reader accessible: the trigger is focusable, opens on
  // focus, closes on blur or Escape, and carries the definition in aria-label
  // so assistive tech reads the full meaning without needing the visual popup.
  return (
    <span
      ref={anchorRef}
      className={`relative cursor-help ${className ?? ""}`}
      tabIndex={0}
      role="button"
      aria-label={`${term}: ${tip}`}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
      onTouchStart={enter}
      onKeyDown={e => { if (e.key === "Escape") setShow(false); }}
      style={{ borderBottom: "1px dotted var(--ledger-rule)", display: "inline", outlineOffset: "2px" }}
    >
      {children ?? term}
      {show && (
        <span
          role="tooltip"
          className="absolute z-50 font-mono text-[11px] leading-snug"
          style={{
            bottom: "calc(100% + 6px)",
            ...(align === "center"
              ? { left: "50%", transform: "translateX(-50%)" }
              : align === "left"
                ? { left: 0 }
                : { right: 0 }),
            width: "max(200px, min(280px, 60vw))",
            padding: "6px 8px",
            background: "var(--ledger-ink, #2c2416)",
            color: "var(--ledger-cream, #f5efe0)",
            border: "1px solid var(--ledger-brown, #8b7355)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            pointerEvents: "none",
          }}
        >
          <strong style={{ letterSpacing: "0.08em" }}>{term}</strong>
          <br />
          {tip}
        </span>
      )}
    </span>
  );
}

export { GLOSSARY };
