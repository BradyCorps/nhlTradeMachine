import { NextResponse } from "next/server";
import { z } from "zod";
import { SEASON } from "@/app/lib/season-config";

// Narrative-only Claude endpoint.
// The client sends locked, pre-calculated facts; this route builds the prompt.
// Do not accept raw `messages` here, or the LLM boundary becomes unenforceable.

const ALLOWED_MODELS = new Set([
  "claude-haiku-4-5",
  "claude-sonnet-4-5",
  "claude-sonnet-4-20250514",
  "claude-haiku-4-5-20251001",
]);

const MAX_TOKENS_LIMIT = 1800;

declare global {
  var __rateLimitMap: Map<string, { count: number; resetAt: number }> | undefined;
}
if (!global.__rateLimitMap) global.__rateLimitMap = new Map();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const limit = 10;
  const entry = global.__rateLimitMap!.get(ip);
  if (!entry || now > entry.resetAt) {
    global.__rateLimitMap!.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

const AssetSummarySchema = z.object({
  name: z.string(),
  position: z.string(),
  age: z.number().nullable().optional(),
  capHit: z.number().nullable().optional(),
  yearsRemaining: z.number().nullable().optional(),
  ptsPace: z.number().nullable().optional(),
  round: z.number().nullable().optional(),
  year: z.number().nullable().optional(),
});

const TeamSummarySchema = z.object({
  name: z.string(),
  phase: z.string().nullable().optional(),
  standing: z.number().nullable().optional(),
  capSpace: z.number().nullable().optional(),
});

const FlagSummarySchema = z.object({
  severity: z.enum(["HARD", "SOFT", "WARN", "INFO"]),
  headline: z.string(),
});

const MetricsSchema = z.object({
  homeNetGain: z.number(),
  ewaHome: z.number(),
  cwiYears: z.number(),
  ptsGain: z.number(),
  capDelta: z.number(),
  variance: z.number(),
});

const TradeMemoPayloadSchema = z.object({
  homeTeam: TeamSummarySchema,
  partnerTeam: TeamSummarySchema,
  outgoing: z.array(AssetSummarySchema),
  incoming: z.array(AssetSummarySchema),
  metrics: MetricsSchema,
  status: z.string(),
  flags: z.array(FlagSummarySchema),
});

const SeasonRecapPayloadSchema = z.object({
  lockedReport: z.string(),
});

const ClaudeRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("trade_memo"),
    model: z.string().optional(),
    max_tokens: z.number().optional(),
    payload: TradeMemoPayloadSchema,
  }),
  z.object({
    kind: z.literal("season_recap"),
    model: z.string().optional(),
    max_tokens: z.number().optional(),
    payload: SeasonRecapPayloadSchema,
  }),
]);

function describeAssets(assets: z.infer<typeof AssetSummarySchema>[]): string {
  if (assets.length === 0) return "No assets";
  return assets.map((a) => {
    if (a.position === "Pick") {
      const roundLabel = a.round === 1 ? "1st" : a.round === 2 ? "2nd" : a.round === 3 ? "3rd" : `${a.round ?? "?"}th`;
      return `${a.year ?? "Future"} ${roundLabel} round pick`;
    }
    return `${a.name} (${a.position}, age ${a.age ?? "?"}, $${(a.capHit ?? 0).toFixed(1)}M x ${a.yearsRemaining ?? "?"}yr, ${Math.round(a.ptsPace ?? 0)} pts/82)`;
  }).join(", ");
}

function buildTradeMemoPrompt(payload: z.infer<typeof TradeMemoPayloadSchema>): string {
  const flagSummary = payload.flags
    .filter((f) => f.severity === "HARD" || f.severity === "SOFT")
    .map((f) => `- [${f.severity}] ${f.headline}`)
    .join("\n");

  return `You are a senior NHL front office analyst writing an internal trade evaluation memo. Base your analysis ONLY on the locked data provided. Do not invent injuries, contract disputes, locker room issues, player values, standings, or league context not shown here.

TRADE DETAILS:
${payload.homeTeam.name} (${payload.homeTeam.phase ?? "Unknown"}, #${payload.homeTeam.standing ?? "?"}/32, $${payload.homeTeam.capSpace ?? "?"}M cap space) sends:
  ${describeAssets(payload.outgoing)}

${payload.partnerTeam.name} (${payload.partnerTeam.phase ?? "Unknown"}, #${payload.partnerTeam.standing ?? "?"}/32, $${payload.partnerTeam.capSpace ?? "?"}M cap space) sends:
  ${describeAssets(payload.incoming)}

LOCKED ANALYTICS:
- NAV balance: ${payload.homeTeam.name} nets ${payload.metrics.homeNetGain > 0 ? "+" : ""}${payload.metrics.homeNetGain.toFixed(0)} NAV points
- Estimated Wins Added: ${payload.metrics.ewaHome > 0 ? "+" : ""}${payload.metrics.ewaHome.toFixed(1)} wins in the standings
- Contention Window Shift: ${payload.metrics.cwiYears > 0 ? "opens/extends by" : payload.metrics.cwiYears < 0 ? "shortens by" : "neutral,"} ${Math.abs(payload.metrics.cwiYears).toFixed(1)} years
- Production delta: ${payload.metrics.ptsGain > 0 ? "+" : ""}${payload.metrics.ptsGain.toFixed(1)} pts/82
- Cap impact: ${payload.metrics.capDelta > 0 ? "+" : ""}${payload.metrics.capDelta.toFixed(1)}M
- Value imbalance: ${payload.metrics.variance.toFixed(0)}%
- Verdict: ${payload.status}

GM LOGIC FLAGS:
${flagSummary || "None - trade passes all logic checks"}

Write a concise 3-paragraph front office memo. Each paragraph maximum 4 sentences.
1. What each team's organizational motivation is based on phase and standing.
2. Whether the locked analytics support the trade for both teams.
3. One clear recommendation: accept, reject, or counter with specific conditions.

Rules: Use only the locked numbers above. Do not calculate new values. Complete every sentence.`;
}

function buildSeasonRecapPrompt(payload: z.infer<typeof SeasonRecapPayloadSchema>): string {
  return `You are a senior NHL beat reporter writing an end-of-season alternate-history recap.

Use ONLY the locked pre-calculated report below. Do not estimate, calculate, infer missing values, invent injuries, invent off-ice stories, or change standings/playoff results. Treat executed deals as ${SEASON.rosterMoveWindow} roster moves, never as trade-deadline moves. If a fact is not in the report, omit it.

LOCKED REPORT:
${payload.lockedReport}`;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded - try again in a minute" }, { status: 429 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ClaudeRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid narrative request", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const body = parsed.data;
  const safeModel = body.model && ALLOWED_MODELS.has(body.model)
    ? body.model
    : "claude-sonnet-4-5";
  const safeTokens = Math.min(Math.max(1, body.max_tokens ?? 700), MAX_TOKENS_LIMIT);

  const prompt = body.kind === "trade_memo"
    ? buildTradeMemoPrompt(body.payload)
    : buildSeasonRecapPrompt(body.payload);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: safeModel,
        max_tokens: safeTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
