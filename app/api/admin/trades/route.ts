import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/app/lib/admin-auth";
import { SEASON } from "@/app/lib/season-config";
import { evaluateTrade, getAssetNAV } from "@/app/api/evaluate/route";
import { createFrozenTrade, type TradeFreezeEvaluator } from "@/app/lib/trades";
import type { Asset, Team, XNAVResult } from "@/app/lib/trade-types";

export const dynamic = "force-dynamic";

const AssetSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  name: z.string().min(1),
  position: z.string().min(1),
  retainedPct: z.number().min(0).max(0.5).optional(),
}).passthrough();

const TeamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  capSpace: z.number(),
  standing: z.number(),
}).passthrough();

const SaveTradeSchema = z.object({
  executedDate: z.string().min(1),
  sourceUrl: z.string().trim().url().optional().or(z.literal("")),
  season: z.string().trim().min(1).optional(),
  conditions: z.string().trim().optional(),
  capCeiling: z.number().positive().optional().nullable(),
  sides: z.tuple([
    z.object({
      team: TeamSchema,
      assetsGiven: z.array(AssetSchema).min(1),
      fullRoster: z.array(AssetSchema).optional(),
    }),
    z.object({
      team: TeamSchema,
      assetsGiven: z.array(AssetSchema).min(1),
      fullRoster: z.array(AssetSchema).optional(),
    }),
  ]),
});

const tradeId = (executedDate: string): string =>
  `trade-${executedDate}-${crypto.randomUUID().slice(0, 8)}`;

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const parsed = SaveTradeSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid trade draft", details: parsed.error.format() }, { status: 400 });
  }

  const body = parsed.data;
  const [home, partner] = body.sides;
  if (home.team.id === partner.team.id) {
    return NextResponse.json({ error: "Choose two different teams" }, { status: 400 });
  }

  const evaluator: TradeFreezeEvaluator = (input) => {
    const capCeiling = body.capCeiling ?? SEASON.capCeiling;
    const assets = [...input.outgoing, ...input.incoming];
    const navMap = assets.reduce<Record<string, XNAVResult>>((map, asset) => {
      map[asset.id] = getAssetNAV(asset, capCeiling) as unknown as XNAVResult;
      return map;
    }, {});

    return {
      navMap,
      verdict: evaluateTrade(
        input.outgoing,
        input.incoming,
        input.homeTeam,
        input.partnerTeam,
        input.allHomeRoster,
        input.allPartnerRoster,
        capCeiling,
      ),
    };
  };

  try {
    const trade = await createFrozenTrade({
      id: tradeId(body.executedDate),
      executedDate: body.executedDate,
      source: "manual",
      sourceUrl: body.sourceUrl || null,
      season: body.season || SEASON.label,
      sides: [
        {
          team: home.team as Team,
          assetsGiven: home.assetsGiven.map((asset) => ({ kind: asset.position === "Pick" ? "pick" : "player", asset: asset as unknown as Asset })),
          fullRoster: (home.fullRoster ?? []) as unknown as Asset[],
        },
        {
          team: partner.team as Team,
          assetsGiven: partner.assetsGiven.map((asset) => ({ kind: asset.position === "Pick" ? "pick" : "player", asset: asset as unknown as Asset })),
          fullRoster: (partner.fullRoster ?? []) as unknown as Asset[],
        },
      ],
      conditions: body.conditions || null,
      published: false,
    }, evaluator);

    return NextResponse.json({ ok: true, trade });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save trade draft";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
