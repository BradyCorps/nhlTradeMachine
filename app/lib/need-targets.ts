import { FA_POOL_TEAM_ID } from "@/app/lib/fa-pool";
import { teamWindow } from "@/app/lib/team-window";
export interface Player {
  id:        string;
  name:      string;
  position:  string;
  teamId?:   string;
  age?:      number;
  capHit?:   number;
  ptsPace?:  number;
  games?:    number;
  xGPace?:   number;
  xgRelTM?:  number | null;
  avgTOI?:   number;
  dps?:      number | null;
  ops?:      number | null;
  xgaRelTM?: number | null;
  qocIndex?: number | null;
  dzPct?:    number | null;
  hasLiveStats?: boolean;
  draftOverall?: number | null;
  prospectPtsPace?: number | null;
  tradeBlockStatus?: "requested" | "available" | "blocked" | "untouchable" | null;
}

export interface Team {
  id:       string;
  name:     string;
  /** Standings tier. Read the window through `teamWindow()`, not this. */
  phase?:   string;
  /** Live roster window, set by Armchair GM. See app/lib/team-window.ts. */
  rosterWindow?: string;
  capSpace: number;
  standing: number;
}

export type AttainLabel = "Available" | "Possible" | "Stretch" | "Off limits";

export interface Attainability {
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

export function attainability(
  player:    Player,
  srcTeam:   Team | undefined,
  capSpace:  number,
): Attainability {
  const block = player.tradeBlockStatus;
  if (block === "untouchable") {
    return { score: 0, label: "Off limits", reason: `${teamWindow(srcTeam) || "—"} — flagged untouchable, not moving` };
  }

  // FA_POOL is the internal holding pen for unsigned players, not a club. A
  // free agent is the MOST attainable target there is — you sign him, nobody has
  // to agree — so reporting "Unknown team / Possible" both mislabels and
  // understates him (OFF6).
  if (player.teamId === FA_POOL_TEAM_ID) {
    return { score: 0.95, label: "Available", reason: "Unsigned free agent — signable now" };
  }
  if (!srcTeam) return { score: 0.40, label: "Possible", reason: "Unknown team" };

  const phase = teamWindow(srcTeam);
  let score = PHASE_BASE[phase] ?? 0.40;

  const age = player.age ?? 28;
  if (["Tanking", "Rebuilding"].includes(phase)) {
    if (age >= 32) score += 0.22;
    else if (age >= 29) score += 0.12;
  }
  if (phase === "Contender" && age <= 24) score -= 0.15;

  const ops = player.ops ?? 0;
  const ptsPace = player.ptsPace ?? 0;
  if (ops > 10 || ptsPace > 92) score -= 0.50;
  else if (ops > 8 || ptsPace > 82) score -= 0.30;
  else if (ops > 5 || ptsPace > 68) score -= 0.12;

  if (block === "requested" || block === "available") score = Math.max(score, 0.88);

  const hit = player.capHit ?? 0;
  if (hit > capSpace * 1.25) score -= 0.30;
  else if (hit > capSpace) score -= 0.15;

  score = Math.max(0, Math.min(1, score));

  const label: AttainLabel =
    score >= 0.65 ? "Available" :
    score >= 0.44 ? "Possible" :
    score >= 0.22 ? "Stretch" :
    "Off limits";

  const reason =
    block === "requested" ? "Formal trade request — team has lost leverage" :
    block === "available" ? "On the trade block — actively shopped" :
    score >= 0.65 ? `${phase} — likely open to offers` :
    score >= 0.44 ? `${phase} — may deal for right return` :
    score >= 0.22 ? `${phase} — would need an elite package` :
    `${phase} — not moving this player`;

  return { score, label, reason };
}

const TRAIT_METRIC: Record<string, (p: Player) => number> = {
  OPS:   p => Math.max(0, p.ops ?? p.ptsPace ?? 0),
  xG:    p => p.xGPace ?? 0,
  NOIV:  p => p.xgRelTM ?? 0,
  TOI:   p => p.avgTOI ?? 0,
  DPS:   p => Math.max(0, p.dps ?? 0),
  SUPP:  p => -(p.xgaRelTM ?? 0),
  Usage: p => p.qocIndex ?? 0,
  OZ:    p => -(p.dzPct ?? 0.5),
};

const TRADE_BLOCK_RANK_BONUS: Record<string, number> = {
  requested: 0.14,
  available: 0.11,
  blocked:  -0.08,
};

function hasReliableNhlSample(p: Player): boolean {
  if (p.hasLiveStats === false) return false;
  if (p.draftOverall != null && (p.games ?? 0) < 14) return false;
  return true;
}

export interface TargetCandidate {
  p:        Player;
  srcTeam:  Team | undefined;
  att:      Attainability;
  metric:   number;
  combined: number;
}

export function rankNeedTargets({
  players,
  teams,
  excludeIds,
  gapLabel,
  homeCapSpace = 8,
  limit = 3,
}: {
  players:       Player[];
  teams:         Team[];
  excludeIds:    Set<string>;
  gapLabel:      string;
  homeCapSpace?: number;
  limit?:        number;
}): TargetCandidate[] {
  const metricFn = TRAIT_METRIC[gapLabel];
  if (!metricFn) return [];

  const teamMap = new Map(teams.map(t => [t.id, t]));
  const pool = players
    .filter(p =>
      !excludeIds.has(p.id) &&
      p.position !== "G" &&
      p.position !== "Pick" &&
      hasReliableNhlSample(p) &&
      (p.ptsPace ?? 0) > 0 &&
      metricFn(p) > 0
    )
    .map(p => {
      const srcTeam = teamMap.get(p.teamId ?? "");
      const att = attainability(p, srcTeam, homeCapSpace);
      return { p, srcTeam, att, metric: metricFn(p), combined: 0 };
    })
    .filter(x => x.att.label !== "Off limits");

  const bestMetric = Math.max(...pool.map(x => x.metric), 0);
  if (bestMetric <= 0) return [];

  return pool
    .map(x => {
      const impactScore = x.metric / bestMetric;
      const blockBonus = TRADE_BLOCK_RANK_BONUS[x.p.tradeBlockStatus ?? ""] ?? 0;

      return {
        ...x,
        combined: impactScore * 0.62 + x.att.score * 0.28 + blockBonus,
      };
    })
    .sort((a, b) => b.combined - a.combined)
    .slice(0, limit);
}
