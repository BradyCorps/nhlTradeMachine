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

export const navLabelForPosition = (position: string | null | undefined): "G-NAV" | "X-NAV" =>
  String(position ?? "").trim().toUpperCase() === "G" ? "G-NAV" : "X-NAV";

export const navLongLabelForPosition = (position: string | null | undefined): string =>
  navLabelForPosition(position) === "G-NAV"
    ? "Goalie Net Asset Value"
    : "Extended Net Asset Value";

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
