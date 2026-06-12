"use client";
// ── WhatWeNeed — roster gap analysis with attainability-weighted player targets ──
// Each trait gap shows realistic acquisition targets, not just the global leaders.
// Attainability = f(source team phase, age/phase mismatch, player elite status, cap fit)
// so "Usage" shows a Retooling team's veteran D-man, not Quinn Hughes.

import React from "react";
import { rankNeedTargets, type AttainLabel, type Player, type Team } from "@/app/lib/need-targets";

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
        const pct = Math.round(Math.abs(gap.gap) * 100);

        const candidates = rankNeedTargets({
          players: db.players,
          teams: db.teams,
          excludeIds,
          gapLabel: gap.label,
          homeCapSpace,
        });

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
