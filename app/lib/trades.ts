import { eq, sql } from "drizzle-orm";
import { db } from "@/app/db/client";
import { trades } from "@/app/db/schema";
import type { TradeSharePayload } from "@/app/lib/trade-share";
import { canonicalNameSlug } from "@/app/lib/player-identity";
import type { Asset, Team, TradeVerdict, XNAVResult } from "@/app/lib/trade-types";

export type TradeSource = "manual" | "scraped";
export type TradeAssetKind = "player" | "pick";

export interface TradeAssetSnapshot {
  kind: TradeAssetKind;
  ref: {
    id: string;
    nameSlug: string;
  };
  retainedPct?: number;
  inputSnapshot: Record<string, unknown>;
  navAtTrade: number | null;
}

export interface TradeSide {
  teamId: string;
  assetsGiven: TradeAssetSnapshot[];
}

export interface TradeGradeAtTrade {
  perTeamNetNav: Record<string, number>;
  winner: string | null;
  fairness: string;
}

export interface TradeRecord {
  id: string;
  executedDate: string;
  source: TradeSource;
  sourceUrl: string | null;
  season: string;
  sides: TradeSide[];
  conditions: string | null;
  lockedVerdict: TradeSharePayload["lockedVerdict"] | null;
  gradeAtTrade: TradeGradeAtTrade | null;
  published: boolean;
  rosterMutating: boolean;
}

type TradeDatabase = typeof db;

export interface TradeIngestionAsset {
  kind: TradeAssetKind;
  asset: Asset;
  ref?: {
    id: string;
    nameSlug: string;
  };
}

export interface TradeIngestionSide {
  team: Team;
  assetsGiven: TradeIngestionAsset[];
  fullRoster?: Asset[];
}

export interface TradeFreezeEvaluationInput {
  outgoing: Asset[];
  incoming: Asset[];
  homeTeam: Team;
  partnerTeam: Team;
  allHomeRoster: Asset[];
  allPartnerRoster: Asset[];
}

export interface TradeFreezeEvaluation {
  verdict: TradeVerdict;
  navMap: Record<string, XNAVResult>;
}

export type TradeFreezeEvaluator =
  (input: TradeFreezeEvaluationInput) => TradeFreezeEvaluation | Promise<TradeFreezeEvaluation>;

export interface CreateFrozenTradeInput {
  id: string;
  executedDate: string;
  source: TradeSource;
  sourceUrl?: string | null;
  season: string;
  sides: [TradeIngestionSide, TradeIngestionSide, ...TradeIngestionSide[]];
  conditions?: string | null;
  published?: boolean;
  rosterMutating?: boolean;
}

export interface UpdateTradeInput {
  executedDate?: string;
  sourceUrl?: string | null;
  season?: string;
  sides?: TradeSide[];
  conditions?: string | null;
  lockedVerdict?: TradeRecord["lockedVerdict"] | null;
  gradeAtTrade?: TradeGradeAtTrade | null;
  published?: boolean;
  rosterMutating?: boolean;
}

const serialize = (value: unknown): string => JSON.stringify(value);

const parseJson = <T>(value: string | null): T | null => {
  if (value == null) return null;
  return JSON.parse(value) as T;
};

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const toLockedVerdict = (verdict: TradeVerdict): TradeRecord["lockedVerdict"] => ({
  status: verdict.status,
  message: verdict.message,
  metrics: cloneJson(verdict.metrics),
  flags: cloneJson(verdict.flags),
});

const gradeFromVerdict = (
  verdict: TradeVerdict,
  homeTeamId: string,
  partnerTeamId: string,
): TradeGradeAtTrade => {
  const homeNet = verdict.metrics.homeNetGain;
  const partnerNet = -homeNet;
  const winner = verdict.status === "FAIR" || Math.abs(homeNet) <= 0
    ? null
    : homeNet > 0 ? homeTeamId : partnerTeamId;

  return {
    perTeamNetNav: {
      [homeTeamId]: homeNet,
      [partnerTeamId]: partnerNet,
    },
    winner,
    fairness: verdict.status,
  };
};

const assetRef = (input: TradeIngestionAsset): TradeAssetSnapshot["ref"] => ({
  id: input.ref?.id ?? input.asset.id,
  nameSlug: input.ref?.nameSlug ?? canonicalNameSlug(input.asset.name || input.asset.id),
});

const navAtTrade = (asset: Asset, navMap: Record<string, XNAVResult>): number | null => {
  const nav = navMap[asset.id]?.total;
  return typeof nav === "number" && Number.isFinite(nav) ? nav : null;
};

const freezeSides = (
  sides: TradeIngestionSide[],
  navMap: Record<string, XNAVResult>,
): TradeSide[] => sides.map((side) => ({
  teamId: side.team.id,
  assetsGiven: side.assetsGiven.map((asset) => ({
    kind: asset.kind,
    ref: assetRef(asset),
    retainedPct: asset.asset.retainedPct ?? 0,
    inputSnapshot: cloneJson(asset.asset) as unknown as Record<string, unknown>,
    navAtTrade: navAtTrade(asset.asset, navMap),
  })),
}));

const toRow = (trade: TradeRecord): typeof trades.$inferInsert => ({
  id: trade.id,
  executedDate: trade.executedDate,
  source: trade.source,
  sourceUrl: trade.sourceUrl,
  season: trade.season,
  sides: serialize(trade.sides),
  conditions: trade.conditions,
  lockedVerdict: trade.lockedVerdict ? serialize(trade.lockedVerdict) : null,
  gradeAtTrade: trade.gradeAtTrade ? serialize(trade.gradeAtTrade) : null,
  published: trade.published,
  rosterMutating: trade.rosterMutating,
});

const fromRow = (row: typeof trades.$inferSelect): TradeRecord => ({
  id: row.id,
  executedDate: row.executedDate,
  source: row.source as TradeSource,
  sourceUrl: row.sourceUrl,
  season: row.season,
  sides: parseJson<TradeSide[]>(row.sides) ?? [],
  conditions: row.conditions,
  lockedVerdict: parseJson<TradeRecord["lockedVerdict"]>(row.lockedVerdict),
  gradeAtTrade: parseJson<TradeGradeAtTrade>(row.gradeAtTrade),
  published: row.published,
  rosterMutating: row.rosterMutating ?? true,
});

async function ensureRosterMutatingColumn(database: TradeDatabase): Promise<void> {
  try {
    await database.run(sql.raw("ALTER TABLE trades ADD COLUMN roster_mutating INTEGER NOT NULL DEFAULT 1"));
  } catch {
    // Column already exists, or the table will be created by the caller/test setup.
  }
}

export async function createTrade(trade: TradeRecord, database: TradeDatabase = db): Promise<TradeRecord> {
  await ensureRosterMutatingColumn(database);
  await database.insert(trades).values(toRow(trade));
  return trade;
}

async function buildFrozenTrade(
  input: CreateFrozenTradeInput,
  evaluate: TradeFreezeEvaluator,
): Promise<TradeRecord> {
  const [homeSide, partnerSide] = input.sides;
  const evaluation = await evaluate({
    outgoing: homeSide.assetsGiven.map(({ asset }) => asset),
    incoming: partnerSide.assetsGiven.map(({ asset }) => asset),
    homeTeam: homeSide.team,
    partnerTeam: partnerSide.team,
    allHomeRoster: homeSide.fullRoster ?? [],
    allPartnerRoster: partnerSide.fullRoster ?? [],
  });

  const trade: TradeRecord = {
    id: input.id,
    executedDate: input.executedDate,
    source: input.source,
    sourceUrl: input.sourceUrl ?? null,
    season: input.season,
    sides: freezeSides(input.sides, evaluation.navMap),
    conditions: input.conditions ?? null,
    lockedVerdict: toLockedVerdict(evaluation.verdict),
    gradeAtTrade: gradeFromVerdict(evaluation.verdict, homeSide.team.id, partnerSide.team.id),
    published: input.published ?? false,
    rosterMutating: input.rosterMutating ?? true,
  };

  return trade;
}

export async function createFrozenTrade(
  input: CreateFrozenTradeInput,
  evaluate: TradeFreezeEvaluator,
  database: TradeDatabase = db,
): Promise<TradeRecord> {
  const trade = await buildFrozenTrade(input, evaluate);
  return createTrade(trade, database);
}

export async function updateTrade(
  id: string,
  patch: UpdateTradeInput,
  database: TradeDatabase = db,
): Promise<TradeRecord | null> {
  await ensureRosterMutatingColumn(database);
  const existing = await getTrade(id, database);
  if (!existing) return null;

  const next: TradeRecord = {
    ...existing,
    ...patch,
    id,
  };
  await database.update(trades).set(toRow(next)).where(eq(trades.id, id));
  return next;
}

export async function updateFrozenTrade(
  input: CreateFrozenTradeInput,
  evaluate: TradeFreezeEvaluator,
  database: TradeDatabase = db,
): Promise<TradeRecord | null> {
  const trade = await buildFrozenTrade(input, evaluate);
  return updateTrade(input.id, trade, database);
}

export async function getTrade(id: string, database: TradeDatabase = db): Promise<TradeRecord | null> {
  await ensureRosterMutatingColumn(database);
  const rows = await database.select().from(trades).where(eq(trades.id, id)).limit(1);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function listPublishedTrades(database: TradeDatabase = db): Promise<TradeRecord[]> {
  await ensureRosterMutatingColumn(database);
  const rows = await database.select().from(trades).where(eq(trades.published, true));
  return rows
    .map(fromRow)
    .sort((a, b) =>
      a.executedDate.localeCompare(b.executedDate) || a.id.localeCompare(b.id)
    );
}

export async function listTrades(database: TradeDatabase = db): Promise<TradeRecord[]> {
  await ensureRosterMutatingColumn(database);
  const rows = await database.select().from(trades);
  return rows
    .map(fromRow)
    .sort((a, b) =>
      b.executedDate.localeCompare(a.executedDate) || a.id.localeCompare(b.id)
    );
}
