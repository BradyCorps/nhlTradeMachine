import type { Asset } from "@/app/lib/trade-types";

export type OffseasonPlayerState =
  | "ROSTER"
  | "RETAINED_RIGHTS"
  | "RFA"
  | "UFA"
  | "SIGNED_ELSEWHERE"
  | "RETIRED";

export type OffseasonTransactionKind =
  | "RE_SIGNED"
  | "RIGHTS_RETAINED"
  | "ENTERED_MARKET"
  | "OFFER_SHEET_ELIGIBLE"
  | "SIGNED"
  | "EXTENDED"
  | "TRADED"
  | "RELEASED"
  | "RETIRED"
  | "DRAFTED"
  | "DEPTH_ADDED";

export interface OffseasonTransaction {
  playerId: string;
  playerName: string;
  kind: OffseasonTransactionKind;
  state: OffseasonPlayerState;
  fromTeamId?: string | null;
  toTeamId?: string | null;
  detail: string;
}

export interface OffseasonStateDiagnostic {
  ok: boolean;
  previousCount: number;
  draftedCount: number;
  expectedCount: number;
  actualCount: number;
  counts: Record<OffseasonPlayerState, number>;
  missingPlayerIds: string[];
  unexpectedPlayerIds: string[];
  duplicatePlayerIds: string[];
  conflictingPlayerIds: string[];
  excludedSyntheticDepthCount: number;
  equation: string;
}

export interface OffseasonStateAuditInput {
  previous: readonly Asset[];
  current: readonly Asset[];
  drafted?: readonly Asset[];
  retired?: readonly Asset[];
  retainedRightsIds?: readonly string[];
  rfaIds?: readonly string[];
  ufaIds?: readonly string[];
  signedElsewhereIds?: readonly string[];
  /** Newly generated replacement players are disclosed, but are outside the
   *  real-player conservation equation because they are neither previous nor
   *  drafted players. Existing replacement players remain fully tracked. */
  excludedSyntheticDepthIds?: readonly string[];
}

const STATES: OffseasonPlayerState[] = [
  "ROSTER",
  "RETAINED_RIGHTS",
  "RFA",
  "UFA",
  "SIGNED_ELSEWHERE",
  "RETIRED",
];

const tracked = (players: readonly Asset[]): Asset[] =>
  players.filter((player) => player.position !== "Pick");

const duplicateIds = (players: readonly Asset[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const player of tracked(players)) {
    if (seen.has(player.id)) duplicates.add(player.id);
    seen.add(player.id);
  }
  return [...duplicates];
};

const duplicateStrings = (ids: readonly string[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
};

/**
 * Check the offseason's unique-player partition. UI pools classify a player;
 * `current` remains the canonical carrier for every non-retired player so a
 * temporary market array cannot hide a deletion from the league database.
 */
export function auditOffseasonPlayerStates(input: OffseasonStateAuditInput): OffseasonStateDiagnostic {
  const previous = tracked(input.previous);
  const current = tracked(input.current);
  const drafted = tracked(input.drafted ?? []);
  const retired = tracked(input.retired ?? []);
  const excludedIds = new Set(input.excludedSyntheticDepthIds ?? []);

  const previousIds = new Set(previous.map((player) => player.id));
  const draftedIds = new Set(drafted.map((player) => player.id));
  const retiredIds = new Set(retired.map((player) => player.id));
  const allCurrentIds = new Set(current.map((player) => player.id));
  const currentIds = new Set(
    current.filter((player) => !excludedIds.has(player.id)).map((player) => player.id),
  );

  const expectedIds = new Set([...previousIds, ...draftedIds]);
  const actualIds = new Set([...currentIds, ...retiredIds]);
  const conflicts = new Set<string>();
  for (const id of draftedIds) if (previousIds.has(id)) conflicts.add(id);
  for (const id of retiredIds) if (currentIds.has(id)) conflicts.add(id);
  for (const id of excludedIds) {
    if (previousIds.has(id) || draftedIds.has(id)) conflicts.add(id);
  }

  const claims = new Map<string, Set<OffseasonPlayerState>>();
  const claim = (state: OffseasonPlayerState, ids: readonly string[]) => {
    for (const id of ids) {
      const states = claims.get(id) ?? new Set<OffseasonPlayerState>();
      states.add(state);
      claims.set(id, states);
    }
  };
  claim("RETAINED_RIGHTS", input.retainedRightsIds ?? []);
  claim("RFA", input.rfaIds ?? []);
  claim("UFA", input.ufaIds ?? []);
  claim("SIGNED_ELSEWHERE", input.signedElsewhereIds ?? []);

  for (const [id, states] of claims) {
    if (states.size > 1 || !currentIds.has(id)) conflicts.add(id);
  }

  const counts = Object.fromEntries(STATES.map((state) => [state, 0])) as Record<OffseasonPlayerState, number>;
  for (const player of current) {
    if (excludedIds.has(player.id)) continue;
    const claimed = claims.get(player.id);
    let state: OffseasonPlayerState;
    if (claimed?.size === 1) {
      state = [...claimed][0];
    } else if (player.teamId === "FA_POOL") {
      state = player.contractStatus === "RFA" ? "RFA" : "UFA";
    } else {
      state = "ROSTER";
    }
    counts[state]++;
  }
  counts.RETIRED = retiredIds.size;

  const duplicatePlayerIds = new Set<string>([
    ...duplicateIds(previous),
    ...duplicateIds(current),
    ...duplicateIds(drafted),
    ...duplicateIds(retired),
    ...duplicateStrings(input.retainedRightsIds ?? []),
    ...duplicateStrings(input.rfaIds ?? []),
    ...duplicateStrings(input.ufaIds ?? []),
    ...duplicateStrings(input.signedElsewhereIds ?? []),
  ]);
  const missingPlayerIds = [...expectedIds].filter((id) => !actualIds.has(id)).sort();
  const unexpectedPlayerIds = [...actualIds].filter((id) => !expectedIds.has(id)).sort();
  const actualCount = STATES.reduce((sum, state) => sum + counts[state], 0);
  const equation = `${counts.ROSTER} roster + ${counts.RETAINED_RIGHTS} retained rights + ${counts.RFA} RFA + ${counts.UFA} UFA + ${counts.SIGNED_ELSEWHERE} signed elsewhere + ${counts.RETIRED} retired = ${actualCount}; ${previousIds.size} previous + ${draftedIds.size} drafted = ${expectedIds.size}`;

  return {
    ok: missingPlayerIds.length === 0
      && unexpectedPlayerIds.length === 0
      && duplicatePlayerIds.size === 0
      && conflicts.size === 0
      && actualCount === expectedIds.size,
    previousCount: previousIds.size,
    draftedCount: draftedIds.size,
    expectedCount: expectedIds.size,
    actualCount,
    counts,
    missingPlayerIds,
    unexpectedPlayerIds,
    duplicatePlayerIds: [...duplicatePlayerIds].sort(),
    conflictingPlayerIds: [...conflicts].sort(),
    excludedSyntheticDepthCount: [...excludedIds].filter((id) => allCurrentIds.has(id)).length,
    equation,
  };
}

/** Last recorded terminal state for each player in a chronological ledger. */
export function latestOffseasonStates(
  transactions: readonly OffseasonTransaction[],
): Map<string, OffseasonPlayerState> {
  const states = new Map<string, OffseasonPlayerState>();
  for (const transaction of transactions) states.set(transaction.playerId, transaction.state);
  return states;
}
