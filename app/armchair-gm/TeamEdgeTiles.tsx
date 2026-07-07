"use client";

import type { Team } from "@/app/lib/trade-types";
import type { TeamEdgeProfile } from "@/app/lib/team-edge-profile";

const pctText = (value: number | null, digits = 1): string =>
  value == null ? "-" : `${(value * 100).toFixed(digits)}%`;

const numberText = (value: number | null, digits = 1): string =>
  value == null ? "-" : value.toFixed(digits);

const edgeTone = (value: number | null, threshold: number): string => {
  if (value == null) return "var(--ledger-ink)";
  return value > threshold ? "var(--ledger-green)" : "var(--ledger-red)";
};

function EdgeMetricTile({ label, value, sub, tone }: {
  label: string;
  value: string;
  sub: string;
  tone?: string;
}) {
  return (
    <div style={{
      border: "1px solid var(--ledger-rule, #b8a070)",
      background: "var(--paper-inset, #efe8d8)",
      padding: "7px 8px",
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 9,
        fontWeight: 900,
        fontFamily: "var(--font-mono, monospace)",
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "var(--ledger-ink-faint)",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 18,
        lineHeight: 1.1,
        fontWeight: 900,
        fontFamily: "var(--font-mono, monospace)",
        color: tone ?? "var(--ledger-ink)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 9,
        lineHeight: 1.15,
        fontFamily: "var(--font-mono, monospace)",
        color: "var(--ledger-ink-faint)",
      }}>
        {sub}
      </div>
    </div>
  );
}

function TeamEdgeCard({ team, profile }: { team: Team; profile: TeamEdgeProfile | null }) {
  return (
    <div style={{
      border: "1px solid #c8b890",
      background: "var(--ledger-cream)",
      padding: "9px 10px",
      minWidth: 0,
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        marginBottom: 7,
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 900,
          color: "var(--ledger-ink)",
          fontFamily: "var(--font-mono, monospace)",
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {team.name}
        </div>
        <span style={{
          fontSize: 9,
          fontWeight: 900,
          fontFamily: "var(--font-mono, monospace)",
          color: "var(--ledger-ink-faint)",
          whiteSpace: "nowrap",
        }}>
          EDGE {profile?.sampleSize ?? 0}
        </span>
      </div>
      {profile ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 6,
        }}>
          <EdgeMetricTile
            label="OZ Time"
            value={pctText(profile.ozPct)}
            sub={profile.ozPercentile == null ? "percentile -" : `${Math.round(profile.ozPercentile * 100)}th percentile`}
            tone={edgeTone(profile.ozPct, 0.45)}
          />
          <EdgeMetricTile
            label="Top Speed"
            value={`${numberText(profile.avgSpeedMaxMph)} mph`}
            sub={profile.fastestSpeedMph == null ? "fastest -" : `fastest ${profile.fastestSpeedMph.toFixed(1)} mph`}
            tone={edgeTone(profile.avgSpeedMaxMph, 22.2)}
          />
          <EdgeMetricTile
            label="20+ Bursts"
            value={numberText(profile.burstsOver20PerPlayer, 0)}
            sub="per EDGE player"
            tone={edgeTone(profile.burstsOver20PerPlayer, 120)}
          />
          <EdgeMetricTile
            label="HD Finish"
            value={pctText(profile.hdFinishingDelta, 1)}
            sub="vs league"
            tone={edgeTone(profile.hdFinishingDelta, 0)}
          />
        </div>
      ) : (
        <div style={{
          border: "1px dashed var(--ledger-rule, #b8a070)",
          padding: "13px 10px",
          color: "var(--ledger-ink-faint)",
          fontSize: 10,
          fontFamily: "var(--font-mono, monospace)",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          textAlign: "center",
        }}>
          No EDGE sample
        </div>
      )}
    </div>
  );
}

export default function TeamEdgeTiles({
  homeTeam, partnerTeam, homeProfile, partnerProfile, hasActiveTrade,
}: {
  homeTeam: Team | null;
  partnerTeam: Team | null;
  homeProfile: TeamEdgeProfile | null;
  partnerProfile: TeamEdgeProfile | null;
  hasActiveTrade: boolean;
}) {
  if (!homeTeam || !partnerTeam) return null;
  if (!homeProfile && !partnerProfile) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 9,
        fontWeight: 900,
        color: "var(--ledger-ink-faint)",
        textTransform: "uppercase",
        letterSpacing: "0.15em",
        marginBottom: 6,
        fontFamily: "var(--font-mono, monospace)",
      }}>
        Team EDGE Snapshot{hasActiveTrade ? " (post-trade)" : ""}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 10,
      }}>
        <TeamEdgeCard team={homeTeam} profile={homeProfile} />
        <TeamEdgeCard team={partnerTeam} profile={partnerProfile} />
      </div>
    </div>
  );
}
