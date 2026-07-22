// ── Fantasy draft board engine (F0) ──────────────────────────────
// The math behind /fantasy, pure and testable. v1 hardcoded a single
// points-league scoring and a 12-team replacement build; a primary
// research tool has to speak YOUR league — so scoring weights, league
// size, and the roster build are settings, and everything downstream
// (FP/82, VBD replacement ranks, tier breaks) derives from them.

import { computeBreakout, type BreakoutDriver } from "./breakout-model";

export interface FantasyScoring {
  G: number;
  A: number;
  PPP: number;
  HIT: number;
  BLK: number;
}

export interface FantasySettings {
  scoring: FantasyScoring;
  /** League size — replacement level scales with it. */
  teams: number;
  /** Starters per roster slot, per team. */
  starters: { C: number; W: number; D: number };
}

export const DEFAULT_FANTASY_SETTINGS: FantasySettings = {
  scoring: { G: 6, A: 4, PPP: 2, HIT: 0.6, BLK: 1 },
  teams: 12,
  starters: { C: 2, W: 4, D: 4 },
};

export interface FantasyPlayerInput {
  id: string;
  name: string;
  teamId: string;
  position: string;
  age: number;
  games?: number;
  goalsPace?: number | null;
  assistsPace?: number | null;
  ppPtsPace82?: number | null;
  baselineHits82?: number | null;
  baselineBlocks82?: number | null;
  xGPace?: number;
  developmentProfile?: { dynastyScore?: number } | null;
  // Breakout Watch inputs (all optional — the model degrades gracefully)
  ptsPace?: number | null;
  baselinePtsPace?: number | null;
  avgTOI?: number | null;
  hdFinishingDelta?: number | null;
  prospectPtsPace?: number | null;
  draftOverall?: number | null;
  edgeBurstsOver20?: number | null;
  edgeSpeedMaxMph?: number | null;
  edgeOzPct?: number | null;
}

export interface FantasyRow {
  p: FantasyPlayerInput;
  posGroup: "C" | "W" | "D";
  g82: number;
  a82: number;
  ppp82: number;
  hit82: number | null;
  blk82: number | null;
  fp82: number;
  vbd: number;
  /** 1-based tier; players past the tiered pool carry the last tier + 1. */
  tier: number;
}

export function posGroupOf(position: string): "C" | "W" | "D" {
  return position === "C" ? "C" : position === "D" ? "D" : "W";
}

export function fantasyPoints(p: FantasyPlayerInput, scoring: FantasyScoring): number {
  const g = p.goalsPace ?? 0;
  const a = p.assistsPace ?? 0;
  const ppp = p.ppPtsPace82 ?? 0;
  const hit = p.baselineHits82 ?? 0;
  const blk = p.baselineBlocks82 ?? 0;
  return Math.round(g * scoring.G + a * scoring.A + ppp * scoring.PPP + hit * scoring.HIT + blk * scoring.BLK);
}

// Replacement rank per position = league size × starters at that slot:
// in a 12-team 2C build, the 24th C is the best player on the wire.
export function replacementRanks(settings: FantasySettings): Record<"C" | "W" | "D", number> {
  const clampRank = (n: number) => Math.max(1, Math.round(n));
  return {
    C: clampRank(settings.teams * settings.starters.C),
    W: clampRank(settings.teams * settings.starters.W),
    D: clampRank(settings.teams * settings.starters.D),
  };
}

// Tier breaks by gap detection: within the top `pool` players, the
// (tiers − 1) largest FP drop-offs are the boundaries. Drafting is about
// tiers — "last player in tier 2" matters more than rank 17 vs 19.
export function assignTiers(rows: FantasyRow[], tiers = 8, pool = 100): void {
  const n = Math.min(pool, rows.length);
  if (n === 0) return;
  const gaps: { idx: number; size: number }[] = [];
  for (let i = 1; i < n; i++) {
    gaps.push({ idx: i, size: rows[i - 1].fp82 - rows[i].fp82 });
  }
  const boundaries = new Set(
    gaps
      .sort((a, b) => b.size - a.size || a.idx - b.idx)
      .slice(0, Math.max(0, tiers - 1))
      .map(g => g.idx),
  );
  let tier = 1;
  for (let i = 0; i < rows.length; i++) {
    if (i >= n) { rows[i].tier = tiers + 1; continue; }
    if (boundaries.has(i)) tier++;
    rows[i].tier = tier;
  }
}

export function buildFantasyBoard(
  players: FantasyPlayerInput[],
  settings: FantasySettings = DEFAULT_FANTASY_SETTINGS,
): FantasyRow[] {
  const rows: FantasyRow[] = players
    .filter(p => p.position !== "G" && p.position !== "Pick" && (p.games ?? 0) >= 10)
    .map(p => ({
      p,
      posGroup: posGroupOf(p.position),
      g82: p.goalsPace ?? 0,
      a82: p.assistsPace ?? 0,
      ppp82: p.ppPtsPace82 ?? 0,
      hit82: p.baselineHits82 ?? null,
      blk82: p.baselineBlocks82 ?? null,
      fp82: fantasyPoints(p, settings.scoring),
      vbd: 0,
      tier: 0,
    }))
    .sort((a, b) => b.fp82 - a.fp82);

  const ranks = replacementRanks(settings);
  const byPos: Record<"C" | "W" | "D", number[]> = { C: [], W: [], D: [] };
  for (const r of rows) byPos[r.posGroup].push(r.fp82);
  for (const r of rows) {
    const pool = byPos[r.posGroup];
    const repl = pool[Math.min(ranks[r.posGroup] - 1, pool.length - 1)] ?? 0;
    r.vbd = Math.round(r.fp82 - repl);
  }

  assignTiers(rows);
  return rows;
}

// Keeper ranking: age-gated, led by the Ledger's dynasty signal when the
// development profile carries one, FP/82 as the tiebreak and fallback.
export function keeperRank(rows: FantasyRow[], maxAge = 23, limit = 10): FantasyRow[] {
  return rows
    .filter(r => r.p.age <= maxAge)
    .slice()
    .sort((a, b) => {
      const da = a.p.developmentProfile?.dynastyScore ?? -1;
      const db = b.p.developmentProfile?.dynastyScore ?? -1;
      if (da !== db) return db - da;
      return b.fp82 - a.fp82;
    })
    .slice(0, limit);
}

// ── Board sorting ────────────────────────────────────────────────
// Pure so direction bugs are testable (the page once shipped an inverted
// comparator — least FP first on load). Nulls sort last either way;
// ties break by FP descending.

export type BoardSortKey = "fp82" | "vbd" | "g82" | "a82" | "ppp82" | "hit82" | "blk82" | "age";

export function sortRows(rows: FantasyRow[], key: BoardSortKey, desc: boolean): FantasyRow[] {
  const val = (r: FantasyRow): number | null => {
    switch (key) {
      case "age": return r.p.age;
      case "hit82": return r.hit82;
      case "blk82": return r.blk82;
      default: return r[key];
    }
  };
  return rows.slice().sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va == null && vb == null) return b.fp82 - a.fp82;
    if (va == null) return 1;             // missing data sorts last
    if (vb == null) return -1;
    const diff = desc ? vb - va : va - vb;
    return diff || b.fp82 - a.fp82;
  });
}

// ── EDGE Breakout Watch ──────────────────────────────────────────
// The waiver-wire goldmine: players whose underlying signals run ahead of
// their point totals. The PROBABILITY comes from the same breakout engine
// the season simulator trusts (computeBreakout — one model, propagated).
// The REASON is built here, position-aware: a defenseman's fantasy value
// arrives as assists and power-play production, not goals, so his story
// is deployment/transition/PP — never "the goals are coming". Evidence
// chips carry the receipts so the claim is checkable at a glance.

export interface BreakoutWatchEntry {
  p: FantasyPlayerInput;
  posGroup: "C" | "W" | "D";
  breakoutPct: number; // 0–100 modeled odds of a meaningful scoring jump next season
  driver: BreakoutDriver;
  reason: string;
  evidence: string[];
  hasEdgeSignal: boolean;
}

// League base rate for a meaningful scoring jump — shown beside the odds
// so "38%" reads as ~4× the field, not a naked number.
export const BREAKOUT_BASE_RATE_PCT = 10;

const bursts82Of = (p: FantasyPlayerInput): number | null =>
  p.edgeBurstsOver20 != null && (p.games ?? 0) > 0
    ? Math.round((p.edgeBurstsOver20 / (p.games as number)) * 82)
    : null;

function breakoutStory(p: FantasyPlayerInput, posGroup: "C" | "W" | "D"): { reason: string; evidence: string[] } {
  const evidence: string[] = [];
  const bursts = bursts82Of(p);
  const coldFinish = (p.hdFinishingDelta != null && p.hdFinishingDelta <= -0.02)
    || (p.xGPace != null && p.goalsPace != null && (p.goalsPace as number) <= (p.xGPace as number) - 4);
  const fastLegs = (p.edgeSpeedMaxMph != null && p.edgeSpeedMaxMph >= 22.5) || (bursts != null && bursts >= 60);
  const pedigree = (p.draftOverall != null && p.draftOverall <= 15) || (p.prospectPtsPace ?? 0) >= 55;

  if (posGroup === "D") {
    // Blue-line fantasy value = assists + PP production + minutes.
    const ppp = p.ppPtsPace82 ?? 0;
    const toi = p.avgTOI ?? 0;
    if (ppp >= 12) evidence.push(`${Math.round(ppp)} PP pts/82`);
    if (toi >= 20) evidence.push(`${toi.toFixed(1)} TOI`);
    if (p.assistsPace != null) evidence.push(`${Math.round(p.assistsPace)} A/82`);
    if (p.edgeSpeedMaxMph != null && evidence.length < 3) evidence.push(`${p.edgeSpeedMaxMph.toFixed(1)} mph`);

    if (ppp >= 12) return { reason: "Already running a power play — blue-line production scales with PP time", evidence };
    if (toi >= 21) return { reason: "Top-pair minutes — that deployment turns into assists", evidence };
    if (fastLegs) return { reason: "Elite transition legs for a defenseman — carries become assists", evidence };
    if (pedigree) return { reason: "Pedigree says another offensive level from the blue line", evidence };
    if (coldFinish) return { reason: "Creating far more than the results show — from the back end that lands as assists", evidence };
    return { reason: "Underlying play-driving ahead of the point totals", evidence };
  }

  // Forwards: finishing, volume, speed, deployment.
  if (p.xGPace != null && p.goalsPace != null) evidence.push(`${Math.round(p.goalsPace)} G on ${Math.round(p.xGPace)} xG`);
  if (bursts != null) evidence.push(`${bursts} bursts/82`);
  if (p.edgeOzPct != null && evidence.length < 3) evidence.push(`${Math.round(p.edgeOzPct * 100)}% OZ`);
  if (p.edgeSpeedMaxMph != null && evidence.length < 3) evidence.push(`${p.edgeSpeedMaxMph.toFixed(1)} mph`);

  if (coldFinish) return { reason: "Finishing cold vs expected — the goals are coming", evidence };
  if (fastLegs) return { reason: "EDGE burst & speed running ahead of the box score", evidence };
  if ((p.avgTOI ?? 0) >= 17 && (p.ptsPace ?? 0) < 55) return { reason: "Top-six minutes without top-six points yet — the role says more", evidence };
  if ((p.edgeOzPct ?? 0) >= 0.55) return { reason: "Prime offensive-zone deployment — the chances will pile up", evidence };
  if (pedigree) return { reason: "Draft pedigree + NHLe say there's another level", evidence };
  return { reason: "Underlying signals lean positive", evidence };
}

export function buildBreakoutWatch(
  players: FantasyPlayerInput[],
  limit = 8,
  minGames = 15,
): BreakoutWatchEntry[] {
  return players
    .filter(p => p.position !== "G" && p.position !== "Pick" && (p.games ?? 0) >= minGames)
    .map(p => {
      const result = computeBreakout({
        age: p.age,
        position: p.position,
        ptsPace: p.ptsPace,
        stablePace: p.baselinePtsPace ?? p.ptsPace,
        priorGames: p.games,
        avgTOI: p.avgTOI,
        xGPace: p.xGPace,
        goalsPace: p.goalsPace,
        hdFinishingDelta: p.hdFinishingDelta,
        prospectPtsPace: p.prospectPtsPace,
        draftOverall: p.draftOverall,
        edgeBurstsOver20: p.edgeBurstsOver20,
        edgeSpeedMaxMph: p.edgeSpeedMaxMph,
      });
      const posGroup = posGroupOf(p.position);
      const story = breakoutStory(p, posGroup);
      return {
        p,
        posGroup,
        breakoutPct: Math.round(result.breakout * 100),
        driver: result.driver,
        reason: story.reason,
        evidence: story.evidence.slice(0, 3),
        hasEdgeSignal: result.hasEdgeSignal,
      };
    })
    .filter(e => e.breakoutPct >= 20)
    .sort((a, b) => b.breakoutPct - a.breakoutPct || (b.hasEdgeSignal ? 1 : 0) - (a.hasEdgeSignal ? 1 : 0))
    .slice(0, limit);
}

// ── Goalie board (fantasy lens) ──────────────────────────────────
// What actually wins goalie categories, in order: workload (starts are
// the scarcest resource), save quality, and the team in front of him
// (wins are a team stat). Start share and win environment give SV%/GSAx
// their context.

export interface GoalieBoardEntry {
  p: FantasyPlayerInput & { savePct?: number | null; gsax?: number | null; gamesStarted?: number | null };
  startShare: number;       // 0–100, GS / 82
  winEnv: "STRONG" | "NEUTRAL" | "WEAK"; // from team standing — wins follow team quality
}

export function goalieWinEnv(standing: number | null | undefined): GoalieBoardEntry["winEnv"] {
  if (standing == null) return "NEUTRAL";
  if (standing <= 10) return "STRONG";
  if (standing <= 20) return "NEUTRAL";
  return "WEAK";
}

export function buildGoalieBoard(
  players: Array<FantasyPlayerInput & { savePct?: number | null; gsax?: number | null; gamesStarted?: number | null }>,
  standings: Map<string, number>,
  limit = 15,
  minStarts = 10,
): GoalieBoardEntry[] {
  return players
    .filter(p => p.position === "G" && (p.gamesStarted ?? 0) >= minStarts)
    .map(p => ({
      p,
      startShare: Math.round(((p.gamesStarted ?? 0) / 82) * 100),
      winEnv: goalieWinEnv(standings.get(p.teamId)),
    }))
    .sort((a, b) => (b.p.gsax ?? -99) - (a.p.gsax ?? -99))
    .slice(0, limit);
}

// ── Settings persistence (localStorage, versioned) ───────────────
export const FANTASY_SETTINGS_KEY = "hl:fantasy:settings:v1";
export const FANTASY_TAKEN_KEY = "hl:fantasy:taken:v1";

export function sanitizeSettings(raw: unknown): FantasySettings {
  const d = DEFAULT_FANTASY_SETTINGS;
  if (!raw || typeof raw !== "object") return d;
  const o = raw as any;
  const num = (v: unknown, fallback: number, lo: number, hi: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  };
  return {
    scoring: {
      G: num(o?.scoring?.G, d.scoring.G, 0, 25),
      A: num(o?.scoring?.A, d.scoring.A, 0, 25),
      PPP: num(o?.scoring?.PPP, d.scoring.PPP, 0, 25),
      HIT: num(o?.scoring?.HIT, d.scoring.HIT, 0, 10),
      BLK: num(o?.scoring?.BLK, d.scoring.BLK, 0, 10),
    },
    teams: num(o?.teams, d.teams, 4, 20),
    starters: {
      C: num(o?.starters?.C, d.starters.C, 1, 6),
      W: num(o?.starters?.W, d.starters.W, 1, 8),
      D: num(o?.starters?.D, d.starters.D, 1, 8),
    },
  };
}
