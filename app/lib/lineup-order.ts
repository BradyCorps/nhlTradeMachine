export interface LineupPlayer {
  id: string;
  name: string;
  position: string;
  secondaryPosition?: string | null;
  avgTOI?: number;
  ptsPace?: number;
  // The same 82-game basis as `ptsPace`, split into its parts so a lineup row
  // can show counting stats (RL8). `ptsPace` stays — the default ordering and
  // the sim both still rank on it.
  goalsPace?: number;
  assistsPace?: number;
  capHit?: number;
  games?: number;
}

export interface LineupOrderPayload {
  forwards: string[];
  defense: string[];
  goalies: string[];
  scratches: string[];
  /**
   * RL6 — special-teams sheets, flat and sliced into units. Optional so a
   * lineup saved before RL6 still hydrates; see app/lib/special-teams.ts.
   */
  powerPlay?: string[];
  penaltyKill?: string[];
}

export type LineupGroup = "F" | "D" | "G";
export type LineupGroupOrders = Record<LineupGroup, string[]>;

const sortByIce = (ps: LineupPlayer[]) =>
  [...ps].sort((a, b) => (b.avgTOI ?? b.ptsPace ?? 0) - (a.avgTOI ?? a.ptsPace ?? 0));
const sortByGames = (ps: LineupPlayer[]) =>
  [...ps].sort((a, b) => (b.games ?? 0) - (a.games ?? 0));

// ── Position eligibility (AG3) ───────────────────────────────────
// A player's alternate position must persist into the lineup: a winger
// listed with secondaryPosition "C" (Lehkonen, Teravainen) is eligible at
// center, a center with "W" (Vilardi, Point…) is eligible on the wing.
// Both the primary AND secondary positions are checked; a generic "F"
// secondary means either forward slot. Exported as the single source of
// truth so the LineupEditor and the default ordering agree.
//
// Forward flex only. D and G stay primary-only on purpose: honoring a
// cross-group secondary (an F who can spot-play D) would place the same
// id in two group orders at once and double-deploy him in the sim, and
// the editor can't move a player across groups anyway.
const WING_TOKENS = new Set(["W", "L", "R", "LW", "RW"]);
const eligibleAt = (p: LineupPlayer, matches: (pos: string) => boolean): boolean =>
  matches(p.position) || (p.secondaryPosition != null && matches(p.secondaryPosition));

export const isC = (p: LineupPlayer) => eligibleAt(p, pos => pos === "C" || pos === "F");
export const isW = (p: LineupPlayer) => eligibleAt(p, pos => WING_TOKENS.has(pos) || pos === "F");
export const isF = (p: LineupPlayer) => isC(p) || isW(p);
export const isD = (p: LineupPlayer) => p.position === "D";
export const isG = (p: LineupPlayer) => p.position === "G";

function buildDefaultOrder(
  effective: LineupPlayer[],
  group: LineupGroup,
): string[] {
  if (group === "D") return sortByIce(effective.filter(isD)).map(p => p.id);
  if (group === "G") return sortByGames(effective.filter(isG)).map(p => p.id);

  const centers   = sortByIce(effective.filter(isC));
  const wingers   = sortByIce(effective.filter(p => isW(p) && !isC(p)));
  const topC      = centers.slice(0, 4);
  const flexC     = centers.slice(4);
  const wingPool  = sortByIce([...wingers, ...flexC]);

  const order: (string | null)[] = new Array(12).fill(null);
  topC.forEach((p, i) => { order[i * 3 + 1] = p.id; });
  let w = 0;
  for (let i = 0; i < 12 && w < wingPool.length; i++) {
    if (order[i] === null) order[i] = wingPool[w++].id;
  }
  const placed = new Set(order.filter(Boolean) as string[]);
  const bench = effective.filter(p => isF(p) && !placed.has(p.id)).map(p => p.id);
  return [...(order.filter(Boolean) as string[]), ...bench];
}

export function defaultLineupOrdersForRoster(effective: LineupPlayer[]): LineupGroupOrders {
  return {
    F: buildDefaultOrder(effective, "F"),
    D: buildDefaultOrder(effective, "D"),
    G: buildDefaultOrder(effective, "G"),
  };
}

export const sameLineupGroupOrders = (a: LineupGroupOrders, b: LineupGroupOrders): boolean =>
  a.F.join("|") === b.F.join("|")
  && a.D.join("|") === b.D.join("|")
  && a.G.join("|") === b.G.join("|");

const mergeGroupOrder = (
  effective: LineupPlayer[],
  orderedIds: string[],
  belongs: (p: LineupPlayer) => boolean,
): string[] => {
  const byId = new Map(effective.map(p => [p.id, p]));
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const id of orderedIds) {
    const player = byId.get(id);
    if (!player || seen.has(id) || !belongs(player)) continue;
    seen.add(id);
    kept.push(id);
  }
  const adds = effective
    .filter(p => belongs(p) && !seen.has(p.id))
    .map(p => p.id);
  return [...kept, ...adds];
};

export function hydrateLineupOrdersForRoster(
  effective: LineupPlayer[],
  saved?: LineupOrderPayload,
): LineupGroupOrders {
  if (!saved) return defaultLineupOrdersForRoster(effective);

  const byId = new Map(effective.map(p => [p.id, p]));
  const scratches = saved.scratches ?? [];
  return {
    F: mergeGroupOrder(effective, [
      ...(saved.forwards ?? []),
      ...scratches.filter(id => {
        const player = byId.get(id);
        return player ? isF(player) : false;
      }),
    ], isF),
    D: mergeGroupOrder(effective, [
      ...(saved.defense ?? []),
      ...scratches.filter(id => {
        const player = byId.get(id);
        return player ? isD(player) : false;
      }),
    ], isD),
    G: mergeGroupOrder(effective, [
      ...(saved.goalies ?? []),
      ...scratches.filter(id => {
        const player = byId.get(id);
        return player ? isG(player) : false;
      }),
    ], isG),
  };
}
