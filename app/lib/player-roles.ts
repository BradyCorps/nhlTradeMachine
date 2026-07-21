// ── player-roles.ts — Modern role derivation ─────────────────────
// PA2: replaces the legacy display roles (Sniper, Two-Way Defenceman,
// OFF D / SHUTDOWN chips) with twelve modern roles derived from data
// the app already holds — EDGE tracking (speed, bursts, zone time),
// MoneyPuck on/off splits, deployment, physical play, and creation mix.
//
// Pure and deterministic. Each role scores 0–1 from the evidence that
// defines it; a role is only awarded when the evidence actually clears
// the bar (missing data lowers the score — a role claim needs proof).
// Valuation internals (classifyForwardArchetype, rosterTier) are NOT
// touched by this module; these are identity labels, not price inputs.

export type PlayerRoleKey =
  | "PUCK_MOVING_ANCHOR"     // D — clean exits/controlled entries, rarely dumps
  | "NEUTRAL_ZONE_ENGINE"    // F — carries through neutral ice for controlled entries
  | "HIGH_DANGER_DISTRIBUTOR"// any — cross-seam / low-to-high passes for grade-A chances
  | "RUSH_WEAPON"            // F — counterattack specialist: speed + finishing on the rush
  | "SLOT_HUNTER"            // F — off-puck movement into soft high-danger ice
  | "NET_FRONT_DISRUPTOR"    // F — screens, tips, low-slot rebounds
  | "VOLUME_SHOOTER"         // F — drives offense by directing pucks at net
  | "FORECHECK_MONSTER"      // F — OZ recoveries / forced turnovers sustain possession
  | "PERIMETER_LOCKDOWN"     // D — forces rushes wide, denies clean entries
  | "COMPLETE_SHUTDOWN"      // C — suppresses opponent xG while on ice
  | "FLOOR_RAISER"           // any — high usage, carries a lineup via minutes + self-created offense
  | "CEILING_RAISER";        // any — adaptable elite complement that elevates a top line

export interface RoleDef {
  key: PlayerRoleKey;
  label: string;
  icon: string;
  color: string;   // CSS var — ledger palette only
  blurb: string;
}

export const ROLE_DEFS: Record<PlayerRoleKey, RoleDef> = {
  PUCK_MOVING_ANCHOR: {
    key: "PUCK_MOVING_ANCHOR", label: "Puck-Moving Anchor", icon: "⇉", color: "var(--ledger-navy, #1a2e5c)",
    blurb: "Defenseman who exits clean and enters controlled — play travels north on his stick, not off the glass.",
  },
  NEUTRAL_ZONE_ENGINE: {
    key: "NEUTRAL_ZONE_ENGINE", label: "Neutral Zone Engine", icon: "≫", color: "var(--ledger-navy, #1a2e5c)",
    blurb: "Forward who carries through center ice for controlled entries — the transition game runs through him.",
  },
  HIGH_DANGER_DISTRIBUTOR: {
    key: "HIGH_DANGER_DISTRIBUTOR", label: "High-Danger Distributor", icon: "✦", color: "var(--ledger-green)",
    blurb: "Seeks the cross-seam and low-to-high pass — sets up high-probability chances instead of settling for perimeter shots.",
  },
  RUSH_WEAPON: {
    key: "RUSH_WEAPON", label: "Rush Weapon", icon: "↯", color: "var(--ledger-red)",
    blurb: "Counterattack specialist — top-end speed and finishing on odd-man rushes.",
  },
  SLOT_HUNTER: {
    key: "SLOT_HUNTER", label: "Slot Hunter", icon: "◎", color: "var(--ledger-red)",
    blurb: "Off-puck mover who finds soft high-danger ice in the slot for quick releases and deflections.",
  },
  NET_FRONT_DISRUPTOR: {
    key: "NET_FRONT_DISRUPTOR", label: "Net-Front Disruptor", icon: "▣", color: "var(--ledger-brown, #6e5a3d)",
    blurb: "Lives at the blue paint — screens, tips, and low-slot rebounds. Goalie sightlines are never clean.",
  },
  VOLUME_SHOOTER: {
    key: "VOLUME_SHOOTER", label: "Volume Shooter", icon: "⁂", color: "var(--ledger-amber, #d4a017)",
    blurb: "Drives offense by putting pucks on net relentlessly — the chances come from quantity plus a quick trigger.",
  },
  FORECHECK_MONSTER: {
    key: "FORECHECK_MONSTER", label: "Forecheck Monster", icon: "⚒", color: "var(--ledger-brown, #6e5a3d)",
    blurb: "Offensive-zone recoveries and forced turnovers — possession is sustained by pressure, not skill plays.",
  },
  PERIMETER_LOCKDOWN: {
    key: "PERIMETER_LOCKDOWN", label: "Perimeter Lockdown", icon: "⛉", color: "var(--ledger-red)",
    blurb: "Defenseman who forces rushes outside and denies clean blue-line entries — the middle of the ice is closed.",
  },
  COMPLETE_SHUTDOWN: {
    key: "COMPLETE_SHUTDOWN", label: "Complete Shutdown", icon: "■", color: "var(--ledger-red)",
    blurb: "Center who suppresses opponent expected goals shift after shift — the matchup assignment coaches trust.",
  },
  FLOOR_RAISER: {
    key: "FLOOR_RAISER", label: "Floor Raiser", icon: "⬒", color: "var(--ledger-green)",
    blurb: "High-usage driver who carries a lineup — transition, minutes, and self-created offense keep a team afloat.",
  },
  CEILING_RAISER: {
    key: "CEILING_RAISER", label: "Ceiling Raiser", icon: "⬆", color: "var(--ledger-green)",
    blurb: "Adaptable elite complement — suppression, forechecking, or off-puck play that makes a great line greater.",
  },
};

export interface RoleResult {
  primary: RoleDef;
  secondary: RoleDef | null;
  /** 0–1 evidence score behind the primary role. */
  confidence: number;
}

// Minimal structural input — Asset and the players-page Player both satisfy it.
export interface RoleInput {
  position: string;
  games?: number | null;
  ptsPace?: number | null;
  goalsPace?: number | null;
  assistsPace?: number | null;
  baselineIxg82?: number | null;
  ppPtsPace82?: number | null;
  pkTimeShare?: number | null;
  xgRelTM?: number | null;
  xgaRelTM?: number | null;
  dps?: number | null;
  baselineHits82?: number | null;
  baselineBlocks82?: number | null;
  edgeOzPct?: number | null;
  dzPct?: number | null;
  edgeSpeedMaxMph?: number | null;
  edgeBurstsOver20?: number | null;
  avgTOI?: number | null;
  qocIndex?: number | null;
  hdFinishingDelta?: number | null;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Linear ramp: 0 at `lo`, 1 at `hi`. */
const ramp = (v: number | null | undefined, lo: number, hi: number) =>
  v == null ? 0 : clamp01((v - lo) / (hi - lo));

export function derivePlayerRoles(p: RoleInput): RoleResult | null {
  if (p.position === "G" || p.position === "Pick") return null;
  const games = p.games ?? 0;
  if (games < 15) return null;

  const isD = p.position === "D";
  const isC = p.position === "C";
  const isF = !isD;

  const goals = p.goalsPace ?? 0;
  const assists = p.assistsPace ?? 0;
  const gaTotal = goals + assists;
  const assistShare = gaTotal > 5 ? assists / gaTotal : null;
  const ixg = (p.baselineIxg82 ?? 0) > 0 ? p.baselineIxg82! : (p.goalsPace ?? null);
  const bursts82 = p.edgeBurstsOver20 != null && games > 0 ? (p.edgeBurstsOver20 / games) * 82 : null;
  const supp = p.xgaRelTM != null ? -p.xgaRelTM : null;
  // Transition displacement: where play LIVES vs where he's DEPLOYED
  const displacement = p.edgeOzPct != null
    ? p.edgeOzPct - (0.43 + 0.25 * (0.5 - (p.dzPct ?? 0.5)))
    : null;

  const scores = new Map<PlayerRoleKey, number>();

  if (isD) {
    scores.set("PUCK_MOVING_ANCHOR",
      0.35 * ramp(displacement, 0, 0.05) +
      0.30 * ramp(assists, 18, 45) +
      0.20 * ramp(p.xgRelTM, 0, 8) +
      0.15 * ramp(bursts82, 15, 55));

    scores.set("PERIMETER_LOCKDOWN",
      0.35 * ramp(supp, 0.05, 0.5) +
      0.25 * ramp(p.baselineBlocks82, 90, 160) +
      0.25 * ramp(p.pkTimeShare, 0.06, 0.2) +
      0.15 * ramp(p.dzPct, 0.5, 0.62));
  }

  if (isC) {
    scores.set("COMPLETE_SHUTDOWN",
      0.40 * ramp(supp, 0.05, 0.5) +
      0.25 * ramp(p.pkTimeShare, 0.05, 0.18) +
      0.20 * ramp(p.qocIndex, 55, 78) +
      0.15 * ramp(p.dps, 1.2, 3));
  }

  if (isF) {
    scores.set("NEUTRAL_ZONE_ENGINE",
      0.35 * ramp(bursts82, 35, 95) +
      0.30 * ramp(p.edgeSpeedMaxMph, 21.4, 23) +
      0.35 * ramp(displacement, 0.01, 0.06));

    scores.set("RUSH_WEAPON",
      0.30 * ramp(p.edgeSpeedMaxMph, 21.8, 23.2) +
      0.25 * ramp(bursts82, 45, 110) +
      0.20 * ramp(goals, 18, 38) +
      0.25 * ramp(p.hdFinishingDelta, 0, 0.06));

    scores.set("SLOT_HUNTER",
      0.35 * ramp(ixg, 10, 22) +
      0.25 * (assistShare != null ? clamp01((0.55 - assistShare) / 0.25) : 0) +
      0.25 * ramp(p.hdFinishingDelta, 0, 0.05) +
      0.15 * ramp(goals, 18, 35));

    scores.set("NET_FRONT_DISRUPTOR",
      0.30 * ramp(ixg, 9, 18) +
      0.30 * ramp(p.baselineHits82, 70, 150) +
      0.20 * (p.edgeSpeedMaxMph != null ? clamp01((21.6 - p.edgeSpeedMaxMph) / 1.2) : 0) +
      0.20 * ramp(p.ppPtsPace82, 5, 16));

    scores.set("VOLUME_SHOOTER",
      0.50 * ramp(ixg, 14, 26) +
      0.30 * (assistShare != null ? clamp01((0.5 - assistShare) / 0.2) : 0) +
      0.20 * ramp(goals, 22, 40));

    scores.set("FORECHECK_MONSTER",
      0.40 * ramp(p.baselineHits82, 100, 190) +
      0.30 * ramp(displacement, 0, 0.045) +
      0.30 * ramp(supp, 0, 0.35));
  }

  // Any-position roles
  scores.set("HIGH_DANGER_DISTRIBUTOR",
    0.35 * (assistShare != null ? ramp(assistShare, 0.55, 0.72) : 0) +
    0.25 * ramp(p.ppPtsPace82, 10, 26) +
    0.25 * ramp(p.xgRelTM, 2, 12) +
    0.15 * ramp(assists, isD ? 25 : 35, isD ? 50 : 60));

  scores.set("FLOOR_RAISER",
    0.35 * ramp(p.avgTOI, isD ? 22 : 18.5, isD ? 25 : 21.5) +
    0.30 * ramp(p.ptsPace, isD ? 40 : 60, isD ? 70 : 100) +
    0.20 * ramp(p.xgRelTM, 0, 10) +
    0.15 * ramp(bursts82, 25, 80));

  scores.set("CEILING_RAISER",
    0.35 * ramp(p.xgRelTM, 4, 14) +
    0.35 * ((supp != null && supp > 0 && assistShare != null && assistShare >= 0.45 && assistShare <= 0.72) ? 1 : 0) +
    0.15 * ramp(p.qocIndex, 55, 75) +
    0.15 * (ixg != null ? clamp01((20 - ixg) / 12) : 0.5));

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [primaryKey, primaryScore] = ranked[0] ?? [null, 0];
  if (!primaryKey || primaryScore < 0.45) return null;

  const secondaryEntry = ranked.find(([k, s]) => k !== primaryKey && s >= 0.45 && s >= primaryScore - 0.18);

  return {
    primary: ROLE_DEFS[primaryKey],
    secondary: secondaryEntry ? ROLE_DEFS[secondaryEntry[0]] : null,
    confidence: Math.round(clamp01(primaryScore) * 100) / 100,
  };
}
