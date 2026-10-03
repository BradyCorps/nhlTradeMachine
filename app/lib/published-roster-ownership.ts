import { canonicalNameSlug, samePlayerIdentity } from "@/app/lib/player-identity";
import type { CapDeltaMoves } from "@/app/lib/cap-delta";
import type { TradeRecord } from "@/app/lib/trades";

type PlayerIdentity = { id?: unknown; name?: unknown; position?: string; teamId?: string | null };
type MovedAsset = TradeRecord["sides"][number]["assetsGiven"][number];

export function orderedRosterTrades(trades: TradeRecord[]): TradeRecord[] {
  return trades.filter(t => t.published && t.rosterMutating && t.sides.length === 2)
    .sort((a, b) => a.executedDate.localeCompare(b.executedDate) || a.id.localeCompare(b.id));
}

function matches(player: PlayerIdentity, asset: MovedAsset, population?: PlayerIdentity[]): boolean {
  if (population) {
    const exact = population.filter(p => p.id != null && String(p.id) === String(asset.ref.id));
    if (exact.length) return player.id != null && String(player.id) === String(asset.ref.id);
    const candidates = population.filter(p => matches(p, asset));
    if (candidates.length !== 1) return false;
    return candidates[0] === player;
  }
  const snapshot = asset.inputSnapshot;
  return samePlayerIdentity(player, {
    id: asset.ref.id,
    name: typeof snapshot.name === "string" ? snapshot.name : asset.ref.nameSlug?.replace(/-/g, " "),
    position: typeof snapshot.position === "string" ? snapshot.position : undefined,
  });
}

function movesFor(player: PlayerIdentity, trades: TradeRecord[], population?: PlayerIdentity[]) {
  return orderedRosterTrades(trades).flatMap(trade => trade.sides.flatMap((from, index) =>
    from.assetsGiven.filter(asset => asset.kind === "player" && matches(player, asset, population)).map(asset => ({
      fromTeamId: from.teamId, teamId: trade.sides[1 - index].teamId,
      retainedPct: asset.retainedPct ?? 0, asset, tradeId: trade.id,
    }))));
}

/** Shared effective ownership; stored contracts and frozen trade inputs stay untouched. */
export function resolvePublishedPlayerMove(player: PlayerIdentity, trades: TradeRecord[], population?: PlayerIdentity[]) {
  return movesFor(player, trades, population).at(-1) ?? null;
}

/** Resolve each frozen asset against the population once, rather than per row. */
export function publishedOwnershipByPlayer(players: PlayerIdentity[], trades: TradeRecord[]) {
  const ownership = new Map<PlayerIdentity, NonNullable<ReturnType<typeof resolvePublishedPlayerMove>>>();
  for (const trade of orderedRosterTrades(trades)) for (const [index, side] of trade.sides.entries()) {
    for (const asset of side.assetsGiven) {
      if (asset.kind !== "player") continue;
      const exact = players.filter(p => p.id != null && String(p.id) === String(asset.ref.id));
      const candidates = exact.length ? exact : players.filter(p => matches(p, asset));
      if (candidates.length !== 1) continue;
      ownership.set(candidates[0], { fromTeamId: side.teamId, teamId: trade.sides[1 - index].teamId,
        retainedPct: asset.retainedPct ?? 0, asset, tradeId: trade.id });
    }
  }
  return ownership;
}

export function applyPublishedTradeOverlay<T extends PlayerIdentity & {
  retainedPct?: number; tradeBlockStatus?: string | null; tradeBlockNote?: string | null;
}>(players: T[], trades: TradeRecord[]): T[] {
  const ownership = publishedOwnershipByPlayer(players, trades);
  return players.map(player => {
    const move = ownership.get(player);
    if (!move || player.position === "Pick") return player;
    const changedTeam = player.teamId !== move.teamId;
    if (!changedTeam && player.retainedPct === move.retainedPct) return player;
    return { ...player, teamId: move.teamId, retainedPct: move.retainedPct,
      ...(changedTeam ? { tradeBlockStatus: null, tradeBlockNote: null } : {}) };
  });
}

export function buildPublishedTradeCapMoves(trades: TradeRecord[], basePlayers?: PlayerIdentity[]): Record<string, CapDeltaMoves> {
  const moves: Record<string, CapDeltaMoves> = {};
  const identities = new Map<string, PlayerIdentity>();
  for (const trade of orderedRosterTrades(trades)) for (const side of trade.sides) for (const asset of side.assetsGiven) {
    if (asset.kind !== "player") continue;
    const matched = basePlayers?.find(p => matches(p, asset, basePlayers));
    if (basePlayers && !matched && basePlayers.some(p => matches(p, asset))) continue;
    const player = matched ?? {
      id: asset.ref.id, name: asset.inputSnapshot.name, position: asset.inputSnapshot.position as string | undefined,
    };
    const key = player.id ? `id:${player.id}` : `name:${canonicalNameSlug(String(player.name ?? ""))}:${player.position ?? ""}`;
    if (![...identities.values()].some(existing => samePlayerIdentity(existing, player))) identities.set(key, player);
  }
  for (const player of identities.values()) {
    const history = movesFor(player, trades, basePlayers?.includes(player) ? basePlayers : undefined);
    // An upstream/DB roster may already include a prefix (or all) of the chain.
    // Apply only the remaining suffix, including retention, once.
    let start = 0;
    if (basePlayers) for (let i = 0; i < history.length; i++) if (history[i].teamId === player.teamId) start = i + 1;
    for (const move of history.slice(start)) {
      const capHit = move.asset.inputSnapshot.capHit;
      const capAsset = { capHit: typeof capHit === "number" && Number.isFinite(capHit) ? capHit : 0, retainedPct: move.retainedPct };
      for (const [team, direction] of [[move.fromTeamId, "outgoing"], [move.teamId, "incoming"]] as const) {
        const current = moves[team] ?? {};
        moves[team] = { ...current, [direction]: [...(current[direction] ?? []), capAsset] };
      }
    }
  }
  return moves;
}
