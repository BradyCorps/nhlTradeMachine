import { NextResponse } from "next/server";
import { z } from "zod";
import { SEASON } from "@/app/lib/season-config";
import { redis } from "@/app/lib/redis";

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

// ── Rate limiting ────────────────────────────────────────────────────────────
// This endpoint spends real money on the Anthropic API, so the limiter has to
// survive both serverless fan-out (many instances) and IP spoofing. When Redis
// is configured we enforce three windows:
//   • per-IP — 10 req/min  (normal-use guard)
//   • global — 60 req/min  (burst guard, resistant to X-Forwarded-For rotation)
//   • global — 2000 req/day (hard daily spend ceiling)
// The per-IP window alone is bypassable by rotating X-Forwarded-For, so the
// global windows are the real protection against cost-exhaustion abuse. Without
// Redis (local dev / tests) we fall back to a pruned in-memory per-IP limiter.

const PER_IP_PER_MINUTE = 10;
const GLOBAL_PER_MINUTE = 60;
const GLOBAL_PER_DAY = 2000;

type RateLimitResult = { ok: true } | { ok: false; reason: string };

// Increment `key`, set its TTL on first write, and report whether it is within
// `limit` -- one INCR (plus a conditional EXPIRE) per window.
async function incrWithinLimit(key: string, limit: number, ttlSeconds: number): Promise<boolean> {
  const count = await redis!.incr(key);
  if (count === 1) await redis!.expire(key, ttlSeconds);
  return count <= limit;
}

declare global {
  var __rateLimitMap: Map<string, { count: number; resetAt: number }> | undefined;
}
if (!global.__rateLimitMap) global.__rateLimitMap = new Map();

// In-memory fallback for local dev / tests. Prunes expired entries on each call
// so the map cannot grow without bound (the previous version never deleted any).
function checkRateLimitInMemory(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const map = global.__rateLimitMap!;
  for (const [key, entry] of map) {
    if (now > entry.resetAt) map.delete(key);
  }
  const entry = map.get(ip);
  if (!entry || now > entry.resetAt) {
    map.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= PER_IP_PER_MINUTE) return false;
  entry.count++;
  return true;
}

async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  if (redis) {
    try {
      const minuteBucket = Math.floor(Date.now() / 60_000);
      const dayBucket = Math.floor(Date.now() / 86_400_000);
      const [ipOk, globalMinuteOk, globalDayOk] = await Promise.all([
        incrWithinLimit(`rl:claude:ip:${ip}:${minuteBucket}`, PER_IP_PER_MINUTE, 60),
        incrWithinLimit(`rl:claude:global:min:${minuteBucket}`, GLOBAL_PER_MINUTE, 60),
        incrWithinLimit(`rl:claude:global:day:${dayBucket}`, GLOBAL_PER_DAY, 86_400),
      ]);
      if (!ipOk) return { ok: false, reason: "Rate limit exceeded - try again in a minute" };
      if (!globalMinuteOk || !globalDayOk) {
        return { ok: false, reason: "Narrative generation is temporarily rate limited - try again soon" };
      }
      return { ok: true };
    } catch (e) {
      // A Redis outage should degrade gracefully rather than take the feature
      // down — fall back to the in-memory per-instance limiter.
      console.warn("[claude] Redis rate limiter unavailable, using in-memory fallback:", (e as Error).message);
    }
  }
  return checkRateLimitInMemory(ip)
    ? { ok: true }
    : { ok: false, reason: "Rate limit exceeded - try again in a minute" };
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

const TeamResultSchema = z.object({
  teamId: z.string().optional(),
  teamName: z.string().optional(),
  projectedPoints: z.number().nullable().optional(),
  leagueRank: z.number().nullable().optional(),
  madePlayoffs: z.boolean().nullable().optional(),
  topScorer: z.any().optional(),
  goalie: z.any().optional(),
}).passthrough();

const TradedPlayerOutcomeSchema = z.object({
  name: z.string(),
  position: z.string(),
  oldTeamName: z.string(),
  newTeamName: z.string(),
  projectedPts: z.number().nullable().optional(),
  projectedGoals: z.number().nullable().optional(),
  gamesPlayed: z.number().nullable().optional(),
  projectedGAA: z.number().nullable().optional(),
  projectedSVP: z.number().nullable().optional(),
  gamesStarted: z.number().nullable().optional(),
}).passthrough();

const ExecutedTradeSummarySchema = z.object({
  homeTeamName: z.string(),
  partnerTeamName: z.string(),
  outgoing: z.array(AssetSummarySchema),
  incoming: z.array(AssetSummarySchema),
});

const SeasonRecapPayloadSchema = z.object({
  simulationMode: z.string(),
  replaySeason: z.string(),
  rosterMoveWindow: z.string(),
  latestCompleted: z.object({
    season: z.string(),
    stanleyCupChampion: z.object({
      teamId: z.string(),
      teamName: z.string(),
    }),
    connSmythe: z.object({
      name: z.string(),
      teamId: z.string(),
      teamName: z.string(),
    }),
  }).optional(),
  homeTeamName: z.string(),
  partnerTeamName: z.string().nullable().optional(),
  homeTeam: TeamResultSchema.nullable().optional(),
  partnerTeam: TeamResultSchema.nullable().optional(),
  leaders: z.record(z.string(), z.any()),
  playoffBracket: z.any().nullable().optional(),
  playoffTeams: z.array(z.string()),
  tradedPlayerOutcomes: z.array(TradedPlayerOutcomeSchema),
  executedTrades: z.array(ExecutedTradeSummarySchema),
  homeRoster: z.array(z.string()),
  homePhase: z.string().nullable().optional(),
  homeContention: z.object({
    present: z.number(),
    future: z.number(),
  }),
  seasonStartOutlook: z.string(),
  isRebuilding: z.boolean(),
  seed: z.number().nullable().optional(),
  generatedLabel: z.string().optional(),
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
  const tradesSummary = payload.executedTrades.map(t => [
    `OFFSEASON MOVE: ${t.homeTeamName} <-> ${t.partnerTeamName}`,
    `  ${t.homeTeamName} MOVED: ${describeAssets(t.outgoing)}`,
    `  ${t.homeTeamName} ACQUIRED: ${describeAssets(t.incoming)}`,
  ].join("\n")).join("\n\n");

  const tradedOutcomeLines = payload.tradedPlayerOutcomes.map((o) => {
    if (o.position === "G") {
      return `${o.name}: ${o.oldTeamName} -> ${o.newTeamName}, ${o.gamesStarted ?? "?"} starts, ${o.projectedGAA ?? "?"} GAA, ${o.projectedSVP ?? "?"} SV%`;
    }
    return `${o.name}: ${o.oldTeamName} -> ${o.newTeamName}, ${o.gamesPlayed ?? "?"} GP, ${o.projectedGoals ?? "?"} G, ${o.projectedPts ?? "?"} pts`;
  });

  const lockedFacts = {
    simulationMode: payload.simulationMode,
    replaySeason: payload.replaySeason,
    rosterMoveWindow: payload.rosterMoveWindow,
    latestCompleted: payload.latestCompleted,
    homeTeam: payload.homeTeam,
    partnerTeam: payload.partnerTeam,
    leaders: payload.leaders,
    playoffBracket: payload.playoffBracket,
    playoffTeams: payload.playoffTeams,
    tradedPlayerOutcomes: payload.tradedPlayerOutcomes,
    seed: payload.seed,
  };

  return `You are a senior NHL beat reporter writing an end-of-season recap of the PROJECTED ${SEASON.label} NHL season — a forward projection of the upcoming season, NOT a replay of a past one.

Use ONLY the locked pre-calculated JSON and summaries below. Do not estimate, calculate, infer missing values, invent injuries, invent off-ice stories, or change standings/playoff results. Treat executed deals as ${payload.rosterMoveWindow} roster moves, never as trade-deadline moves. If a fact is not in the locked data, omit it.

LOCKED JSON:
${JSON.stringify(lockedFacts, null, 2)}

LOCKED MOVE SUMMARY:
${tradesSummary || "No executed trades supplied."}

${payload.homeTeamName} OPENING-NIGHT ROSTER AFTER MOVES (top 12):
${payload.homeRoster.join("\n") || "No roster summary supplied."}
Phase entering ${SEASON.label}: ${payload.homePhase ?? "Unknown"}
Contention ratings (X-NAV derived): Present ${payload.homeContention.present.toFixed(1)}/10 · Future ${payload.homeContention.future.toFixed(1)}/10
Season-start outlook: ${payload.seasonStartOutlook}

TRADED PLAYER OUTCOMES (LOCKED):
${tradedOutcomeLines.length > 0 ? tradedOutcomeLines.join("\n") : "No traded player stat outcomes available."}

LOCKED FACTS:
- Latest completed NHL season: ${payload.latestCompleted?.season ?? payload.replaySeason}.
- This recap covers the PROJECTED ${SEASON.label} season (the upcoming season). The line above is the most recent COMPLETED season — do not conflate them.
- Latest Stanley Cup champion: ${payload.latestCompleted?.stanleyCupChampion.teamName ?? "Unknown"}.
- Latest Conn Smythe winner: ${payload.latestCompleted?.connSmythe.name ?? "Unknown"} (${payload.latestCompleted?.connSmythe.teamName ?? "Unknown"}).
- Florida Panthers did NOT win the ${payload.latestCompleted?.season ?? payload.replaySeason} Cup.
- Utah Hockey Club is now the Utah Mammoth (UTA). Arizona Coyotes do not exist.
- These are ${payload.rosterMoveWindow} moves. Never describe them as deadline deals or say a team sat at any ranking at the deadline.
- Conn Smythe must be from the Stanley Cup champion listed in LOCKED JSON.

NHL STRUCTURE:
Eastern: Atlantic (BOS,BUF,DET,FLA,MTL,OTT,TBL,TOR) · Metro (CAR,CBJ,NJD,NYI,NYR,PHI,PIT,WSH)
Western: Central (UTA,CHI,COL,DAL,MIN,NSH,STL,WPG) · Pacific (ANA,CGY,EDM,LAK,SEA,SJS,VAN,VGK)

Write 6 sections. Every number comes from the locked data above — do not estimate, approximate, or invent stats.

**THE TRADE, ONE YEAR LATER**
3-4 sentences. Frame the deal as an offseason/opening-night roster move. Use the locked traded-player outcomes above for every moved player you discuss. If a traded player's projected stat line is not listed, describe the team-level effect only.

**${payload.homeTeamName.toUpperCase()}'S SEASON**
${payload.isRebuilding
  ? `4-5 sentences. Use the exact finish position from the locked projection. Paint the narrative around those numbers — low point, bright spot, draft pick significance.`
  : `4-5 sentences. Use the exact finish and playoff result from the locked bracket. Describe one defining result from the listed bracket or standings.`}

**AROUND THE LEAGUE**
4-5 sentences. Use 3 storylines from the standings, bracket, awards, and leader facts above. Do not invent injuries or off-ice stories.

**THE YEAR IN NUMBERS**
Use ONLY the numbers provided. Do not approximate, estimate, or calculate anything not given here.

**THE DRAFT LOTTERY**
${payload.homeTeam && payload.homeTeam.madePlayoffs === false
  ? `${payload.homeTeamName} missed the playoffs. Use the locked league rank and points from JSON. Do not name a prospect unless listed above.`
  : `Use the locked draftLottery team from JSON. Do not name a prospect unless listed above.`}

**VERDICT**
Two sentences per team — what went right or wrong, definitive judgment on the GM's call.

Simulation #${payload.seed ?? "—"} · ${payload.generatedLabel ?? ""}. Write like someone who watched every game.`;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rate = await checkRateLimit(ip);
  if (!rate.ok) {
    return NextResponse.json({ error: rate.reason }, { status: 429 });
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
