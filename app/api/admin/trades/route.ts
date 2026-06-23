import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/app/lib/admin-auth";
import { SEASON } from "@/app/lib/season-config";
import { POST as evaluatePost } from "@/app/api/evaluate/route";
import {
  createFrozenTrade,
  getTrade,
  listTrades,
  updateFrozenTrade,
  updateTrade,
  type CreateFrozenTradeInput,
  type TradeFreezeEvaluator,
} from "@/app/lib/trades";
import type { Asset, EvaluateResponse, Team } from "@/app/lib/trade-types";

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
  id: z.string().min(1).optional(),
  executedDate: z.string().min(1),
  sourceUrl: z.string().trim().url().optional().or(z.literal("")),
  season: z.string().trim().min(1).optional(),
  conditions: z.string().trim().optional(),
  published: z.boolean().optional(),
  rosterMutating: z.boolean().optional(),
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

const buildEvaluator = (capCeilingOverride?: number | null): TradeFreezeEvaluator => {
  const evaluator: TradeFreezeEvaluator = async (input) => {
    const capCeiling = capCeilingOverride ?? SEASON.capCeiling;
    const assets = [...input.outgoing, ...input.incoming];
    const response = await evaluatePost(new Request("http://localhost/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assets,
        tradeOutgoing: input.outgoing,
        tradeIncoming: input.incoming,
        homeTeam: input.homeTeam,
        partnerTeam: input.partnerTeam,
        allHomeRoster: input.allHomeRoster,
        allPartnerRoster: input.allPartnerRoster,
        capCeiling,
        runTrade: true,
      }),
    }));
    if (!response.ok) throw new Error(`Failed to evaluate trade draft (HTTP ${response.status})`);
    const evaluation = await response.json() as EvaluateResponse;
    if (!evaluation.verdict) throw new Error("Failed to evaluate trade draft");

    return {
      navMap: evaluation.navMap,
      verdict: evaluation.verdict,
    };
  };

  return evaluator;
};

const toFrozenInput = (body: z.infer<typeof SaveTradeSchema>, id: string): CreateFrozenTradeInput => {
  const [home, partner] = body.sides;
  return {
    id,
    executedDate: body.executedDate,
    source: "manual" as const,
    sourceUrl: body.sourceUrl || null,
    season: body.season || SEASON.label,
    sides: [
      {
        team: home.team as Team,
        assetsGiven: home.assetsGiven.map((asset) => ({ kind: asset.position === "Pick" ? "pick" as const : "player" as const, asset: asset as unknown as Asset })),
        fullRoster: (home.fullRoster ?? []) as unknown as Asset[],
      },
      {
        team: partner.team as Team,
        assetsGiven: partner.assetsGiven.map((asset) => ({ kind: asset.position === "Pick" ? "pick" as const : "player" as const, asset: asset as unknown as Asset })),
        fullRoster: (partner.fullRoster ?? []) as unknown as Asset[],
      },
    ],
    conditions: body.conditions || null,
    published: body.published ?? false,
    rosterMutating: body.rosterMutating ?? true,
  };
};

const parseSaveBody = async (req: Request) => {
  const parsed = SaveTradeSchema.safeParse(await req.json());
  if (!parsed.success) {
    return { error: NextResponse.json({ error: "Invalid trade draft", details: parsed.error.format() }, { status: 400 }) };
  }

  const body = parsed.data;
  const [home, partner] = body.sides;
  if (home.team.id === partner.team.id) {
    return { error: NextResponse.json({ error: "Choose two different teams" }, { status: 400 }) };
  }

  return { body };
};

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    return NextResponse.json({ trades: await listTrades() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load trade drafts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const parsed = await parseSaveBody(req);
  if (parsed.error) return parsed.error;
  const body = parsed.body;

  try {
    const trade = await createFrozenTrade(
      toFrozenInput(body, tradeId(body.executedDate)),
      buildEvaluator(body.capCeiling),
    );

    return NextResponse.json({ ok: true, trade });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save trade draft";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const parsed = await parseSaveBody(req);
  if (parsed.error) return parsed.error;
  const body = parsed.body;
  if (!body.id) return NextResponse.json({ error: "Trade id is required" }, { status: 400 });

  try {
    const existing = await getTrade(body.id);
    if (!existing) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    const trade = await updateFrozenTrade(
      toFrozenInput(body, body.id),
      buildEvaluator(body.capCeiling),
    );
    return NextResponse.json({ ok: true, trade });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update trade draft";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const parsed = z.object({
    id: z.string().min(1),
    published: z.boolean(),
    rosterMutating: z.boolean().optional(),
  }).safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid publish request", details: parsed.error.format() }, { status: 400 });
  }

  try {
    const trade = await updateTrade(parsed.data.id, {
      published: parsed.data.published,
      ...(parsed.data.rosterMutating == null ? {} : { rosterMutating: parsed.data.rosterMutating }),
    });
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    return NextResponse.json({ ok: true, trade });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update publish state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
