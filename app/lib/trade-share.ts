import { z } from "zod";
import type { Asset, Team, TradeVerdict } from "@/app/lib/trade-types";

export const TRADE_SHARE_SCHEMA = "trade-share.v1";
export const TRADE_SHARE_VERSION = 1;

const RetainedPctSchema = z.number().min(0).max(0.5);

export const TradeShareAssetRefSchema = z.object({
  id: z.string().min(1),
  retainedPct: RetainedPctSchema.default(0),
});

export const TradeShareVerdictSchema = z.object({
  status: z.enum(["IDLE", "PENDING", "FAIR", "WIN", "LOSS", "BLOCKED", "DECLINED"]),
  message: z.string(),
  metrics: z.object({
    navOut: z.number(),
    navIn: z.number(),
    homeNetGain: z.number(),
    ptsGain: z.number(),
    defGain: z.number(),
    capDelta: z.number(),
    variance: z.number(),
    ewaHome: z.number(),
    cwiYears: z.number(),
  }),
  flags: z.array(z.object({
    severity: z.enum(["HARD", "SOFT", "WARN", "INFO"]),
    category: z.string(),
    headline: z.string(),
    explanation: z.string(),
    affectedAsset: z.string().optional(),
    vetoesSide: z.union([z.literal(0), z.literal(1)]).optional(),
    perspective: z.enum(["home", "partner"]).optional(),
  })),
});

export const TradeShareValueTimelinePointSchema = z.object({
  asOf: z.string().min(1),
  assetValues: z.record(z.number()).default({}),
  packageValues: z.object({
    outgoing: z.number(),
    incoming: z.number(),
    homeNetGain: z.number(),
  }),
});

export const TradeSharePayloadSchema = z.object({
  schema: z.literal(TRADE_SHARE_SCHEMA),
  version: z.literal(TRADE_SHARE_VERSION),
  mode: z.enum(["trade-machine", "armchair-gm"]).default("trade-machine"),
  createdAt: z.string().min(1),
  season: z.string().optional(),
  teams: z.object({
    homeTeamId: z.string().min(1),
    partnerTeamId: z.string().min(1),
  }),
  blocks: z.object({
    outgoing: z.array(TradeShareAssetRefSchema),
    incoming: z.array(TradeShareAssetRefSchema),
  }),
  lockedVerdict: TradeShareVerdictSchema.optional(),
  valueTimeline: z.array(TradeShareValueTimelinePointSchema).max(12).default([]),
});

export type TradeShareAssetRef = z.infer<typeof TradeShareAssetRefSchema>;
export type TradeSharePayload = z.infer<typeof TradeSharePayloadSchema>;

export type TradeQueryState = {
  homeTeamId: string | null;
  partnerTeamId: string | null;
  outgoing: TradeShareAssetRef[];
  incoming: TradeShareAssetRef[];
};

const assetToRef = (asset: Asset): TradeShareAssetRef => ({
  id: asset.id,
  retainedPct: normalizeRetainedPct(asset.retainedPct ?? 0),
});

export function normalizeRetainedPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.5, Math.round(value * 100) / 100));
}

export function createTradeSharePayload(input: {
  homeTeam: Team;
  partnerTeam: Team;
  outgoing: Asset[];
  incoming: Asset[];
  verdict?: TradeVerdict | null;
  mode?: "trade-machine" | "armchair-gm";
  createdAt?: string;
  season?: string;
  valueTimeline?: TradeSharePayload["valueTimeline"];
}): TradeSharePayload {
  return TradeSharePayloadSchema.parse({
    schema: TRADE_SHARE_SCHEMA,
    version: TRADE_SHARE_VERSION,
    mode: input.mode ?? "trade-machine",
    createdAt: input.createdAt ?? new Date().toISOString(),
    season: input.season,
    teams: {
      homeTeamId: input.homeTeam.id,
      partnerTeamId: input.partnerTeam.id,
    },
    blocks: {
      outgoing: input.outgoing.map(assetToRef),
      incoming: input.incoming.map(assetToRef),
    },
    lockedVerdict: input.verdict
      ? {
          status: input.verdict.status,
          message: input.verdict.message,
          metrics: input.verdict.metrics,
          flags: input.verdict.flags,
        }
      : undefined,
    valueTimeline: input.valueTimeline ?? [],
  });
}

export function encodeTradeSharePayload(payload: TradeSharePayload): string {
  const canonical = TradeSharePayloadSchema.parse(payload);
  return base64UrlEncode(JSON.stringify(canonical));
}

export function decodeTradeSharePayload(code: string): TradeSharePayload {
  return TradeSharePayloadSchema.parse(JSON.parse(base64UrlDecode(code)));
}

export function buildTradeQueryString(state: TradeQueryState): string {
  const params = new URLSearchParams();
  if (state.homeTeamId) params.set("home", state.homeTeamId);
  if (state.partnerTeamId) params.set("partner", state.partnerTeamId);
  const outgoing = encodeAssetRefs(state.outgoing);
  const incoming = encodeAssetRefs(state.incoming);
  if (outgoing) params.set("out", outgoing);
  if (incoming) params.set("in", incoming);
  return params.toString();
}

export function parseTradeQueryState(search: string | URLSearchParams): TradeQueryState {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return {
    homeTeamId: params.get("home"),
    partnerTeamId: params.get("partner"),
    outgoing: parseAssetRefs(params.get("out")),
    incoming: parseAssetRefs(params.get("in")),
  };
}

export function resolveTradeShareAssets(
  refs: TradeShareAssetRef[],
  assets: Asset[],
): Asset[] {
  return refs.flatMap(ref => {
    const asset = assets.find(candidate => candidate.id === ref.id);
    return asset ? [{ ...asset, retainedPct: ref.retainedPct }] : [];
  });
}

function encodeAssetRefs(refs: TradeShareAssetRef[]): string {
  return refs
    .map(ref => {
      const retainedPct = normalizeRetainedPct(ref.retainedPct);
      return retainedPct > 0 ? `${ref.id}:${Math.round(retainedPct * 100)}` : ref.id;
    })
    .join(",");
}

function parseAssetRefs(value: string | null): TradeShareAssetRef[] {
  if (!value) return [];
  return value.split(",").flatMap(token => {
    const [id, retainedPct] = token.split(":");
    if (!id) return [];
    return [{
      id,
      retainedPct: retainedPct ? normalizeRetainedPct(Number.parseInt(retainedPct, 10) / 100) : 0,
    }];
  });
}

function base64UrlEncode(value: string): string {
  return toBase64(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
  return fromBase64(padded);
}

function toBase64(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64");
  }
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("utf8");
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
