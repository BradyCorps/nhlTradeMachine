import { leadershipBonus } from "@/app/data/leadership";

export interface LineupRankingPlayer {
  name?: string;
  position: string;
  secondaryPosition?: string | null;
  avgTOI?: number;
  ptsPace?: number;
  games?: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const isC = (p: LineupRankingPlayer) => p.position === "C";
const isD = (p: LineupRankingPlayer) => p.position === "D";

export function lineupContributionScore(pl: LineupRankingPlayer, navTotal?: number): number {
  const production = Math.max(0, pl.ptsPace ?? 0);
  const toi = pl.avgTOI ?? 0;
  const deploymentTrust = Math.max(0, toi - 8) * 9;
  const veteranTrust = Math.min(18, (pl.games ?? 0) / 25);
  const matchupRole =
    isC(pl) && toi >= 14 ? 12 :
    isD(pl) && toi >= 19 ? 10 :
    0;
  const navTiebreaker = navTotal == null ? 0 : clamp(navTotal, -50, 120) * 0.12;
  // Intangibles: a letter on the sweater is the organization's own
  // declaration of on-ice worth beyond the stat line (C ≈ a line's worth
  // of trust, A half that). Never part of trade value — lineup only.
  const leadership = leadershipBonus(pl.name, { c: 28, a: 14 });

  return production + deploymentTrust + veteranTrust + matchupRole + navTiebreaker + leadership;
}
