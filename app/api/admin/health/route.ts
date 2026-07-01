import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { requireAdmin } from "@/app/lib/admin-auth";
import { SEASON } from "@/app/lib/season-config";

export const dynamic = "force-dynamic";

interface SourceCheck {
  name: string;
  status: "ok" | "degraded" | "down";
  detail: string;
  latencyMs?: number;
}

async function checkSource(
  name: string,
  fn: () => Promise<string>,
): Promise<SourceCheck> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { name, status: "ok", detail, latencyMs: Date.now() - t0 };
  } catch (err) {
    return {
      name,
      status: "down",
      detail: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - t0,
    };
  }
}

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const checks = await Promise.all([
    checkSource("Database", async () => {
      const rows = await db.select({ id: playersTable.id }).from(playersTable);
      return `${rows.length} players`;
    }),

    checkSource("NHL API (roster)", async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(
          "https://api-web.nhle.com/v1/roster/TOR/current",
          { signal: ctrl.signal, cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const count =
          (data?.forwards?.length ?? 0) +
          (data?.defensemen?.length ?? 0) +
          (data?.goalies?.length ?? 0);
        return `${count} players on TOR roster`;
      } finally {
        clearTimeout(t);
      }
    }),

    checkSource("NHL API (stats)", async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(
          `https://api.nhle.com/stats/rest/en/team/summary?cayenneExp=seasonId=${SEASON.nhleSeasonId}`,
          { signal: ctrl.signal, cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return `${data?.data?.length ?? 0} teams in standings`;
      } finally {
        clearTimeout(t);
      }
    }),

    checkSource("MoneyPuck (skaters CSV)", async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(
          `https://moneypuck.com/moneypuck/playerData/seasonSummary/${SEASON.mpSeason}/regular/skaters.csv`,
          {
            signal: ctrl.signal,
            cache: "no-store",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const rows = text.split("\n").filter(Boolean).length - 1;
        return `${rows} skater rows`;
      } finally {
        clearTimeout(t);
      }
    }),

    checkSource("CapWages", async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch("https://capwages.com/players/active", {
          signal: ctrl.signal,
          cache: "no-store",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const match = html.match(
          /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
        );
        if (!match) throw new Error("__NEXT_DATA__ not found — page structure changed");
        const data = JSON.parse(match[1]);
        const players = data?.props?.pageProps?.playersArray;
        if (!Array.isArray(players)) throw new Error("playersArray missing from page data");
        return `${players.length} active players`;
      } finally {
        clearTimeout(t);
      }
    }),

    checkSource("Static baselines", async () => {
      const fs = require("fs");
      const path = require("path");
      const mpFile = path.join(process.cwd(), "app/data/moneypuck_baselines.json");
      const tbFile = path.join(process.cwd(), "app/data/team_baselines.json");
      const mp = JSON.parse(fs.readFileSync(mpFile, "utf-8"));
      const tb = JSON.parse(fs.readFileSync(tbFile, "utf-8"));
      return `${Object.keys(mp).length} player baselines, ${Object.keys(tb).length} team baselines`;
    }),
  ]);

  const allOk = checks.every((c) => c.status === "ok");

  return NextResponse.json({
    overall: allOk ? "healthy" : "degraded",
    checkedAt: new Date().toISOString(),
    season: SEASON.label,
    sources: checks,
  });
}
