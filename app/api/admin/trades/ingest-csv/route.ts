import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/db/client";
import { draftPickOverrides } from "@/app/db/schema";
import { ensureNewTables } from "@/app/db/ensure-schema";
import { requireAdmin } from "@/app/lib/admin-auth";
import { redis } from "@/app/lib/redis";
import { SEASON } from "@/app/lib/season-config";
import { clearTeamCaches } from "@/app/lib/team-cache";
import { assembleCanonicalRoster } from "@/app/lib/roster-assembly";
import { POST as evaluatePost } from "@/app/api/evaluate/route";
import { createFrozenTrade, type TradeFreezeEvaluator } from "@/app/lib/trades";
import { parseTradeCsv, groupTradeRows, resolveTrades, type ResolvedTrade } from "@/app/lib/trade-csv";
import type { Asset, EvaluateResponse, Team } from "@/app/lib/trade-types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ── D1 — CSV trade ingestion ─────────────────────────────────────
// POST { csv, dryRun?, publish? }: parse a CSV export of completed
// trades, resolve every asset against the canonical roster, then (unless
// dryRun) create a frozen, published trade record per grouped trade AND
// transfer every moved draft pick in draft_pick_overrides — the two
// manual steps this replaces. Always returns a per-trade report.

const BodySchema = z.object({
  csv: z.string().min(1),
  dryRun: z.boolean().optional(),
  publish: z.boolean().optional(),
});

const evaluator: TradeFreezeEvaluator = async (input) => {
  const response = await evaluatePost(new Request("http://localhost/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assets: [...input.outgoing, ...input.incoming],
      tradeOutgoing: input.outgoing,
      tradeIncoming: input.incoming,
      homeTeam: input.homeTeam,
      partnerTeam: input.partnerTeam,
      allHomeRoster: input.allHomeRoster,
      allPartnerRoster: input.allPartnerRoster,
      capCeiling: SEASON.capCeiling,
      runTrade: true,
    }),
  }));
  if (!response.ok) throw new Error(`Trade evaluation failed (HTTP ${response.status})`);
  const evaluation = await response.json() as EvaluateResponse;
  if (!evaluation.verdict) throw new Error("Trade evaluation returned no verdict");
  return { navMap: evaluation.navMap, verdict: evaluation.verdict };
};

interface TradeReport {
  key: string;
  date: string;
  teams: string;
  status: "created" | "skipped" | "would-create";
  tradeId?: string;
  picksTransferred: number;
  warnings: string[];
  errors: string[];
}

async function transferPicks(trade: ResolvedTrade): Promise<void> {
  await ensureNewTables();
  for (const pick of trade.pickTransfers) {
    await db
      .insert(draftPickOverrides)
      .values({
        id: pick.pickId,
        currentOwnerId: pick.currentOwnerId,
        originalOwnerId: pick.originalOwnerId,
        round: pick.round,
        year: pick.year,
        isProtected: false,
        conditions: pick.conditions,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: draftPickOverrides.id,
        set: {
          currentOwnerId: pick.currentOwnerId,
          conditions: pick.conditions,
          updatedAt: Date.now(),
        },
      });
  }
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Body must be { csv, dryRun?, publish? }" }, { status: 400 });
  }
  const { csv, dryRun = false, publish = true } = parsed.data;

  const { rows, issues: parseIssues } = parseTradeCsv(csv);
  const { trades: groups, issues: groupIssues } = groupTradeRows(rows);
  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid rows in CSV", issues: [...parseIssues, ...groupIssues] }, { status: 400 });
  }

  // Resolve against the live canonical league.
  const roster = await assembleCanonicalRoster();
  const teams = (roster.teams as Team[]) ?? [];
  const teamById = new Map(teams.map(t => [t.id, t]));
  const resolved = resolveTrades(groups, {
    players: roster.players as Array<Record<string, any>>,
    teamIds: new Set(teams.map(t => t.id)),
    firstTradablePickYear: SEASON.firstTradablePickYear,
  });

  const reports: TradeReport[] = [];
  let createdCount = 0;

  for (const trade of resolved) {
    const report: TradeReport = {
      key: trade.key,
      date: trade.date,
      teams: `${trade.teamA} ↔ ${trade.teamB}`,
      status: trade.errors.length > 0 ? "skipped" : dryRun ? "would-create" : "created",
      picksTransferred: trade.pickTransfers.length,
      warnings: trade.warnings,
      errors: trade.errors,
    };

    if (trade.errors.length === 0 && !dryRun) {
      try {
        const teamA = teamById.get(trade.teamA)!;
        const teamB = teamById.get(trade.teamB)!;
        const rosterOf = (id: string) =>
          (roster.players as Asset[]).filter(p => p.teamId === id && p.position !== "Pick");
        const id = `trade-${trade.date}-${crypto.randomUUID().slice(0, 8)}`;

        const record = await createFrozenTrade({
          id,
          executedDate: trade.date,
          source: "scraped",
          sourceUrl: null,
          season: SEASON.label,
          sides: [
            { team: teamA, assetsGiven: trade.sideA.map(a => ({ kind: a.kind, asset: a.asset as unknown as Asset })), fullRoster: rosterOf(trade.teamA) },
            { team: teamB, assetsGiven: trade.sideB.map(a => ({ kind: a.kind, asset: a.asset as unknown as Asset })), fullRoster: rosterOf(trade.teamB) },
          ],
          conditions: trade.conditions,
          published: publish,
          rosterMutating: true,
        }, evaluator);

        await transferPicks(trade);
        report.tradeId = record.id;
        createdCount++;
      } catch (error) {
        report.status = "skipped";
        report.errors = [...report.errors, error instanceof Error ? error.message : "Failed to create trade"];
      }
    }

    reports.push(report);
  }

  if (createdCount > 0) {
    await clearTeamCaches(redis, db);
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    created: createdCount,
    total: resolved.length,
    issues: [...parseIssues, ...groupIssues],
    trades: reports,
  });
}
