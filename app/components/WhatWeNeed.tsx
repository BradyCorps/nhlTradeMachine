"use client";
// ── WhatWeNeed — roster gap analysis with real player suggestions ─────────────
// Shows which of the 4+4 STRAND traits the team falls short on vs the
// championship template, then surfaces real players from the DB who could fill
// each gap.

import React from "react";

interface Player {
  id: string;
  name: string;
  position: string;
  currentTeam?: string;
  ptsPace?:   number;
  xGPace?:    number;
  xgRelTM?:   number | null;
  avgTOI?:    number;
  dps?:       number | null;
  ops?:       number | null;
  xgaRelTM?:  number | null;
  qocRank?:   number;
  dzPct?:     number | null;
}

interface Gap {
  label: string;   // trait key — OPS / xG / NOIV / TOI / DPS / SUPP / Usage / OZ
  full:  string;   // display name
  need:  string;   // description
  gap:   number;   // negative = below template
}

interface Props {
  gaps:         Gap[];
  db:           { players: Player[] };
  excludeIds:   Set<string>;   // players already on home or partner team
}

// Trait → sort metric (ascending or descending)
const TRAIT_SORT: Record<string, {
  fn: (p: Player) => number;
  desc: boolean;
  posFilter?: (p: Player) => boolean;
}> = {
  OPS:   { fn: p => p.ops    ?? p.ptsPace  ?? 0, desc: true  },
  xG:    { fn: p => p.xGPace ?? 0,               desc: true  },
  NOIV:  { fn: p => p.xgRelTM ?? 0,              desc: true  },
  TOI:   { fn: p => p.avgTOI  ?? 0,              desc: true  },
  DPS:   { fn: p => p.dps     ?? 0,              desc: true,  posFilter: p => p.position === "D" || ["C","W"].includes(p.position) },
  SUPP:  { fn: p => -(p.xgaRelTM ?? 0),          desc: true  },
  Usage: { fn: p => -(p.qocRank ?? 999),         desc: true  },  // lower rank = tougher opponents
  OZ:    { fn: p => -(p.dzPct ?? 0.5),           desc: true  },  // lower dzPct = more OZ starts
};

const GAP_THRESHOLD = -0.10;   // traits more than 10% below template
const MAX_GAPS      = 3;
const PLAYERS_PER   = 2;

function suggestFor(gap: Gap, allPlayers: Player[], excludeIds: Set<string>): Player[] {
  const cfg = TRAIT_SORT[gap.label];
  if (!cfg) return [];
  const pool = allPlayers
    .filter(p =>
      !excludeIds.has(p.id) &&
      p.position !== "G" &&
      (p.ptsPace ?? 0) > 0 &&
      (!cfg.posFilter || cfg.posFilter(p))
    )
    .sort((a, b) => {
      const diff = cfg.fn(b) - cfg.fn(a);
      return cfg.desc ? diff : -diff;
    });
  return pool.slice(0, PLAYERS_PER);
}

export default function WhatWeNeed({ gaps, db, excludeIds }: Props) {
  const topGaps = gaps
    .filter(g => g.gap < GAP_THRESHOLD)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, MAX_GAPS);

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
        const suggestions = suggestFor(gap, db.players, excludeIds);
        const pct = Math.round(Math.abs(gap.gap) * 100);
        return (
          <div key={gap.label} style={{
            background: "var(--ledger-cream)", border: "1px solid #c8b890",
            padding: "8px 12px",
          }}>
            {/* Gap header */}
            <div style={{ display: "flex", justifyContent: "space-between",
                          alignItems: "baseline", marginBottom: 4 }}>
              <span style={{
                fontSize: 9, fontWeight: 900, color: "var(--ledger-ink)",
                fontFamily: "'Courier Prime', monospace", textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}>
                {gap.label}
                <span style={{ color: "var(--ledger-red)", marginLeft: 6, fontSize: 8 }}>
                  -{pct}%
                </span>
              </span>
              <span style={{ fontSize: 7, color: "var(--ledger-ink-faint)",
                             fontFamily: "'Courier Prime', monospace" }}>
                {gap.full}
              </span>
            </div>

            {/* Need description */}
            <div style={{ fontSize: 8, color: "var(--ledger-ink-faint)",
                          fontFamily: "'Courier Prime', monospace", marginBottom: 6 }}>
              {gap.need}
            </div>

            {/* Player suggestions */}
            {suggestions.length > 0 && (
              <div style={{ borderTop: "1px solid #e0d0b0", paddingTop: 5 }}>
                <div style={{ fontSize: 7, fontWeight: 900, color: "var(--ledger-ink-faint)",
                              textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 3,
                              fontFamily: "'Courier Prime', monospace" }}>
                  targets
                </div>
                {suggestions.map(p => (
                  <div key={p.id} style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "baseline", padding: "1px 0",
                    fontFamily: "'Courier Prime', monospace",
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "var(--ledger-ink)" }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: 8, color: "var(--ledger-ink-faint)" }}>
                      {p.position} · {p.currentTeam ?? "UFA"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}