import { SEASON } from "@/app/lib/season-config";

export const PLAYER_TERMINOLOGY = {
  position: "Position",
  contract: "Contract",
  yearsLeft: "Years left",
} as const;

export const PLAYER_STATS_CONTEXT =
  `${SEASON.replaySeason} regular season · all situations unless noted`;

export const playerCountLabel = (count: number): string =>
  `${count} ${count === 1 ? "player" : "players"}`;

export const pickCountLabel = (count: number): string =>
  `${count} ${count === 1 ? "pick" : "picks"}`;

// F-NAV/D-NAV/G-NAV are real, independently-scored position splits (NAV-01
// Phase 3's calcForwardNAV/calcDefenseNAV/calcGoalieNAV, validated by
// NAV-02/NAV-03) — not a relabeling of one shared number. "X-NAV" stays the
// umbrella term for a non-skater, non-goalie asset (a Pick) or an unknown
// position, and for cross-position contexts (a team's combined roster
// total, the product/brand name) that aren't a single player's own value.
export const navLabelForPosition = (position: string | null | undefined): "F-NAV" | "D-NAV" | "G-NAV" | "X-NAV" => {
  const pos = String(position ?? "").trim().toUpperCase();
  if (pos === "G") return "G-NAV";
  if (pos === "D" || pos === "LD" || pos === "RD") return "D-NAV";
  if (pos === "C" || pos === "W" || pos === "L" || pos === "R" || pos === "LW" || pos === "RW" || pos === "F") return "F-NAV";
  return "X-NAV";
};

export const navLongLabelForPosition = (position: string | null | undefined): string => {
  switch (navLabelForPosition(position)) {
    case "G-NAV": return "Goalie Net Asset Value";
    case "D-NAV": return "Defense Net Asset Value";
    case "F-NAV": return "Forward Net Asset Value";
    default:      return "Extended Net Asset Value";
  }
};

export const expiringRightsLabel = (player: {
  expiresThisOffseason?: boolean;
  contractStatus?: "UFA" | "RFA" | "SIGNED";
}): "RFA" | "UFA" | null =>
  player.expiresThisOffseason
    && (player.contractStatus === "RFA" || player.contractStatus === "UFA")
    ? player.contractStatus
    : null;

export const prospectTierLabel = (tier: 1 | 2 | 3 | 4 | null | undefined): string | null => {
  if (tier === 1) return "PROSPECT: FRANCHISE";
  if (tier === 2) return "PROSPECT: TOP";
  if (tier === 3 || tier === 4) return "PROSPECT";
  return null;
};
