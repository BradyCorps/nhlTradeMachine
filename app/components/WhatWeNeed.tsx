"use client";
// ── WhatWeNeed — roster gap analysis with attainability-weighted player targets ──
// Each trait gap shows realistic acquisition targets, not just the global leaders.
// Attainability = f(source team phase, age/phase mismatch, player elite status, cap fit)
// so "Usage" shows a Retooling team's veteran D-man, not Quinn Hughes.

import React from "react";

interface Player {
  id:        string;
  name:      string;
  position:  string;
  teamId?:   string;
  age?:      number;
  capHit?:   number;
  ptsPace?:  number;
  xGPace?:   number;
  xgRelTM?:  number | null;
  avgTOI?:   number;
  dps?:      number | null;
  ops?:      number | null;
  xgaRelTM?: number | null;
  qocIndex?: number | null;
  dzPct?:    number | null;
}

interface Team {
  id:       string;
  name:     string;
  phase?:   string;
  capSpace: number;
  standing: number;
}

interface Gap {
  label: string;
  full:  string;
  need:  string;
  gap:   number;
}

interface Props {
  gaps:          Gap[];
  db:            { players: Player[]; teams: Team[] };
  excludeIds:    Set<string>;
  homeCapSpace?: number;
}

// ── Attainability ────────────────────────────────────────────────────────────
// Returns 0–1 where 1 = this player is almost certainly available.
//   Phase base:    Tanking/Rebuilding sell; Contenders hold.
//   Age mismatch:  Veteran on rebuilding team is likely being shopped.
//   Elite penalty: Franchise cornerstones (high OPS / ptsPace) almost never move.
//   Cap feasibility: Player costs more than the acquiring team can absorb.

type AttainLabel = "Available" | "Possible" | "Stretch" | "Off limits";

interface Attainability {
  score:  number;
  label:  AttainLabel;
  reason: string;
}

const PHASE_BASE: Record<string, number> = {
  Tanking:    0.85,
  Rebuilding: 0.78,
  Retooling:  0.55,
  Bubble:     0.28,
  Contender:  0.10,
};

function attainability(
  player:    Player,
  srcTeam:   Team | undefined,
  capSpace:  number,
): Attainability {
  if (!srcTeam) return { score: 0.40, label: "Possible", reason: "Unknown team" };

  const phase = srcTeam.phase ?? "";
  let score = PHASE_BASE[phase] ?? 0.40;

  // Age / phase mismatch — veteran on a rebuilding team is getting shopped
  const age = player.age ?? 28;
  if (["Tanking", "Rebuilding"].includes(phase)) {
    if (age >= 32) score += 0.22;
    else if (age >= 29) score += 0.12;
  }
  if (phase === "Contender" && age <= 24) score -= 0.15;

  // Elite penalty — franchise cornerstones rarely available at any price
  const ops      = player.ops      ?? 0;
  const ptsPace  = player.ptsPace  ?? 0;
  if      (ops > 10 || ptsPace > 92) score -= 0.50;  // McDavid / MacKinnon tier
  else if (ops >  8 || ptsPace > 82) score -= 0.30;  // Hughes / Makar tier
  else if (ops >  5 || ptsPace > 68) score -= 0.12;  // solid top-pairing / 2nd-line

  // Cap feasibility — hard to acquire if it busts the cap
  const hit = player.capHit ?? 0;
  if (hit > capSpace * 1.25) score -= 0.30;
  else if (hit > capSpace)   score -= 0.15;

  score = Math.max(0, Math.min(1, score));

  const label: AttainLabel =
    score >= 0.65 ? "Available" :
    score >= 0.44 ? "Possible"  :
    score >= 0.22 ? "Stretch"   :
    "Off limits";

  const reason =
    score >= 0.65 ? `${phase} — likely open to offers`   :
    score >= 0.44 ? `${phase} — may deal for right return` :
    score >= 0.22 ? `${phase} — would need an elite package` :
    `${phase} — not moving this player`;

  return { score, label, reason };
}

// ── Trait → metric function ───────────────────────────────────────────────────
const TRAIT_METRIC: Record<string, (p: Player) => number> = {
  OPS:   p => Math.max(0, p.ops ?? p.ptsPace  ?? 0),  // ops=-2 should not suggest player
  xG:    p => p.xGPace ?? 0,
  NOIV:  p => p.xgRelTM ?? 0,
  TOI:   p => p.avgTOI  ?? 0,
  DPS:   p => Math.max(0, p.dps ?? 0),
  SUPP:  p => -(p.xgaRelTM ?? 0),
  Usage: p => p.qocIndex ?? 0,
  OZ:    p => -(p.dzPct ?? 0.5),
};

const ATTAIN_COLORS: Record<AttainLabel, string> = {
  "Available": "#2a7a44",
  "Possible":  "#8a6500",
  "Stretch":   "#b83020",
  "Off limits":"#888",
};

const ATTAIN_DOTS: Record<AttainLabel, string> = {
  "Available": "●●●",
  "Possible":  "●●○",
  "Stretch":   "●○○",
  "Off limits":"○○○",
};

// ── Main component ────────────────────────────────────────────────────────────
export default function WhatWeNeed({ gaps, db, excludeIds, homeCapSpace = 8 }: Props) {
  const teamMap = React.useMemo(
    () => new Map(db.teams.map(t => [t.id, t])),
    [db.teams],
  );

  const topGaps = gaps
    .filter(g => g.gap < -0.10)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 3);

  if (topGaps.length === 0) return (
    <div style={{
      padding: "8px 12px", background: "var(--ledger-cream)",
      border: "1px solid #c8b890", fontSize: 9,
      fontFamily: "'Courier Prime', monospace",
      color: "var(--ledger-green)", fontWeight: 900,
    }}>
      ✓ No critical roster gaps vs championship template
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {topGaps.map(gap => {
        const metricFn = TRAIT_METRIC[gap.label];
        const pct = Math.round(Math.abs(gap.gap) * 100);

        // Build candidates: filter out excluded, score by combined metric × attainability
        const candidates = db.players
          .filter(p =>
            !excludeIds.has(p.id) &&
            p.position !== "G" &&
            p.position !== "Pick" &&
            (p.ptsPace ?? 0) > 0 &&
            (metricFn ? metricFn(p) : 0) > 0
          )
          .map(p => {
            const srcTeam  = teamMap.get(p.teamId ?? "");
            const att      = attainability(p, srcTeam, homeCapSpace);
            const metric   = metricFn ? metricFn(p) : 0;
            // Combined rank: 55% trait quality, 45% attainability
            // Filter out "off limits" early so users see realistic options
            return { p, srcTeam, att, metric, combined: metric * 0.55 + att.score * 500 * 0.45 };
          })
          .filter(x => x.att.label !== "Off limits")
          .sort((a, b) => b.combined - a.combined)
          .slice(0, 3);

        return (
          <div key={gap.label} style={{
            background: "var(--ledger-cream)", border: "1px solid #c8b890",
            padding: "8px 12px",
          }}>
            {/* Gap header */}
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "baseline", marginBottom: 3,
            }}>
              <span style={{
                fontSize: 9, fontWeight: 900,
                color: "var(--ledger-ink)",
                fontFamily: "'Courier Prime', monospace",
                textTransform: "uppercase", letterSpacing: "0.08em",
              }}>
                {gap.label}
                <span style={{ color: "var(--ledger-red)", marginLeft: 6, fontSize: 8 }}>
                  -{pct}%
                </span>
              </span>
              <span style={{
                fontSize: 7, color: "var(--ledger-ink-faint)",
                fontFamily: "'Courier Prime', monospace",
              }}>
                {gap.full}
              </span>
            </div>

            <div style={{
              fontSize: 8, color: "var(--ledger-ink-faint)",
              fontFamily: "'Courier Prime', monospace", marginBottom: 6,
            }}>
              {gap.need}
            </div>

            {/* Attainability-weighted player targets */}
            {candidates.length > 0 ? (
              <div style={{ borderTop: "1px solid #e0d0b0", paddingTop: 5,
                            display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{
                  fontSize: 7, fontWeight: 900, color: "var(--ledger-ink-faint)",
                  textTransform: "uppercase", letterSpacing: "0.12em",
                  fontFamily: "'Courier Prime', monospace", marginBottom: 1,
                }}>
                  Realistic targets
                </div>
                {candidates.map(({ p, srcTeam, att }) => (
                  <div key={p.id} style={{
                    display: "flex", flexDirection: "column", gap: 1,
                    padding: "3px 5px",
                    background: "var(--ledger-card, #f5f0e8)",
                    border: `1px solid ${ATTAIN_COLORS[att.label]}33`,
                  }}>
                    {/* Player row */}
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      alignItems: "baseline",
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700,
                        color: "var(--ledger-ink)",
                        fontFamily: "'Courier Prime', monospace",
                      }}>
                        {p.name}
                      </span>
                      <span style={{
                        fontSize: 8, color: "var(--ledger-ink-faint)",
                        fontFamily: "'Courier Prime', monospace",
                        flexShrink: 0, marginLeft: 6,
                      }}>
                        {p.position} · {p.teamId ?? "UFA"}
                        {p.age ? ` · ${p.age}y` : ""}
                        {p.capHit ? ` · $${p.capHit.toFixed(1)}M` : ""}
                      </span>
                    </div>
                    {/* Attainability row */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 5,
                    }}>
                      <span style={{
                        fontSize: 7, color: ATTAIN_COLORS[att.label],
                        fontFamily: "'Courier Prime', monospace",
                        letterSpacing: "0.02em",
                      }}>
                        {ATTAIN_DOTS[att.label]}
                      </span>
                      <span style={{
                        fontSize: 7, color: ATTAIN_COLORS[att.label],
                        fontFamily: "'Courier Prime', monospace",
                        fontWeight: att.label === "Available" ? 900 : 400,
                      }}>
                        {att.reason}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                fontSize: 8, color: "var(--ledger-ink-faint)",
                fontFamily: "'Courier Prime', monospace",
                borderTop: "1px solid #e0d0b0", paddingTop: 5,
                fontStyle: "italic",
              }}>
                No realistic targets available within cap constraints
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}