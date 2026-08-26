import { ordinal } from "@/app/lib/ordinal";

export type TeamSortKey =
  | "division"
  | "standing"
  | "present"
  | "future"
  | "rosterNAV"
  | "capSpace"
  | "goalDiff"
  | "gravity"
  | "speed"
  | "name";

export interface TeamSortFacts {
  standing: number;
  present: number;
  future: number;
  rosterNAV: number;
  capSpace: number;
  goalDiff: number;
  gravityPercentile: number | null;
  speedMph: number | null;
}

const signed = (value: number): string => `${value > 0 ? "+" : ""}${value}`;

export function teamSortSummary(
  key: TeamSortKey,
  facts: TeamSortFacts,
  leagueRank: number,
): string | null {
  const rank = ordinal(leagueRank);

  switch (key) {
    case "division":
      return null;
    case "standing":
      return `Standing ${ordinal(facts.standing)}`;
    case "present":
      return `Present ${facts.present.toFixed(1)} · ${rank}`;
    case "future":
      return `Future ${facts.future.toFixed(1)} · ${rank}`;
    case "rosterNAV":
      return `NAV ${Math.round(facts.rosterNAV).toLocaleString("en-US")} · ${rank}`;
    case "capSpace": {
      const sign = facts.capSpace > 0 ? "+" : facts.capSpace < 0 ? "-" : "";
      return `Cap space ${sign}$${Math.abs(facts.capSpace).toFixed(1)}M · ${rank}`;
    }
    case "goalDiff":
      return `Goal diff ${signed(facts.goalDiff)} · ${rank}`;
    case "gravity":
      return `Gravity ${facts.gravityPercentile == null ? "—" : `${ordinal(Math.round(facts.gravityPercentile))} pct`} · ${rank}`;
    case "speed":
      return `Speed ${facts.speedMph == null ? "—" : `${facts.speedMph.toFixed(1)} mph`} · ${rank}`;
    case "name":
      return `Name A–Z · ${rank}`;
  }
}
